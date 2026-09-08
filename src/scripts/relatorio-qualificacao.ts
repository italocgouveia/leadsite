import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { oportunidades } from "@/lib/oportunidades";
import { categoriaSingular } from "@/lib/categoria-nome";
import { db, leads } from "@/lib/db";
import { precisaEnriquecer } from "@/lib/enriquecimento";
import { oportunidade } from "@/lib/pontuacao";
import { avaliarSistema } from "@/lib/sistemas";

/**
 * O resultado da régua de qualificação sobre a base real. Só leitura.
 *
 * Usa `oportunidades()` — o MESMO motor que alimenta /disparos. Um relatório
 * com contas próprias divergiria da tela no primeiro ajuste, e aí nenhum dos
 * dois números seria confiável.
 *
 *   npm run relatorio:qualificacao
 */

const linha = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(34)} ${String(v).padStart(6)}`);

async function main() {
  /**
   * `somenteWhatsapp: false` e `incluirContatados: true` para o relatório
   * enxergar a base INTEIRA, e não só quem passa nos filtros padrão da tela.
   */
  const r = await oportunidades(
    { somenteWhatsapp: false, incluirContatados: true },
    200,
  );
  const t = r.totais;

  console.log(`\n${"=".repeat(64)}\nFUNIL DE QUALIFICAÇÃO\n${"=".repeat(64)}`);
  linha("LEADS ENCONTRADOS", t.leads);
  linha("LEADS CONTATÁVEIS (telefone válido)", t.contataveis);
  linha("LEADS QUALIFICADOS (+ sistema, sem rede)", t.qualificados);
  linha("PRONTOS PARA PROSPECÇÃO", t.prontosParaProspeccao);

  console.log("\n--- QUALIDADE ---");
  linha("🔥 A  excelente oportunidade", t.prioridadeA);
  linha("🟡 B  boa oportunidade", t.prioridadeB);
  linha("🔵 C  oportunidade baixa", t.prioridadeC);
  linha("⚪ D  não recomendado", t.prioridadeD);

  console.log("\n--- SINAIS ---");
  linha("potencial de sistema", t.comPotencialSistema);
  linha("potencial FORTE (4+ processos)", t.potencialForte);
  linha("parecem pequenos/locais", t.pequenos);
  linha("com Instagram", t.comInstagram);
  linha("sem site confirmado", t.semSiteConfirmado);
  linha("site não conferido", t.siteNaoVerificado);
  linha("nunca contatados", t.naoContatados);
  linha("possíveis duplicatas", t.possiveisDuplicatas);

  console.log("\n--- ENRIQUECIMENTO ---");
  const en = r.enriquecimento;
  linha("sem telefone", en.semTelefone);
  linha("  potencial A sem telefone", en.potencialAsemTelefone);
  linha("  potencial B sem telefone", en.potencialBsemTelefone);
  linha("ENTRAM NA FILA", en.precisamEnriquecer);
  linha("  prioridade alta", en.prioridadeAlta);
  linha("  prioridade média", en.prioridadeMedia);
  linha("  prioridade baixa", en.prioridadeBaixa);
  linha("telefone já encontrado", en.encontrados);

  console.log("\n--- ESTADO DO CONTATO (leads listados) ---");
  const porContato = new Map<string, number>();
  for (const l of r.leads) {
    porContato.set(l.contatoRotulo, (porContato.get(l.contatoRotulo) ?? 0) + 1);
  }
  for (const [k, v] of [...porContato.entries()].sort((a, b) => b[1] - a[1])) linha(k, v);

  console.log("\n--- POR QUE OS D ---");
  for (const m of r.motivosD) linha(m.rotulo, m.quantidade);

  /**
   * A fila de enriquecimento sai do BANCO, não de `r.leads`.
   *
   * `r.leads` é a lista de oportunidades, ordenada por gaveta e cortada em 200
   * — e quem precisa de enriquecimento é justamente D (sem telefone), logo
   * fica fora do corte. Reaproveitar aquela lista devolveria zero, que é o
   * oposto do que esta seção existe para mostrar.
   */
  console.log("\n--- TOP 20 PARA ENRIQUECER ---");
  const base = await db.select().from(leads);
  const fila = base
    .map((l) => ({ l, e: precisaEnriquecer(l), s: oportunidade(l).score }))
    .filter(({ e }) => e.precisa)
    .sort((a, b) => (a.e.ordem ?? 9) - (b.e.ordem ?? 9) || b.s - a.s)
    .slice(0, 20);
  for (const [i, { l, e }] of fila.entries()) {
    const enc = avaliarSistema(l);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${l.nome.slice(0, 30).padEnd(30)} ` +
        `escalão ${e.ordem} · potencial ${e.qualidadePotencial} · ${e.prioridade} · ` +
        `${categoriaSingular(l.categoria)} · ${enc.sistema}`,
    );
  }

  console.log("\n--- DISTRIBUIÇÃO POR NICHO (top 15, por prontos) ---");
  const porNicho = new Map<string, { total: number; prontos: number; a: number }>();
  for (const l of r.leads) {
    const k = l.segmento;
    const at = porNicho.get(k) ?? { total: 0, prontos: 0, a: 0 };
    at.total++;
    if (l.prontoParaProspeccao) at.prontos++;
    if (l.nivel === "A") at.a++;
    porNicho.set(k, at);
  }
  console.log(`  ${"nicho".padEnd(28)} ${"listados".padStart(8)} ${"A".padStart(4)} ${"prontos".padStart(8)}`);
  for (const [k, v] of [...porNicho.entries()]
    .sort((a, b) => b[1].prontos - a[1].prontos || b[1].total - a[1].total)
    .slice(0, 15)) {
    console.log(
      `  ${k.slice(0, 28).padEnd(28)} ${String(v.total).padStart(8)} ${String(v.a).padStart(4)} ${String(v.prontos).padStart(8)}`,
    );
  }

  console.log(`\n${"=".repeat(64)}\nTOP 20 LEADS — E POR QUE CADA UM\n${"=".repeat(64)}`);
  for (const [i, l] of r.leads.slice(0, 20).entries()) {
    console.log(
      `\n${String(i + 1).padStart(2)}. ${l.nivelEmoji} ${l.nome}  ·  score ${l.score}` +
        `${l.prontoParaProspeccao ? "  ✅ pronto" : ""}`,
    );
    console.log(
      `    ${categoriaSingular(l.categoria)}` +
        `${l.prioridadeNicho ? ` (ramo ${l.prioridadeNicho})` : ""}` +
        ` · ${l.porteEstimadoRotulo}` +
        `${l.temWhatsapp ? " · 📱" : ""}${l.temInstagram ? " · Instagram" : ""}` +
        `${l.semSiteConfirmado ? " · sem site" : l.temSite ? " · tem site" : " · site não conferido"}` +
        `${l.avaliacoes ? ` · ${l.avaliacoes} aval.` : ""}`,
    );
    if (l.sistema) console.log(`    🛠 ${l.sistema}`);
    console.log(
      `    por quê: ${l.porQue.map((x) => `${x.pontos > 0 ? "+" : ""}${x.pontos} ${x.criterio}`).join(" · ")}`,
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
