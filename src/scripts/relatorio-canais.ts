import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { oportunidades } from "@/lib/oportunidades";
import { previaFiltrada } from "@/lib/disparo";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * O CRM pela pergunta certa: com quem dá para falar hoje, e por qual canal.
 *
 * Usa `oportunidades()` e `previaFiltrada()` — os MESMOS motores da tela e da
 * campanha. Um relatório com contas próprias divergiria dos dois no primeiro
 * ajuste, e aí nenhum número seria confiável.
 *
 *   npm run relatorio:canais
 */

const linha = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(38)} ${String(v).padStart(6)}`);

async function main() {
  const r = await oportunidades(
    { somenteWhatsapp: false, incluirContatados: true },
    200,
  );
  const c = r.canais;

  console.log(`\n${"=".repeat(64)}\nO QUE DÁ PARA FAZER HOJE\n${"=".repeat(64)}`);
  linha("🔥 AMBOS (melhores oportunidades)", c.ambos);
  linha("📱 WHATSAPP (disparo automático)", c.whatsapp);
  linha("📸 INSTAGRAM (abordagem manual)", c.instagram);
  linha("✅ ACIONÁVEIS (canal + o que vender)", c.acionaveis);
  console.log();
  linha("🏪 pequenos / locais", c.pequenosLocais);
  linha("🛠 com sistema aplicável", c.comSistemaAplicavel);

  console.log("\n--- em segundo plano ---");
  linha("total de leads na base", c.total);
  linha("❌ sem canal nenhum", c.semCanal);

  console.log("\n--- FORA DA VISÃO COMERCIAL, POR QUÊ ---");
  for (const d of c.descartes) linha(d.rotulo, d.quantidade);

  /** O número que a campanha REALMENTE oferece — o motor de disparo, não o painel. */
  const p = await previaFiltrada({});
  console.log("\n--- CAMPANHA DE WHATSAPP (motor real de seleção) ---");
  linha("disponíveis para disparo agora", p.disponivel);

  console.log("\n--- FILA MANUAL DE INSTAGRAM ---");
  const ig = await oportunidades(
    { fila: "instagram", somenteWhatsapp: false, incluirContatados: true },
    200,
  );
  linha("empresas para abordar à mão", ig.leads.length);
  for (const l of ig.leads.slice(0, 12)) {
    console.log(
      `    @${(l.instagramUsername ?? "?").padEnd(26)} ${l.nome.slice(0, 26).padEnd(26)} ` +
        `${l.canal === "ambos" ? "🔥" : "📸"} com ${l.scoreComercial}/cont ${l.scoreContatabilidade}/fin ${l.scoreFinal} · ${l.sistema ?? ""}`,
    );
  }

  console.log("\n--- MELHORES OPORTUNIDADES (ambos os canais) ---");
  const ambos = await oportunidades(
    { fila: "ambos", somenteWhatsapp: false, incluirContatados: true },
    200,
  );
  linha("empresas com WhatsApp + Instagram", ambos.leads.length);
  for (const l of ambos.leads.slice(0, 15)) {
    console.log(
      `    ${l.nome.slice(0, 28).padEnd(28)} ${categoriaSingular(l.categoria).slice(0, 18).padEnd(18)} ` +
        `com ${String(l.scoreComercial).padStart(3)} · cont ${String(l.scoreContatabilidade).padStart(3)} · fin ${String(l.scoreFinal).padStart(3)} · ${l.sistema ?? ""}`,
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
