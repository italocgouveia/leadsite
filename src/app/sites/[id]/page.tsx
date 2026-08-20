import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db, sites, siteVersions } from "@/lib/db";
import Editor from "./editor";

export const dynamic = "force-dynamic";

/**
 * Busca no servidor e entrega pronto pro client component.
 * Evita o efeito-com-fetch que gera render em cascata e tela piscando.
 */
export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!site) notFound();

  const versoes = await db
    .select({
      id: siteVersions.id,
      versao: siteVersions.versao,
      prompt: siteVersions.prompt,
      criadoEm: siteVersions.criadoEm,
    })
    .from(siteVersions)
    .where(eq(siteVersions.siteId, id))
    .orderBy(desc(siteVersions.versao));

  return <Editor siteInicial={site} versoesIniciais={versoes} />;
}
