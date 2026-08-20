import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!site) return NextResponse.json({ erro: "Site não encontrado" }, { status: 404 });

  return NextResponse.json({ site });
}

/**
 * Apaga o site. As versões vão junto por `onDelete: "cascade"` no schema —
 * o histórico inteiro some, não tem lixeira.
 *
 * O LEAD não é tocado: apagar o site é jogar fora o trabalho, não o contato.
 *
 * Se o site estava publicado, `/s/[slug]` passa a dar 404 — por isso a tela
 * avisa antes, e oferece despublicar como alternativa.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const [apagado] = await db
      .delete(sites)
      .where(eq(sites.id, id))
      .returning({ id: sites.id, slug: sites.slug, publicado: sites.publicado });

    if (!apagado) {
      return NextResponse.json({ erro: "Site não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, site: apagado });
  } catch (erro) {
    console.error("[sites] falha ao excluir", id, erro);
    return NextResponse.json({ erro: "Não consegui excluir o site." }, { status: 500 });
  }
}
