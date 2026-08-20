import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db, leads, sites } from "@/lib/db";
import PainelLead from "./painel";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) notFound();

  const [site] = await db
    .select({ id: sites.id, slug: sites.slug, publicado: sites.publicado })
    .from(sites)
    .where(eq(sites.leadId, id))
    .orderBy(desc(sites.atualizadoEm))
    .limit(1);

  return <PainelLead lead={lead} site={site ?? null} />;
}
