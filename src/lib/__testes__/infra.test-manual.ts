import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, leads, mensagens, campanhas, eventos, geracaoFila, configuracoes } from "@/lib/db";
import { lerConfig, podeEnviarAgora, enviadasHoje, type Bloqueio } from "@/lib/fila";
import { iniciar, pausar } from "@/lib/campanha";
import { estadoGeracao } from "@/lib/gen/fila-geracao";

/**
 * Testa as garantias do lado do ENVIO e da infraestrutura da máquina.
 *
 * REGRA DESTE ARQUIVO: `enviarProxima` NUNCA é chamada. Nem uma vez, nem "para
 * ver o que acontece". O que se testa aqui é o PORTEIRO (`podeEnviarAgora`),
 * que é quem decide se alguma coisa pode sair — e testar o porteiro não exige
 * abrir a porta. Chamar a função de envio e torcer para alguma trava segurar
 * seria apostar o WhatsApp de uma pessoa real num teste.
 *
 * Os leads criados aqui têm número fictício e são apagados no fim.
 *
 *   npm run test:infra
 */
const MARCA = "TESTE-INFRA";

let passou = 0;
let falhou = 0;
function ok(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  [PASS] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  } else {
    falhou++;
    console.log(`  [FAIL] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

/** `Bloqueio` é união: só o ramo bloqueado carrega `motivo`. */
const motivoDe = (b: Bloqueio): string => (b.pode ? "(liberado)" : b.motivo);

async function responde(url: string, ms = 5000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function main() {
  const cfg0 = (await db.select().from(configuracoes).limit(1))[0];
  /** Fila real do usuario antes do teste — o teste nao pode mexer nela. */
  const filaAntes = (await estadoGeracao()).total;
  /** Quantas o SISTEMA REAL ja enviou hoje. O teste nao pode somar a isto. */
  const enviadasAntes = await enviadasHoje();
  const automacaoOriginal = cfg0.automacaoAtiva;
  const limiteOriginal = cfg0.limiteDiario;
  await limpar();

  console.log("\n=== A. SERVIÇOS DA MÁQUINA ===");
  const bridge = await responde("http://localhost:8081/status");
  const workerIa = await responde("http://127.0.0.1:8477/");
  ok("BRIDGE responde em localhost:8081", Boolean(bridge), bridge ? `estado: ${bridge.estado}` : "");
  ok("WORKER IA responde na porta de status", Boolean(workerIa), workerIa ? `ciclos: ${workerIa.ciclos}` : "");
  ok("TUNNEL: exatamente um cloudflared vivo", contarCloudflared() === 1, `${contarCloudflared()} processo(s)`);

  const urlPublica = cfg0.provedorBaseUrl;
  const publico = urlPublica ? await responde(`${urlPublica}/status`, 9000) : null;
  ok("URL pública do banco responde (sync do tunnel funcionando)", Boolean(publico), urlPublica ?? "sem URL");

  console.log("\n=== B. INSTÂNCIA ÚNICA ===");
  // Subir um segundo worker persistente deve ser recusado pela porta ocupada.
  let saidaSegundo = "";
  try {
    saidaSegundo = execSync(`"C:\\Program Files\\nodejs\\npx.cmd" tsx src/scripts/worker-geracao.ts`, {
      encoding: "utf8",
      timeout: 90_000,
    });
  } catch (e) {
    saidaSegundo = String((e as { stdout?: string }).stdout ?? "");
  }
  ok(
    "segundo worker se recusa a subir (porta 8477 ocupada)",
    saidaSegundo.includes("já existe um worker"),
    saidaSegundo.trim().split("\n").pop()?.slice(0, 90) ?? "",
  );
  ok("worker IA continua vivo depois disso", Boolean(await responde("http://127.0.0.1:8477/")));

  console.log("\n=== C. SEGREDOS NOS LOGS ===");
  const chave = process.env.GEMINI_API_KEY ?? "";
  const dbUrl = process.env.DATABASE_URL ?? "";
  const apiToken = process.env.API_TOKEN ?? "";
  const logs = [
    "geracao.log",
    "../../whatsapp-node-completo/whatsapp-node/tunnel-sync.log",
  ].filter((p) => existsSync(p));
  let vazou = false;
  for (const p of logs) {
    const txt = readFileSync(p, "utf8");
    for (const [nome, segredo] of [
      ["GEMINI_API_KEY", chave],
      ["DATABASE_URL", dbUrl],
      ["API_TOKEN", apiToken],
    ] as const) {
      if (segredo && segredo.length > 12 && txt.includes(segredo)) {
        vazou = true;
        console.log(`  [FAIL] ${nome} aparece em ${p}`);
      }
    }
  }
  ok(`nenhum segredo nos logs (${logs.length} arquivo(s) lidos)`, !vazou);

  console.log("\n=== D. PREPARO: campanha de teste ===");
  const novos = await db
    .insert(leads)
    .values(
      ["Um", "Dois", "Tres"].map((n, i) => ({
        placeId: `${MARCA}:${i + 1}`,
        nome: `${MARCA} Empresa ${n}`,
        categoria: "clinic",
        cidade: "Uberlândia",
        whatsapp: `https://wa.me/551190000060${i}`,
        etapa: "novo" as const,
        fotos: [],
        statusSite: "sem-site" as const,
        score: 60,
        temperatura: "morno" as const,
      })),
    )
    .returning();

  const [camp] = await db
    .insert(campanhas)
    .values({ nome: `${MARCA} — não iniciar`, status: "rascunho" })
    .returning();

  for (const [i, l] of novos.entries()) {
    await db.insert(mensagens).values({
      leadId: l.id,
      campanhaId: camp.id,
      texto: `Mensagem de teste ${i + 1} para ${l.nome}.`,
      produto: "sistema-sob-medida",
      origem: "ia",
      status: "rascunho",
      rodada: 0,
      prioridade: 50 - i,
    });
  }
  ok("3 mensagens nascem em rascunho (fora da fila de envio)", (await conta(camp.id, "rascunho")) === 3);

  console.log("\n=== E. APROVAÇÃO ===");
  const r = await iniciar(camp.id);
  if (r.ok) {
    ok("aprovar move rascunho -> aprovada de uma vez", r.aprovadas === 3, `${r.aprovadas} aprovadas`);
    ok("nenhuma foi enviada ao aprovar", (await conta(camp.id, "enviada")) === 0);
  } else {
    // Recusar por integração incompleta também é comportamento correto.
    ok("aprovação recusada com motivo claro (integração)", Boolean(r.erro), r.erro);
    await db
      .update(mensagens)
      .set({ status: "aprovada", aprovadaEm: new Date() })
      .where(eq(mensagens.campanhaId, camp.id));
    await db.update(campanhas).set({ status: "rodando" }).where(eq(campanhas.id, camp.id));
  }

  console.log("\n=== F. PORTEIRO DE ENVIO (podeEnviarAgora) ===");
  // F1 — automação desligada
  await db.update(configuracoes).set({ automacaoAtiva: false }).where(eq(configuracoes.id, "default"));
  let b = await podeEnviarAgora(await lerConfig());
  ok("automação desligada BLOQUEIA o envio", !b.pode, motivoDe(b));

  // F2 — teto diário zerado
  await db
    .update(configuracoes)
    .set({ automacaoAtiva: true, limiteDiario: 0 })
    .where(eq(configuracoes.id, "default"));
  b = await podeEnviarAgora(await lerConfig());
  /**
   * Este NAO isola o teto diario, e o nome diz isso de proposito.
   * `podeEnviarAgora` checa integracao ANTES do teto, e a integracao esta
   * incompleta agora (WhatsApp desconectado). Afirmar "o teto bloqueou"
   * seria dar credito a trava errada — o teste provaria uma coisa e o nome
   * diria outra. O que da para afirmar honestamente e que com teto zerado
   * NADA sai, e e isso que esta escrito.
   */
  ok("com teto zerado, nada sai (trava reportada abaixo)", !b.pode, motivoDe(b));

  // F3 — teto liberado: o que resta a bloquear é a integração/intervalo
  await db.update(configuracoes).set({ limiteDiario: limiteOriginal }).where(eq(configuracoes.id, "default"));
  b = await podeEnviarAgora(await lerConfig());
  console.log(`    (com automação ligada e teto normal: pode=${b.pode}${b.pode ? "" : ` — ${motivoDe(b)}`})`);

  console.log("\n=== G. STOP ===");
  const antesDoStop = await conta(camp.id, "aprovada");
  // O STOP da tela: automação desligada; a fila NÃO é tocada.
  await db.update(configuracoes).set({ automacaoAtiva: false }).where(eq(configuracoes.id, "default"));
  await pausar(camp.id);
  b = await podeEnviarAgora(await lerConfig());
  const depoisDoStop = await conta(camp.id, "aprovada");
  ok("STOP bloqueia novos envios na hora", !b.pode, motivoDe(b));
  ok(
    "STOP NÃO destrói a fila",
    depoisDoStop === antesDoStop && antesDoStop > 0,
    `${antesDoStop} -> ${depoisDoStop} aprovadas`,
  );
  ok("STOP não cancelou a campanha", (await statusCampanha(camp.id)) === "pausada");

  console.log("\n=== H. CANCELAR É AÇÃO SEPARADA ===");
  const { parar } = await import("@/lib/campanha");
  const cancel = await parar(camp.id);
  ok("cancelar campanha é explícito e destrói a fila dela", cancel.canceladas === antesDoStop, `${cancel.canceladas} canceladas`);
  ok("mensagens cancelas continuam no banco (histórico intacto)", (await conta(camp.id, "cancelada")) === antesDoStop);

  console.log("\n=== I. RESTAURAÇÃO ===");
  await db
    .update(configuracoes)
    .set({ automacaoAtiva: automacaoOriginal, limiteDiario: limiteOriginal })
    .where(eq(configuracoes.id, "default"));
  const cfgFim = (await db.select().from(configuracoes).limit(1))[0];
  ok(
    "configuração real restaurada",
    cfgFim.automacaoAtiva === automacaoOriginal && cfgFim.limiteDiario === limiteOriginal,
    `automacaoAtiva=${cfgFim.automacaoAtiva} limite=${cfgFim.limiteDiario}`,
  );
  /**
   * Compara com o ANTES, nao com zero. Exigir "0 enviadas hoje" era suposicao
   * sobre a operacao, nao sobre o codigo: assim que voce rodou a primeira
   * campanha de verdade, o teste passou a acusar falha sem nada ter quebrado.
   */
  const enviadasDepois = await enviadasHoje();
  ok(
    "o teste nao enviou nenhuma mensagem",
    enviadasDepois === enviadasAntes,
    `enviadas hoje: ${enviadasAntes} -> ${enviadasDepois}`,
  );

  /**
   * Compara com o ANTES, nao com zero. Exigir fila vazia era uma suposicao
   * sobre a maquina, nao sobre o codigo: assim que existiu campanha real
   * esperando geracao, o teste passou a acusar falha sem nada ter quebrado.
   */
  const ger = await estadoGeracao();
  ok(
    "fila de geração real intacta (o teste não adicionou nem removeu nada)",
    ger.total === filaAntes,
    `antes=${filaAntes} depois=${ger.total}`,
  );

  await limpar();
  console.log(`\n${passou} PASS, ${falhou} FAIL. Dados de teste removidos.`);
  process.exit(falhou ? 1 : 0);
}

function contarCloudflared(): number {
  try {
    return execSync('tasklist /fi "imagename eq cloudflared.exe" /fo csv /nh', { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((l) => /^"cloudflared\.exe"/i.test(l)).length;
  } catch {
    return 0;
  }
}

async function conta(campanhaId: string, status: string) {
  const r = await db
    .select({ id: mensagens.id })
    .from(mensagens)
    .where(and(eq(mensagens.campanhaId, campanhaId), eq(mensagens.status, status as never)));
  return r.length;
}

async function statusCampanha(id: string) {
  const [c] = await db.select({ s: campanhas.status }).from(campanhas).where(eq(campanhas.id, id));
  return c?.s;
}

async function limpar() {
  const camps = await db.select({ id: campanhas.id }).from(campanhas).where(like(campanhas.nome, `${MARCA}%`));
  const antigos = await db.select({ id: leads.id }).from(leads).where(like(leads.placeId, `${MARCA}:%`));
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
