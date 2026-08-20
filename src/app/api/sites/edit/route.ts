import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, leads, sites, siteVersions } from "@/lib/db";
import { editarSite } from "@/lib/gen/site";
import { validarSite } from "@/lib/gen/validar";

export const maxDuration = 300;

const Body = z.object({
  siteId: z.string().uuid(),
  pedido: z.string().min(3).max(2000),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [site] = await db.select().from(sites).where(eq(sites.id, params.siteId)).limit(1);
  if (!site) {
    return NextResponse.json({ erro: "Site não encontrado" }, { status: 404 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, site.leadId)).limit(1);
  if (!lead) {
    return NextResponse.json({ erro: "Lead do site não encontrado" }, { status: 404 });
  }

  let html: string;
  try {
    html = await editarSite(site.html, params.pedido, lead);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao editar";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  const validacao = validarSite(html, lead);
  html = validacao.html;

  const [ultima] = await db
    .select({ versao: siteVersions.versao })
    .from(siteVersions)
    .where(eq(siteVersions.siteId, site.id))
    .orderBy(desc(siteVersions.versao))
    .limit(1);

  const [atualizado] = await db
    .update(sites)
    .set({ html, atualizadoEm: new Date() })
    .where(eq(sites.id, site.id))
    .returning();

  await db.insert(siteVersions).values({
    siteId: site.id,
    versao: (ultima?.versao ?? 0) + 1,
    html,
    prompt: params.pedido,
  });

  return NextResponse.json({ site: atualizado, problemas: validacao.problemas });
}
