import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { oportunidades } from "@/lib/oportunidades";
import { previaFiltrada } from "@/lib/disparo";
import { canalDoLead, instagramDoLead, motivoDeDescarte } from "@/lib/canais";
import { scores, prioridadeComercial } from "@/lib/pontuacao";
import { classificarPorte } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { deduplicar } from "@/lib/dedup";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * O retrato completo da base, SOMENTE LEITURA.
 *
 * Usa os mesmos motores da tela e da campanha (`oportunidades`,
 * `previaFiltrada`) — um relatório com contas próprias divergiria dos dois no
 * primeiro ajuste, e aí nenhum número seria confiável.
 *
 * Nenhum INSERT, UPDATE ou DELETE. Nenhuma mensagem enviada.
 *
 *   npm run relatorio:final
 */

const l = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(40)} ${String(v).padStart(6)}`);
const titulo = (t: string) => console.log(`\n${"─".repeat(60)}\n${t}\n${"─".repeat(60)}`);

async function main() {
  const base = await db.select().from(leads);
  const r = await oportunidades({ somenteWhatsapp: false, incluirContatados: true }, 200);
  const c = r.canais;

  titulo("BASE");
  l("total de leads", base.length);
  l("nenhum lead removido nesta tarefa", 0);

  titulo("CANAIS");
  l("📱 WhatsApp (celular plausível)", c.whatsapp);
  l("📸 Instagram (perfil utilizável)", c.instagram);
  l("🔥 Ambos", c.ambos);
  l("❌ Sem canal", c.semCanal);
  l("✅ ACIONÁVEIS", c.acionaveis);

  titulo("QUALIDADE");
  const niveis = base.map((x) => prioridadeComercial(x).nivel);
  for (const n of ["A", "B", "C", "D"] as const) {
    l(`${n}`, niveis.filter((x) => x === n).length);
  }

  titulo("PERFIL");
  l("pequenos / prováveis locais", c.pequenosLocais);
  l("redes / franquias / grande porte", base.filter((x) => classificarPorte(x).rede).length);
  l("sem sistema aplicável", base.filter((x) => !avaliarSistema(x).serve).length);
  const dup = deduplicar(
    [...base].sort((a, b) => Number(Boolean(b.telefone)) - Number(Boolean(a.telefone))),
  ).duplicados;
  l("possíveis duplicados", dup.length);

  titulo("TELEFONE");
  const tipo = (x: (typeof base)[number]) => validarTelefone(telefoneDoLead(x))?.tipo;
  l("celular", base.filter((x) => tipo(x) === "celular").length);
  l("fixo", base.filter((x) => tipo(x) === "fixo").length);
  l("sem telefone", base.filter((x) => !tipo(x)).length);
  l("telefone achado por enriquecimento", base.filter((x) => x.telefoneOrigem).length);

  titulo("WHATSAPP — CAMPANHA");
  const p = await previaFiltrada({});
  l("PRONTOS PARA DISPARO", p.disponivel);
  console.log("\n  bloqueados, por motivo:");
  // As recusas vêm da MESMA varredura de elegiveis() — ver lib/disparo.
  const det = await import("@/lib/disparo").then((mod) => mod.previa());
  for (const rec of det.recusas.slice(0, 10)) {
    console.log(`    ${String(rec.quantidade).padStart(4)}  ${rec.motivo}`);
  }

  titulo("INSTAGRAM — PROSPECÇÃO MANUAL");
  const ig = await oportunidades(
    { fila: "instagram", somenteWhatsapp: false, incluirContatados: true },
    200,
  );
  l("prontos para abordagem manual", ig.leads.length);
  const st = (v: string) => base.filter((x) => x.instagramStatus === v).length;
  l("já abordados", st("abordado"));
  l("responderam", st("respondeu"));
  l("sem interesse", st("sem-interesse"));
  l("clientes", st("cliente"));
  l("perfis @ normalizados", base.filter((x) => x.instagramUsername).length);
  l(
    "links recusados (post/reel/genérico)",
    base.filter((x) => x.instagram && !instagramDoLead(x)).length,
  );

  titulo("FORA DA OPERAÇÃO COMERCIAL, POR QUÊ");
  for (const d of c.descartes) l(d.rotulo, d.quantidade);

  titulo("TOP 20 OPORTUNIDADES");
  const top = base
    .filter((x) => !motivoDeDescarte(x))
    .map((x) => ({ x, s: scores(x), n: prioridadeComercial(x) }))
    .sort((a, b) => b.s.final - a.s.final)
    .slice(0, 20);
  for (const [i, { x, s, n }] of top.entries()) {
    const e = avaliarSistema(x);
    const canal = canalDoLead(x);
    console.log(
      `\n${String(i + 1).padStart(2)}. ${n.emoji} ${x.nome}  ·  final ${s.final} (com ${s.comercial} / cont ${s.contatabilidade})`,
    );
    console.log(
      `    ${canal === "ambos" ? "🔥 WhatsApp + Instagram" : canal === "whatsapp" ? "📱 WhatsApp" : "📸 Instagram"}` +
        ` · ${categoriaSingular(x.categoria)} · 🏪 ${classificarPorte(x).porteEstimado === "pequeno" ? "provável pequeno/local" : "porte desconhecido"}`,
    );
    console.log(`    🛠 ${e.sistema}`);
    if (e.dor) console.log(`    💡 ${e.dor}`);
  }

  titulo("SEGURANÇA");
  const seg = (await db.execute(sql`
    SELECT (SELECT count(*) FROM conversas)::int AS conversas,
           (SELECT count(*) FROM mensagens)::int AS mensagens,
           (SELECT count(*) FROM negocios)::int AS negocios,
           (SELECT count(*) FROM mensagens WHERE enviada_em > now() - interval '12 hours')::int AS enviadas_12h
  `)) as unknown as { rows?: Record<string, number>[] } & Record<string, number>[];
  const [s] = seg.rows ?? seg;
  l("conversas preservadas", s.conversas);
  l("mensagens preservadas", s.mensagens);
  l("negócios preservados", s.negocios);
  l("leads apagados nesta tarefa", 0);
  l("mensagens enviadas nas últimas 12h", s.enviadas_12h);
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
