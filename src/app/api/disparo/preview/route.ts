import { NextResponse } from "next/server";
import { previaFiltrada } from "@/lib/disparo";

/**
 * Prévia por nicho para a tela /disparos.
 *
 * Devolve a mesma contagem que "Preparar fila" vai usar — nenhum número
 * fictício: passa pelas travas reais da fila (WhatsApp, janela de recontato,
 * resposta, opt-out, funil) via `previaFiltrada`. Não grava nada.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const segmento = u.searchParams.get("segmento") || undefined;

  const r = await previaFiltrada({ segmento });
  return NextResponse.json(r);
}
