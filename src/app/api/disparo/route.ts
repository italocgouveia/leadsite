import { NextResponse } from "next/server";
import { previa, dispararTudo, pararTudo } from "@/lib/disparo";

/**
 * O botão único.
 *
 *   GET    → o que aconteceria (não grava nada)
 *   POST   → cria a campanha e aprova tudo (não envia nada)
 *   DELETE → cancela o que não saiu e desliga a automação
 *
 * Quem ENVIA continua sendo /api/automacao/fila, uma mensagem por chamada,
 * revalidando as travas do zero. Este endpoint só enche a fila — a separação
 * é o que impede "disparar" de virar rajada.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await previa());
}

export async function POST() {
  const r = await dispararTudo();
  if (!r.ok) {
    return NextResponse.json(
      { erro: r.erro, comoResolver: r.comoResolver },
      { status: 409 },
    );
  }
  return NextResponse.json(r);
}

export async function DELETE() {
  return NextResponse.json(await pararTudo());
}
