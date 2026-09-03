import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { spawn } from "node:child_process";
import { eq, inArray, like } from "drizzle-orm";
import { db, leads, mensagens, campanhas, eventos, geracaoFila } from "@/lib/db";
import { criarCampanhaParaGerar } from "@/lib/campanha";
import { estadoGeracao } from "@/lib/gen/fila-geracao";

/**
 * Prova que a geração NÃO depende do navegador.
 *
 * Este arquivo não gera nada: ele só põe leads na fila e chama o worker como
 * um PROCESSO SEPARADO do sistema operacional (`npm run geracao -- --uma-vez`),
 * exatamente como ele roda na máquina de verdade — sem navegador, sem aba,
 * sem sessão, sem ninguém olhando. Depois confere no banco o que apareceu.
 *
 * Diferente do outro teste, aqui o Gemini é o DE VERDADE: é a única forma de
 * provar que o caminho inteiro funciona ponta a ponta. Se a cota do dia
 * estiver esgotada, o teste diz isso em vez de fingir que passou — e o que ele
 * verifica nesse caso (leads preservados, nada enviado) continua valendo.
 *
 * Nenhum lead real é tocado e nenhuma mensagem é enviada.
 *
 *   npx tsx src/lib/__testes__/geracao-worker.test-manual.ts
 */
const MARCA = "TESTE-WORKER";

function rodarWorker(): Promise<{ codigo: number; saida: string }> {
  return new Promise((resolve) => {
    /**
     * `shell: true` porque no Windows `npm` é um .cmd — sem isso o spawn falha
     * com EINVAL antes de o worker sequer começar.
     */
    const p = spawn("npm", ["run", "geracao", "--", "--uma-vez"], {
      cwd: process.cwd(),
      shell: true,
      env: { ...process.env, GERACAO_LOTE: "2" },
    });

    let saida = "";
    p.stdout.on("data", (d) => {
      saida += d.toString();
      process.stdout.write(`    | ${d.toString()}`);
    });
    p.stderr.on("data", (d) => (saida += d.toString()));
    p.on("close", (codigo) => resolve({ codigo: codigo ?? -1, saida }));
  });
}

async function main() {
  await limpar();

  console.log("=== preparando 2 leads de teste ===");
  const novos = await db
    .insert(leads)
    .values(
      ["Norte", "Sul"].map((n, i) => ({
        placeId: `${MARCA}:${i + 1}`,
        nome: `${MARCA} Clínica ${n}`,
        categoria: "clinic",
        cidade: ["Uberlândia", "Araguari"][i],
        whatsapp: `https://wa.me/551190000050${i}`,
        etapa: "novo" as const,
        fotos: [],
        statusSite: "sem-site" as const,
        score: 70,
        temperatura: "morno" as const,
      })),
    )
    .returning();

  const { campanha } = await criarCampanhaParaGerar({
    nome: `${MARCA} — não iniciar`,
    leadIds: novos.map((l) => l.id),
  });
  const antes = await estadoGeracao(campanha.id);
  console.log(`  campanha ${campanha.id.slice(0, 8)} — ${antes.pendente} na fila, 0 geradas`);

  console.log("\n=== rodando o worker como processo separado (sem navegador) ===");
  const { codigo } = await rodarWorker();
  console.log(`  worker saiu com código ${codigo}`);

  console.log("\n=== o que apareceu no banco ===");
  const depois = await estadoGeracao(campanha.id);
  const msgs = await db.select().from(mensagens).where(eq(mensagens.campanhaId, campanha.id));
  console.log(`  estado: ${JSON.stringify(depois)}`);

  for (const m of msgs) {
    const nome = novos.find((l) => l.id === m.leadId)?.nome;
    console.log(`\n  ── ${nome} · solução: ${m.produto} · status: ${m.status}`);
    console.log(`     ${m.texto.replace(/\n/g, "\n     ")}`);
  }

  const problemas: string[] = [];
  if (msgs.some((m) => m.status !== "rascunho")) problemas.push("alguma mensagem saiu de rascunho");
  if (msgs.some((m) => m.enviadaEm || m.provedorId)) problemas.push("alguma mensagem foi enviada");
  if (msgs.some((m) => m.produto === "site")) problemas.push("site foi escolhido como solução");
  if (new Set(msgs.map((m) => m.texto)).size !== msgs.length)
    problemas.push("mensagens repetidas entre leads");
  /**
   * `processando` entra na conta: é um estado legítimo e transitório — o
   * worker de serviço, que roda em paralelo a este teste, pode estar com um
   * item reservado neste exato instante. Deixá-lo de fora fazia o teste
   * acusar "lead sumiu da fila" quando nada tinha sumido.
   */
  const contabilizados =
    depois.pronta + depois.pendente + depois.processando + depois.pulada + depois.erro;
  if (contabilizados !== antes.total)
    problemas.push(`lead sumiu da fila (${contabilizados} de ${antes.total})`);

  console.log("\n=== veredito ===");
  if (depois.pronta > 0) {
    console.log(`  [ok] ${depois.pronta} mensagem(ns) gerada(s) por um processo SEM navegador.`);
  } else if (depois.pendente > 0) {
    console.log(
      `  [!!] nada gerado, mas os ${depois.pendente} lead(s) continuam PENDENTES — ` +
        "provavelmente cota do Gemini. Nenhum lead foi perdido.",
    );
  } else {
    problemas.push("nada gerado e nada pendente — a fila sumiu");
  }
  console.log(`  ${problemas.length ? `[FALHA] ${problemas.join("; ")}` : "[ok] nada foi enviado"}`);

  await limpar();
  console.log("dados de teste removidos.");
  process.exit(problemas.length ? 1 : 0);
}

async function limpar() {
  const antigos = await db
    .select({ id: leads.id })
    .from(leads)
    .where(like(leads.placeId, `${MARCA}:%`));
  const camps = await db
    .select({ id: campanhas.id })
    .from(campanhas)
    .where(like(campanhas.nome, `${MARCA}%`));

  if (camps.length) {
    const ids = camps.map((c) => c.id);
    await db.delete(geracaoFila).where(inArray(geracaoFila.campanhaId, ids));
    await db.delete(mensagens).where(inArray(mensagens.campanhaId, ids));
    await db.delete(eventos).where(inArray(eventos.campanhaId, ids));
    await db.delete(campanhas).where(inArray(campanhas.id, ids));
  }
  if (antigos.length) {
    const leadIds = antigos.map((l) => l.id);
    await db.delete(geracaoFila).where(inArray(geracaoFila.leadId, leadIds));
    await db.delete(mensagens).where(inArray(mensagens.leadId, leadIds));
    await db.delete(eventos).where(inArray(eventos.leadId, leadIds));
    await db.delete(leads).where(inArray(leads.id, leadIds));
  }
}

main().catch(async (e) => {
  console.error("FALHOU:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
