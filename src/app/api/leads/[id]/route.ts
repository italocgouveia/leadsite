import { NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db, leads, sites, scripts, logos } from "@/lib/db";

/**
 * Remover lead de vez.
 *
 * O lead é a raiz: por `onDelete: "cascade"` no schema, apagá-lo leva junto os
 * SITES gerados (e todo o histórico de versões deles), os scripts e os logos.
 * Um site publicado em /s/[slug] passa a dar 404 na hora.
 *
 * Por isso o GET aqui existe: a tela pergunta ANTES o que vai junto, para a
 * confirmação dizer "isso apaga 2 sites, 1 deles no ar" em vez de "tem
 * certeza?". Não existe lixeira — o que sai daqui não volta.
 *
 * Se você só quer tirar da fila, use "Descartar": ele marca como perdido e o
 * lead continua no Pipeline, de onde dá pra arrastar de volta.
 */

export const dynamic = "force-dynamic";

async function contarDependentes(leadId: string) {
  /**
   * Os sites vêm como linhas, não como `count()`: além do total, a tela
   * precisa saber quantos estão NO AR — e `count(sites.publicado)` contaria
   * todos, porque a coluna é boolean NOT NULL e nunca é nula.
   */
  const dosSites = await db
    .select({ publicado: sites.publicado })
    .from(sites)
    .where(eq(sites.leadId, leadId));

  const [sc] = await db
    .select({ n: count() })
    .from(scripts)
    .where(eq(scripts.leadId, leadId));
  const [lg] = await db
    .select({ n: count() })
    .from(logos)
    .where(eq(logos.leadId, leadId));

  return {
    sites: dosSites.length,
    sitesPublicados: dosSites.filter((s) => s.publicado).length,
    scripts: sc?.n ?? 0,
    logos: lg?.n ?? 0,
  };
}

/** O que será destruído junto — alimenta a confirmação. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  return NextResponse.json({ lead, dependentes: await contarDependentes(id) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const dependentes = await contarDependentes(id);

    const [apagado] = await db
      .delete(leads)
      .where(eq(leads.id, id))
      .returning({ id: leads.id, nome: leads.nome });

    if (!apagado) {
      return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lead: apagado, dependentes });
  } catch (erro) {
    console.error("[leads] falha ao excluir", id, erro);
    return NextResponse.json({ erro: "Não consegui excluir o lead." }, { status: 500 });
  }
}
