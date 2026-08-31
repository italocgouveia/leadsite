import { NextResponse } from "next/server";
import { previaFiltrada, type ProdutoDisparo } from "@/lib/disparo";

/**
 * Prévia filtrada por nicho + abordagem para a tela /disparos.
 *
 * Devolve a mesma contagem que "Preparar fila" vai usar — nenhum número
 * fictício: passa pelas travas reais da fila (WhatsApp, janela de recontato,
 * resposta, opt-out, funil) via `previaFiltrada`. Não grava nada.
 */
export const dynamic = "force-dynamic";

const PRODUTOS: ProdutoDisparo[] = ["site", "chatbot", "sistema"];

export async function GET(request: Request) {
  const u = new URL(request.url);
  const segmento = u.searchParams.get("segmento") || undefined;
  const produtoBruto = u.searchParams.get("produto");
  const produto = PRODUTOS.includes(produtoBruto as ProdutoDisparo)
    ? (produtoBruto as ProdutoDisparo)
    : undefined;

  const r = await previaFiltrada({ segmento, produto });
  return NextResponse.json(r);
}
