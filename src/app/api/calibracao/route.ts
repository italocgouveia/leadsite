import { NextResponse } from "next/server";
import { db, leads } from "@/lib/db";
import { oportunidade, contactabilidade, potencialDoSegmento } from "@/lib/pontuacao";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Painel de calibração: cobertura real de cada campo e o efeito na pontuação.
 *
 * Existe para você conseguir responder "esse critério está funcionando?" sem
 * abrir o banco. Critério com 0% de cobertura aparece marcado — foi assim que
 * descobrimos que "volume de avaliações" dava 15 pontos que ninguém podia
 * ganhar.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const base = await db.select().from(leads);
  const n = base.length || 1;
  const cobertura = (f: (l: (typeof base)[0]) => boolean) => ({
    quantos: base.filter(f).length,
    pct: Math.round((base.filter(f).length / n) * 100),
  });

  const criterios = [
    { criterio: "Segmento (categoria)", pontos: "0–40", usa: "categoria", ...cobertura((l) => !!l.categoria) },
    { criterio: "Processos do ramo", pontos: "0–20", usa: "categoria", ...cobertura((l) => !!l.categoria) },
    { criterio: "Endereço confirmado", pontos: "8", usa: "endereco", ...cobertura((l) => !!l.endereco) },
    { criterio: "Horário publicado", pontos: "7", usa: "horarios", ...cobertura((l) => !!l.horarios) },
    { criterio: "Site próprio", pontos: "10", usa: "website", ...cobertura((l) => !!l.website) },
    { criterio: "Instagram", pontos: "5", usa: "instagram", ...cobertura((l) => !!l.instagram) },
    { criterio: "Lacuna de presença confirmada", pontos: "0–10", usa: "statusSite", ...cobertura((l) => l.statusSite !== "nao-verificado") },
    { criterio: "WhatsApp", pontos: "contato +50", usa: "whatsapp", ...cobertura((l) => !!l.whatsapp) },
    { criterio: "Telefone sem WhatsApp", pontos: "contato +25", usa: "telefone", ...cobertura((l) => !!l.telefone && !l.whatsapp) },
    { criterio: "E-mail", pontos: "contato +10", usa: "email", ...cobertura((l) => !!l.email) },
    { criterio: "Avaliações Google", pontos: "REMOVIDO", usa: "avaliacoes", ...cobertura((l) => l.avaliacoes != null) },
    { criterio: "Nota Google", pontos: "REMOVIDO", usa: "nota", ...cobertura((l) => l.nota != null) },
    { criterio: "CNPJ / sócios", pontos: "não pontua", usa: "cnpj", ...cobertura((l) => !!l.cnpj) },
  ];

  const porFaixa = (f: string) => base.filter((l) => oportunidade(l).faixa === f).length;
  const porContato = (f: string) => base.filter((l) => contactabilidade(l).faixa === f).length;

  const scores = base.map((l) => oportunidade(l).score).sort((a, b) => a - b);
  const p = (q: number) => scores[Math.floor(scores.length * q)] ?? 0;

  return NextResponse.json({
    total: base.length,
    criterios,
    distribuicao: {
      oportunidade: {
        "muito-alta": porFaixa("muito-alta"),
        alta: porFaixa("alta"),
        media: porFaixa("media"),
        baixa: porFaixa("baixa"),
      },
      contato: {
        excelente: porContato("excelente"),
        bom: porContato("bom"),
        possivel: porContato("possivel"),
        dificil: porContato("dificil"),
      },
      percentis: { min: scores[0] ?? 0, p25: p(0.25), mediana: p(0.5), p85: p(0.85), max: scores[scores.length - 1] ?? 0 },
    },
    segmentos: [...new Map(
      base.map((l) => [categoriaSingular(l.categoria), potencialDoSegmento(l)]),
    ).entries()].map(([segmento, potencial]) => ({
      segmento,
      potencial,
      leads: base.filter((l) => categoriaSingular(l.categoria) === segmento).length,
    })).sort((a, b) => b.leads - a.leads),
    paraEnriquecer: base
      .filter((l) => contactabilidade(l).precisaEnriquecer)
      .map((l) => ({
        id: l.id,
        nome: l.nome,
        segmento: categoriaSingular(l.categoria),
        cidade: l.cidade,
        oportunidade: oportunidade(l).score,
        contato: contactabilidade(l).score,
        canais: contactabilidade(l).canais,
      }))
      .sort((a, b) => b.oportunidade - a.oportunidade),
  });
}
