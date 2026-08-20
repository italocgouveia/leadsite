import { eq, and } from "drizzle-orm";
import { db, sites } from "@/lib/db";

/**
 * URL pública que você manda pro cliente no WhatsApp.
 * É o que fecha a venda — o dono abre no celular e vê o negócio dele pronto.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.slug, slug), eq(sites.publicado, true)))
    .limit(1);

  if (!site) {
    return new Response("Site não encontrado", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(site.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Cache curto: você edita e reenvia o link na hora, sem esperar CDN.
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
