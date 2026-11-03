import { and, desc, eq, inArray } from "drizzle-orm";
import { db, eventos } from "@/lib/db";

const TIPOS_CONSENTIMENTO = [
  "whatsapp.consentimento-registrado",
  "whatsapp.consentimento-revogado",
] as const;

export async function estadoConsentimentoWhatsApp(leadId: string) {
  const [ultimo] = await db
    .select({ tipo: eventos.tipo, descricao: eventos.descricao, criadoEm: eventos.criadoEm })
    .from(eventos)
    .where(and(eq(eventos.leadId, leadId), inArray(eventos.tipo, [...TIPOS_CONSENTIMENTO])))
    .orderBy(desc(eventos.criadoEm))
    .limit(1);

  return {
    autorizado: ultimo?.tipo === "whatsapp.consentimento-registrado",
    atualizadoEm: ultimo?.criadoEm ?? null,
    descricao: ultimo?.descricao ?? null,
  };
}
