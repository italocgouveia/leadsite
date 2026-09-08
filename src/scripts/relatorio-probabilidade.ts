import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, leads, configuracoes } from "@/lib/db";
import { probabilidadeComercial, ROTULO_CLASSIFICACAO } from "@/lib/probabilidade";
import { canalDoLead, motivoDeDescarte } from "@/lib/canais";
import { scores } from "@/lib/pontuacao";
import { alcanceDoLead } from "@/lib/territorio";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import { validarConfigDeProducao, retratoDaConfig } from "@/lib/config-producao";

/**
 * A classificação comercial rodada contra a base REAL. Somente leitura.
 *
 * Não altera lead, não cria campanha, não envia mensagem, não liga worker.
 *
 *   npm run relatorio:probabilidade
 */

const l = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(34)} ${String(v).padStart(6)}`);
const titulo = (t: string) => console.log(`\n${"─".repeat(62)}\n${t}\n${"─".repeat(62)}`);

async function main() {
  const base = await db.select().from(leads);
  const analise = base.map((x) => ({ x, p: probabilidadeComercial(x), s: scores(x) }));

  titulo("BASE");
  l("total de leads", base.length);

  titulo("CLASSIFICAÇÃO COMERCIAL");
  for (const c of ["quero-vender", "vale-abordar", "nao-prioritario"] as const) {
    l(ROTULO_CLASSIFICACAO[c], analise.filter((a) => a.p.classificacao === c).length);
  }

  titulo("CANAIS");
  const canais = base.map(canalDoLead);
  l("📱 WhatsApp", canais.filter((c) => c === "whatsapp" || c === "ambos").length);
  l("📸 Instagram", canais.filter((c) => c === "instagram" || c === "ambos").length);
  l("🔥 Ambos", canais.filter((c) => c === "ambos").length);
  l("❌ Sem canal", canais.filter((c) => c === "sem-canal").length);
  l("✅ Acionáveis", base.filter((x) => !motivoDeDescarte(x)).length);

  titulo("TOP 20 — E POR QUÊ");
  const top = analise
    .filter((a) => a.p.classificacao !== "nao-prioritario")
    .sort((a, b) => b.p.pontos - a.p.pontos)
    .slice(0, 20);

  for (const [i, { x, p, s }] of top.entries()) {
    const e = avaliarSistema(x);
    console.log(
      `\n${String(i + 1).padStart(2)}. ${ROTULO_CLASSIFICACAO[p.classificacao]}  ${x.nome}`,
    );
    console.log(
      `    ${x.cidade ?? "?"} · ${categoriaSingular(x.categoria)} · ${canalDoLead(x)} · ${alcanceDoLead(x)}`,
    );
    console.log(`    🛠 ${e.serve ? e.sistema : "—"}`);
    console.log(
      `    comercial ${s.comercial} · contatabilidade ${s.contatabilidade} · PRIORIDADE ${p.pontos}/100`,
    );
    console.log(`    ✓ ${p.positivos.map((m) => `${m.texto} (+${m.pontos})`).join(" · ")}`);
    if (p.negativos.length) {
      console.log(`    ⚠️ ${p.negativos.map((m) => m.texto).join(" · ")}`);
    }
    if (p.dor.tipo === "confirmada") console.log(`    ✅ dor confirmada: ${p.dor.texto}`);
    if (p.dor.tipo === "provavel") {
      console.log(`    💡 dor provável: ${p.dor.texto} (${p.dor.sinais.join(", ")})`);
    }
  }

  titulo("SEGURANÇA");
  const [cfg] = await db.select().from(configuracoes);
  const v = validarConfigDeProducao(cfg);
  console.log(`  configuração de produção: ${v.valida ? "VÁLIDA" : `🚨 ${v.motivo}`}`);
  console.log(`  retrato (sem segredos): ${JSON.stringify(retratoDaConfig(cfg))}`);
  console.log("  leads alterados por este relatório: 0");
  console.log("  mensagens enviadas por este relatório: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
