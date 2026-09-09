import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, leads, configuracoes } from "@/lib/db";
import { oportunidades } from "@/lib/oportunidades";
import { avaliarOportunidadeComercial } from "@/lib/oportunidade-comercial";
import { precisaEnriquecer } from "@/lib/enriquecimento";
import { validarConfigDeProducao, retratoDaConfig } from "@/lib/config-producao";

/**
 * A máquina de vendas medida contra a base REAL. Somente leitura.
 *
 * Não altera lead, não cria campanha, não envia mensagem, não liga worker.
 *
 *   npm run relatorio:maquina
 */

const l = (r: string, v: unknown) => console.log(`  ${r.padEnd(38)} ${String(v).padStart(6)}`);
const titulo = (t: string) => console.log(`\n${"─".repeat(66)}\n${t}\n${"─".repeat(66)}`);

async function main() {
  const base = await db.select().from(leads);
  const painel = await oportunidades({ aba: "melhores" }, 30);
  const f = painel.funil;

  titulo("O QUE A TELA DEVE DIZER");
  l("🔥 melhores oportunidades", f.melhores);
  l("📱 prontas para WhatsApp hoje", f.prontasParaWhatsapp);
  l("📸 prontas para Instagram (manual)", f.prontasParaInstagram);
  l("🔍 aguardando canal (enriquecer)", f.aguardandoCanal);
  console.log("");
  l("oportunidades comerciais reais", f.oportunidadesReais);
  l("… com potencial de solução", f.comPotencialDeSolucao);
  l("… total bruto na base", f.total);

  titulo("POR QUE O RESTO NÃO É OPORTUNIDADE");
  for (const b of f.bloqueios) l(b.motivo, b.quantidade);

  titulo("A FILA DE ENRIQUECIMENTO — O QUE DÁ PARA PROMETER");
  const semCanal = base.filter((x) => avaliarOportunidadeComercial(x).aguardandoCanal);
  const fila = semCanal.map((x) => precisaEnriquecer(x));
  l("bons negócios sem canal", semCanal.length);
  l("🔥 prioridade alta", fila.filter((e) => e.precisa && e.prioridade === "alta").length);
  l("🟡 prioridade média", fila.filter((e) => e.precisa && e.prioridade === "media").length);
  l("⚪ prioridade baixa", fila.filter((e) => e.precisa && e.prioridade === "baixa").length);
  l("já enriquecidos (telefone achado)", base.filter((x) => x.telefoneOrigem).length);

  titulo(`TOP 30 — OPORTUNIDADES REAIS (${painel.leads.length} disponíveis)`);
  const topo = painel.leads.length
    ? painel.leads
    : (await oportunidades({ aba: "whatsapp" }, 30)).leads;
  if (!painel.leads.length) console.log("  (sem 🔥 ambos+quero-vender — mostrando a fila de WhatsApp)\n");

  for (const [i, x] of topo.slice(0, 30).entries()) {
    console.log(`\n${String(i + 1).padStart(2)}. ${x.decisaoRotulo}  ${x.nome}`);
    console.log(`    ${x.cidade ?? "?"} · ${x.segmento} · ${x.canalRotulo} · ${x.alcanceRotulo}`);
    console.log(`    🛠 ${x.sistema ?? "—"}   ·   prioridade ${x.probabilidade}/100`);
    console.log(`    ✓ ${x.positivos.map((m) => m.texto).join(" · ")}`);
    if (x.dor2.tipo === "provavel") console.log(`    💡 dor provável: ${x.dor2.texto}`);
    if (x.dor2.tipo === "confirmada") console.log(`    ✅ dor confirmada: ${x.dor2.texto}`);
  }

  titulo("COERÊNCIA ENTRE AS TELAS");
  const wpp = await oportunidades({ aba: "whatsapp" }, 500);
  const iguais = wpp.funil.prontasParaWhatsapp === f.prontasParaWhatsapp;
  console.log(`  /cacada e /disparos contam o mesmo: ${iguais ? "SIM" : "NÃO"}`);
  console.log(`  leads na aba WhatsApp: ${wpp.leads.length} · funil diz ${f.prontasParaWhatsapp}`);

  titulo("SEGURANÇA");
  const [cfg] = await db.select().from(configuracoes);
  const v = validarConfigDeProducao(cfg);
  console.log(`  configuração de produção: ${v.valida ? "VÁLIDA" : `🚨 ${v.motivo}`}`);
  console.log(`  retrato (sem segredos): ${JSON.stringify(retratoDaConfig(cfg))}`);
  console.log(`  automação ativa: ${cfg?.automacaoAtiva}`);
  console.log("  leads alterados por este relatório: 0");
  console.log("  mensagens enviadas por este relatório: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
