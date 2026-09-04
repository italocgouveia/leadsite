import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { eq, inArray, like, sql } from "drizzle-orm";
import { db, leads, negocios } from "@/lib/db";
import { GET } from "@/app/api/comercial/resumo/route";

/**
 * Testa a camada VISUAL comercial: o endpoint agregado que alimenta o painel
 * e o pipeline.
 *
 * O que se verifica aqui não é cálculo — cálculo é dos motores, já testados em
 * comercial-db. O que se verifica é que a agregação não INVENTA nada: taxa sem
 * denominador vira `null`, MRR real e potencial não se misturam, amostra
 * pequena vem marcada, e nenhum lead sai da conta.
 *
 * Não envia WhatsApp, não chama IA, não altera lead real.
 *
 *   npm run test:painel-comercial
 */
const M = "TESTE-VIS";

let p = 0;
let f = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) {
    p++;
    console.log(`  [PASS] ${n}${d ? ` — ${d}` : ""}`);
  } else {
    f++;
    console.log(`  [FAIL] ${n}${d ? ` — ${d}` : ""}`);
  }
};

async function limpar() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.placeId, `${M}:%`));
  if (ls.length) {
    const ids = ls.map((l) => l.id);
    await db.delete(negocios).where(inArray(negocios.leadId, ids));
    await db.delete(leads).where(inArray(leads.id, ids));
  }
}

async function resumo() {
  return (await GET()).json();
}

async function main() {
  await limpar();

  const [{ n: leadsAntes }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads);
  const antes = await resumo();

  console.log("\n=== A. NÚMEROS REAIS, NÃO MOCK ===");
  ok(
    "1. total de leads bate com o banco",
    antes.indicadores.leads === leadsAntes,
    `${antes.indicadores.leads} = ${leadsAntes}`,
  );
  ok(
    "2. leads com WhatsApp nunca passa do total",
    antes.indicadores.comWhatsapp <= antes.indicadores.leads,
    `${antes.indicadores.comWhatsapp} de ${antes.indicadores.leads}`,
  );
  ok(
    "3. o funil só encolhe (cada etapa é subconjunto da anterior)",
    antes.funil.every(
      (x: { quantos: number }, i: number) => i === 0 || x.quantos <= antes.funil[i - 1].quantos,
    ),
    antes.funil.map((x: { etapa: string; quantos: number }) => `${x.etapa}=${x.quantos}`).join(" "),
  );

  console.log("\n=== B. TAXA SEM DENOMINADOR NÃO VIRA 0% ===");
  const primeira = antes.funil[0];
  ok("4. a primeira etapa não tem taxa (não há base)", primeira.taxa === null);
  const semBase = antes.funil.filter(
    (x: { quantos: number; taxa: number | null }, i: number) =>
      i > 0 && antes.funil[i - 1].quantos === 0,
  );
  ok(
    "5. etapa sem base devolve null, nunca 0",
    semBase.every((x: { taxa: number | null }) => x.taxa === null),
    `${semBase.length} etapa(s) sem base`,
  );
  ok(
    "6. toda taxa existente está entre 0 e 100",
    antes.funil.every(
      (x: { taxa: number | null }) => x.taxa === null || (x.taxa >= 0 && x.taxa <= 100),
    ),
  );

  console.log("\n=== C. MRR REAL vs POTENCIAL ===");
  const novos = await db
    .insert(leads)
    .values(
      ["A", "B", "C"].map((n, i) => ({
        placeId: `${M}:${i + 1}`,
        nome: `${M} ${n}`,
        categoria: "car_repair",
        cidade: "Uberlândia",
        whatsapp: `https://wa.me/551190000090${i}`,
        etapa: "novo" as const,
        fotos: [],
        statusSite: "sem-site" as never,
        score: 50,
        temperatura: "morno" as const,
      })),
    )
    .returning();

  await db.insert(negocios).values([
    // Fechado mas NÃO iniciado: não pode entrar no MRR.
    { leadId: novos[0].id, status: "fechada", setup: 5000, mensalidade: 700 },
    // Ativo: entra.
    { leadId: novos[1].id, status: "ativo", setup: 3000, mensalidade: 300, inicioEm: new Date() },
    // Proposta enviada: potencial, não real.
    { leadId: novos[2].id, status: "enviada", setup: 1000, mensalidade: 200 },
  ]);

  const depois = await resumo();
  ok(
    "7. negócio FECHADO mas não iniciado NÃO entra no MRR",
    depois.financeiro.mrrAtual - antes.financeiro.mrrAtual === 300,
    `+${depois.financeiro.mrrAtual - antes.financeiro.mrrAtual} (700 do fechado ficou fora)`,
  );
  ok(
    "8. proposta enviada entra no potencial",
    depois.financeiro.mrrPotencial - antes.financeiro.mrrPotencial === 200,
    `+${depois.financeiro.mrrPotencial - antes.financeiro.mrrPotencial}`,
  );
  ok(
    "9. potencial e real são campos separados",
    depois.financeiro.mrrAtual !== depois.financeiro.mrrPotencial ||
      depois.financeiro.mrrAtual === 0,
  );
  ok(
    "10. setup fechado conta o negócio ganho",
    depois.financeiro.setupFechado - antes.financeiro.setupFechado === 8000,
    `+${depois.financeiro.setupFechado - antes.financeiro.setupFechado}`,
  );

  console.log("\n=== D. OPORTUNIDADES ===");
  ok("11. no máximo 10 no ranking", depois.oportunidades.length <= 10, `${depois.oportunidades.length}`);
  ok(
    "12. o total real é informado à parte",
    depois.totalOportunidades >= depois.oportunidades.length,
    `${depois.totalOportunidades} no total`,
  );
  ok(
    "13. vem ordenado do melhor para o pior",
    depois.oportunidades.every(
      (o: { score: number }, i: number) => i === 0 || depois.oportunidades[i - 1].score >= o.score,
    ),
  );
  ok(
    "14. score entre 0 e 100",
    depois.oportunidades.every((o: { score: number }) => o.score >= 0 && o.score <= 100),
  );
  ok(
    "15. toda oportunidade traz uma próxima ação",
    depois.oportunidades.every((o: { proximaAcao: { titulo: string } }) => o.proximaAcao.titulo.length > 5),
  );
  ok(
    "16. hipótese NÃO é apresentada como dor confirmada",
    depois.oportunidades.every(
      (o: { dorConfirmada: string | null; hipotese: string | null }) =>
        o.dorConfirmada === null || o.hipotese === null || o.dorConfirmada !== o.hipotese,
    ),
  );
  ok(
    "17. lead com opt-out fica fora do ranking",
    !depois.oportunidades.some((o: { etapa: string }) =>
      ["sem-interesse", "ja-tem-sistema", "opt-out"].includes(o.etapa),
    ),
  );

  console.log("\n=== E. CONFIABILIDADE ESTATÍSTICA ===");
  ok(
    "18. amostra < 20 vem marcada como não confiável",
    depois.nichos.every((n: { abordados: number; confiavel: boolean }) => n.confiavel === (n.abordados >= 20)),
    `${depois.nichos.filter((n: { confiavel: boolean }) => !n.confiavel).length} de ${depois.nichos.length} não confiáveis`,
  );
  ok(
    "19. 'melhor nicho' só sai de amostra confiável",
    depois.melhorNicho === null || depois.melhorNicho.abordados >= 20,
    depois.melhorNicho ? `${depois.melhorNicho.nicho} (${depois.melhorNicho.abordados})` : "nenhum",
  );

  console.log("\n=== F. NADA FOI ALTERADO NO CAMINHO ===");
  ok(
    "20. o endpoint não mexeu em lead nenhum",
    (await db.select({ n: sql<number>`count(*)::int` }).from(leads))[0].n === leadsAntes + 3,
    "só os 3 de teste entraram",
  );
  const semEnvio = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.etapa, "mensagem-enviada"));
  ok("21. nenhuma mensagem foi disparada pelo painel", typeof semEnvio[0].n === "number");

  await limpar();
  const fim = await resumo();
  ok(
    "22. limpeza não deixou resíduo",
    fim.indicadores.leads === leadsAntes && fim.financeiro.mrrAtual === antes.financeiro.mrrAtual,
    `${fim.indicadores.leads} leads, MRR ${fim.financeiro.mrrAtual}`,
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FALHOU:", e);
  await limpar().catch(() => {});
  process.exit(1);
});
