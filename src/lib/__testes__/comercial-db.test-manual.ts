import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq, inArray, like } from "drizzle-orm";
import { db, leads, negocios } from "@/lib/db";
import { pipeline, esboçarProposta, followUpsPendentes, ajustePorComportamento, desempenhoPorNicho } from "@/lib/comercial";
import type { Lead } from "@/lib/db";

const M = "TESTE-COM";
let p = 0, f = 0;
const ok = (n: string, c: boolean, d = "") => { if (c) { p++; console.log(`  [PASS] ${n}${d?` — ${d}`:""}`); } else { f++; console.log(`  [FAIL] ${n}${d?` — ${d}`:""}`); } };

async function limpar() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.placeId, `${M}:%`));
  if (ls.length) {
    const ids = ls.map(l => l.id);
    await db.delete(negocios).where(inArray(negocios.leadId, ids));
    await db.delete(leads).where(inArray(leads.id, ids));
  }
}

async function main() {
  await limpar();
  const antes = await pipeline();

  const novos = await db.insert(leads).values(
    ["Um","Dois","Tres","Quatro"].map((n,i)=>({
      placeId:`${M}:${i+1}`, nome:`${M} ${n}`, categoria:"car_wash", cidade:"Uberlândia",
      whatsapp:`https://wa.me/551190000080${i}`, etapa:"novo" as const, fotos:[],
      statusSite:"sem-site" as never, score:60, temperatura:"morno" as const,
    }))).returning();

  console.log("\n=== PIPELINE / MRR ===");
  await db.insert(negocios).values([
    { leadId: novos[0].id, status: "enviada", setup: 2000, mensalidade: 400 },
    { leadId: novos[1].id, status: "negociacao", setup: 3000, mensalidade: 500 },
    { leadId: novos[2].id, status: "ativo", setup: 2500, mensalidade: 400, inicioEm: new Date() },
    { leadId: novos[3].id, status: "perdida", setup: 9999, mensalidade: 9999 },
  ]);
  const pl = await pipeline();
  ok("1. setup potencial soma só o que não fechou", pl.setupPotencial - antes.setupPotencial === 5000, `+${pl.setupPotencial - antes.setupPotencial}`);
  ok("2. MRR potencial soma proposta + negociação", pl.mrrPotencial - antes.mrrPotencial === 900, `+${pl.mrrPotencial - antes.mrrPotencial}`);
  ok("3. MRR atual conta só cliente pagante", pl.mrrAtual - antes.mrrAtual === 400, `+${pl.mrrAtual - antes.mrrAtual}`);
  ok("4. negócio PERDIDO não entra em nada", pl.mrrPotencial - antes.mrrPotencial !== 9999 && pl.mrrAtual - antes.mrrAtual !== 9999);
  ok("5. potencial e real são números separados", pl.mrrPotencial !== pl.mrrAtual);

  const semValor = await db.insert(negocios).values({ leadId: novos[0].id, status: "rascunho" }).returning();
  const pl2 = await pipeline();
  ok("6. negócio sem preço é contado à parte", pl2.semValorDefinido > pl.semValorDefinido, `${pl2.semValorDefinido}`);
  await db.delete(negocios).where(eq(negocios.id, semValor[0].id));

  console.log("\n=== PROPOSTA ===");
  const [l0] = await db.select().from(leads).where(eq(leads.id, novos[0].id));
  const e1 = esboçarProposta(l0 as Lead);
  ok("7. proposta NUNCA sugere preço", e1.setup === null && e1.mensalidade === null);
  ok("8. avisa que o preço falta", e1.pendencias.some(x=>/setup e mensalidade/i.test(x)));
  ok("9. sem dor confirmada, marca como hipótese", !e1.problemaConfirmado && e1.pendencias.some(x=>/hip[óo]tese/i.test(x)));
  ok("10. escopo vem do catálogo", e1.modulos.length > 0 && e1.solucao.includes("lava-jato"), e1.solucao);

  await db.update(leads).set({ memoriaComercial: { dorConfirmada: "Não controla quem deixou de voltar." } }).where(eq(leads.id, novos[0].id));
  const [l1] = await db.select().from(leads).where(eq(leads.id, novos[0].id));
  const e2 = esboçarProposta(l1 as Lead);
  ok("11. com dor confirmada, usa a palavra do cliente", e2.problemaConfirmado && e2.problema.includes("voltar"), e2.problema);

  console.log("\n=== FOLLOW-UP MANUAL ===");
  await db.update(negocios).set({ proximoFollowUp: new Date(Date.now()-86400000), motivoFollowUp: "Pediu para falar depois." }).where(eq(negocios.leadId, novos[1].id));
  const fus = await followUpsPendentes();
  ok("12. follow-up vencido aparece", fus.some(x=>x.leadId===novos[1].id), `${fus.length} pendente(s)`);
  await db.update(negocios).set({ proximoFollowUp: new Date(Date.now()+7*86400000) }).where(eq(negocios.leadId, novos[1].id));
  const fus2 = await followUpsPendentes();
  ok("13. follow-up futuro NÃO aparece", !fus2.some(x=>x.leadId===novos[1].id));

  console.log("\n=== SCORE DINÂMICO ===");
  const base = { ...l0, ultimaInteracao: null, intencao: null, etapa: "novo" } as Lead;
  ok("14. lead sem histórico não ganha nada", ajustePorComportamento(base).pontos === 0);
  ok("15. respondeu soma", ajustePorComportamento({ ...base, ultimaInteracao: new Date() } as Lead).pontos === 5);
  const interessado = ajustePorComportamento({ ...base, ultimaInteracao: new Date(), intencao: "interessado" } as Lead);
  ok("16. interesse soma mais", interessado.pontos === 15, `${interessado.pontos} — ${interessado.motivos.join(", ")}`);
  const comDor = ajustePorComportamento({ ...base, ultimaInteracao: new Date(), intencao: "interessado", memoriaComercial: { dorConfirmada: "x" } } as Lead);
  ok("17. dor confirmada soma", comDor.pontos === 25, `${comDor.pontos}`);
  ok("18. fechado vai a 100", ajustePorComportamento({ ...base, etapa: "fechado" } as Lead).pontos === 100);
  ok("19. sem interesse DERRUBA a prioridade", ajustePorComportamento({ ...base, etapa: "sem-interesse" } as Lead).pontos < 0);
  ok("20. opt-out derruba ao mínimo", ajustePorComportamento({ ...base, naoContatar: true } as Lead).pontos === -100);

  console.log("\n=== RANKING DE NICHOS ===");
  const rank = await desempenhoPorNicho();
  ok("21. ranking não quebra com os dados reais", Array.isArray(rank), `${rank.length} nichos`);
  ok("22. amostra pequena é marcada como não confiável", rank.every(r => r.confiavel === (r.abordados >= 20)));
  const peq = rank.filter(r=>!r.confiavel).length;
  console.log(`      (${peq} de ${rank.length} nichos com amostra pequena)`);

  await limpar();
  const fim = await pipeline();
  ok("23. limpeza não deixou resíduo no pipeline", fim.mrrAtual === antes.mrrAtual && fim.mrrPotencial === antes.mrrPotencial);
  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f?1:0);
}
main().catch(async e => { console.error(e); await limpar().catch(()=>{}); process.exit(1); });
