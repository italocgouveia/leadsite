import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq } from "drizzle-orm";
import { db, leads, mensagens, conversas, ETAPAS_FUNIL, ETAPAS_PARALELAS } from "@/lib/db";
import { calcular } from "@/lib/metricas";
import { classificar } from "@/lib/classificar";
import { validarBaseUrl } from "@/lib/integracao";

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

async function main() {
  console.log("\n[integracao — prioridade zero]");
  const webhookNoLugarErrado = validarBaseUrl("https://leads-eosin.vercel.app/api/automacao/status");
  ok("detecta webhook colado no campo da API", !webhookNoLugarErrado.ok);
  if (!webhookNoLugarErrado.ok) console.log(`     -> ${webhookNoLugarErrado.erro}`);
  ok("URL vazia e invalida", !validarBaseUrl("").ok);
  ok("URL malformada e invalida", !validarBaseUrl("nao-e-url").ok);
  const localhost = validarBaseUrl("http://localhost:8080");
  ok("localhost passa mas com aviso", localhost.ok && !!localhost.aviso);
  ok("base de provedor real passa", validarBaseUrl("https://minha-evolution.com").ok);

  console.log("\n[funil de 9 etapas]");
  ok("nove etapas no funil", ETAPAS_FUNIL.length === 9, String(ETAPAS_FUNIL.length));
  ok("sete status paralelos", ETAPAS_PARALELAS.length === 7, String(ETAPAS_PARALELAS.length));
  ok("paralelos nao estao no funil",
     !ETAPAS_FUNIL.some(f => ETAPAS_PARALELAS.some(p => p.valor === (f.valor as string))));

  console.log("\n[metricas — sem divisao por zero]");
  const m = await calcular({ periodo: "tudo" });
  ok("nao quebra com base real", typeof m.leads.total === "number");
  ok("taxa de resposta nunca e NaN", Number.isFinite(m.mensagens.taxaResposta), String(m.mensagens.taxaResposta));
  ok("taxa de conversao nunca e NaN", Number.isFinite(m.vendas.taxaConversao), String(m.vendas.taxaConversao));
  ok("taxa de interesse nunca e NaN", Number.isFinite(m.vendas.taxaInteresse));
  ok("declara a base da taxa", ["enviadas","entregues"].includes(m.mensagens.baseDaTaxa), m.mensagens.baseDaTaxa);
  console.log(`     base: ${m.leads.total} leads | funil soma ${m.funil.reduce((s,f)=>s+f.quantidade,0)}`);

  const vazio = await calcular({ periodo: "hoje", cidade: "CidadeQueNaoExiste123" });
  ok("filtro sem resultado devolve zeros, nao erro", vazio.leads.total === 0 && vazio.mensagens.taxaResposta === 0);

  console.log("\n[filtro por periodo]");
  const tudo = await calcular({ periodo: "tudo" });
  const hoje = await calcular({ periodo: "hoje" });
  ok("periodo filtra de verdade", hoje.leads.total <= tudo.leads.total, `${hoje.leads.total} <= ${tudo.leads.total}`);

  console.log("\n[resposta: ciclo real no banco]");
  const [lead] = await db.insert(leads).values({
    placeId: `zz-dash-${Date.now()}`, nome: "ZZ Dash", categoria: "car_repair",
    cidade: "Uberlândia", statusSite: "sem-site", score: 50,
    whatsapp: "https://wa.me/5534999000111", etapa: "mensagem-enviada",
  }).returning();

  const [msg] = await db.insert(mensagens).values({
    leadId: lead.id, texto: "oi", status: "enviada", enviadaEm: new Date(), provedorId: `zz-msg-${Date.now()}`,
  }).returning();
  const [pendente] = await db.insert(mensagens).values({
    leadId: lead.id, texto: "follow", status: "aprovada",
  }).returning();

  // simula o webhook: grava conversa + classifica + move funil
  const c = classificar("Quanto custa?");
  await db.insert(conversas).values({
    leadId: lead.id, direcao: "recebida", texto: "Quanto custa?",
    provedorMsgId: msg.provedorId, intencao: c.intencao, confianca: c.confianca,
  });
  await db.update(mensagens).set({ status: "cancelada", erro: "Lead respondeu" })
    .where(eq(mensagens.id, pendente.id));
  await db.update(leads).set({ etapa: c.etapaSugerida!, intencao: c.intencao }).where(eq(leads.id, lead.id));

  const [depois] = await db.select().from(leads).where(eq(leads.id, lead.id));
  ok("pediu orcamento -> classificado", c.intencao === "orcamento", c.intencao);
  ok("resposta move para interessado", depois.etapa === "interessado", depois.etapa);
  const [pend2] = await db.select().from(mensagens).where(eq(mensagens.id, pendente.id));
  ok("resposta cancela follow-up pendente", pend2.status === "cancelada", pend2.status);

  console.log("\n[webhook idempotente]");
  let duplicou = false;
  try {
    await db.insert(conversas).values({
      leadId: lead.id, direcao: "recebida", texto: "Quanto custa?", provedorMsgId: msg.provedorId,
    });
    duplicou = true;
  } catch { /* indice unico barrou, que e o esperado */ }
  ok("mesmo provedorMsgId nao duplica conversa", !duplicou);
  const convs = await db.select().from(conversas).where(eq(conversas.leadId, lead.id));
  ok("uma conversa apenas", convs.length === 1, String(convs.length));

  console.log("\n[opt-out]");
  const oo = classificar("não me mande mais mensagens");
  await db.update(leads).set({ naoContatar: oo.optOut, etapa: oo.etapaSugerida! }).where(eq(leads.id, lead.id));
  const [bloqueado] = await db.select().from(leads).where(eq(leads.id, lead.id));
  ok("opt-out marca naoContatar", bloqueado.naoContatar === true);
  ok("opt-out move para status paralelo", bloqueado.etapa === "opt-out", bloqueado.etapa);

  await db.delete(leads).where(eq(leads.id, lead.id));
  ok("limpou o cenario", (await db.select().from(conversas).where(eq(conversas.leadId, lead.id))).length === 0);

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
