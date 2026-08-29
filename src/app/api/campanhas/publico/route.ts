import { NextResponse } from "next/server";
import { calcularFacetas, type Faixa } from "@/lib/facetas";
import { lerConfig } from "@/lib/fila";

/**
 * O que existe na base para prospectar AGORA.
 *
 * Alimenta a tela de campanhas antes de qualquer filtro: segmentos com
 * contagem, cidades com contagem, faixas de qualidade com contagem, e a
 * prévia dos leads compatíveis. Nada de formulário vazio.
 */
export const dynamic = "force-dynamic";

const FAIXAS: Faixa[] = ["todos", "qualificados", "quentes", "melhores"];

export async function GET(request: Request) {
  const u = new URL(request.url);
  const faixaBruta = u.searchParams.get("faixa") ?? "todos";
  const notaBruta = u.searchParams.get("nota");

  const facetas = await calcularFacetas({
    segmento: u.searchParams.get("segmento") || undefined,
    cidade: u.searchParams.get("cidade") || undefined,
    faixa: FAIXAS.includes(faixaBruta as Faixa) ? (faixaBruta as Faixa) : "todos",
    notaMinima: notaBruta ? Number(notaBruta) : undefined,
    soComWhatsapp: u.searchParams.get("zap") === "1",
  });

  // A config vai junto: a estimativa de duração depende de intervalo e teto.
  const cfg = await lerConfig();

  return NextResponse.json({
    ...facetas,
    envio: {
      intervaloSegundos: cfg.intervaloSegundos,
      limiteDiario: cfg.limiteDiario,
      automacaoAtiva: cfg.automacaoAtiva,
    },
  });
}
