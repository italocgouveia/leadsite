import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, sites, siteVersions } from "@/lib/db";

/** Lista as versões (sem o HTML — a lista ficaria pesada à toa). */
export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ erro: "siteId obrigatório" }, { status: 400 });

  const versoes = await db
    .select({
      id: siteVersions.id,
      versao: siteVersions.versao,
      prompt: siteVersions.prompt,
      criadoEm: siteVersions.criadoEm,
    })
    .from(siteVersions)
    .where(eq(siteVersions.siteId, siteId))
    .orderBy(desc(siteVersions.versao));

  return NextResponse.json({ versoes });
}

const Restaurar = z.object({
  siteId: z.string().uuid(),
  versao: z.number().int().positive(),
});

/**
 * Voltar pra uma versão antiga NÃO apaga o histórico: copia o HTML antigo
 * para uma versão nova no topo. Assim dá pra desfazer o desfazer.
 */
export async function POST(request: Request) {
  let params;
  try {
    params = Restaurar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [alvo] = await db
    .select()
    .from(siteVersions)
    .where(and(eq(siteVersions.siteId, params.siteId), eq(siteVersions.versao, params.versao)))
    .limit(1);

  if (!alvo) return NextResponse.json({ erro: "Versão não encontrada" }, { status: 404 });

  const [ultima] = await db
    .select({ versao: siteVersions.versao })
    .from(siteVersions)
    .where(eq(siteVersions.siteId, params.siteId))
    .orderBy(desc(siteVersions.versao))
    .limit(1);

  const [site] = await db
    .update(sites)
    .set({ html: alvo.html, atualizadoEm: new Date() })
    .where(eq(sites.id, params.siteId))
    .returning();

  await db.insert(siteVersions).values({
    siteId: params.siteId,
    versao: (ultima?.versao ?? 0) + 1,
    html: alvo.html,
    prompt: `Restaurado da versão ${params.versao}`,
  });

  return NextResponse.json({ site });
}
