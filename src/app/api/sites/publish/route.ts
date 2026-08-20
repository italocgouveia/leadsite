import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";

const Body = z.object({
  siteId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/).optional(),
  publicado: z.boolean().default(true),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  try {
    const [site] = await db
      .update(sites)
      .set({
        publicado: params.publicado,
        ...(params.slug ? { slug: params.slug } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(sites.id, params.siteId))
      .returning();

    if (!site) {
      return NextResponse.json({ erro: "Site não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ site, url: `/s/${site.slug}` });
  } catch {
    // Único índice único que pode estourar aqui é o do slug.
    return NextResponse.json({ erro: "Esse endereço já está em uso" }, { status: 409 });
  }
}
