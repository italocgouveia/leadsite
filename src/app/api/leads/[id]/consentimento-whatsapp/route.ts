import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, eventos, leads } from "@/lib/db";
import { estadoConsentimentoWhatsApp } from "@/lib/consentimento-whatsapp";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead] = await db.select({ naoContatar: leads.naoContatar }).from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });
  return NextResponse.json({ ...(await estadoConsentimentoWhatsApp(id)), bloqueado: lead.naoContatar });
}

const Body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("registrar"), evidencia: z.string().trim().min(8).max(500) }),
  z.object({ acao: z.literal("revogar"), evidencia: z.string().trim().min(3).max(500) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Informe a ação e a origem do consentimento." }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });

  if (body.acao === "registrar" && lead.naoContatar) {
    return NextResponse.json(
      { erro: "Este lead está marcado como não contactar. Revise o bloqueio antes de registrar novo consentimento." },
      { status: 409 },
    );
  }

  if (body.acao === "revogar") {
    await db.update(leads).set({ naoContatar: true, atualizadoEm: new Date() }).where(eq(leads.id, id));
  }

  const registrado = body.acao === "registrar";
  await db.insert(eventos).values({
    leadId: id,
    tipo: registrado ? "whatsapp.consentimento-registrado" : "whatsapp.consentimento-revogado",
    descricao: registrado
      ? `Consentimento para mensagens no WhatsApp registrado. Evidência: ${body.evidencia}`
      : `Consentimento para mensagens no WhatsApp revogado. Registro: ${body.evidencia}`,
    dados: { evidencia: body.evidencia, canal: "whatsapp" },
  });

  return NextResponse.json({ ok: true, ...(await estadoConsentimentoWhatsApp(id)), bloqueado: !registrado });
}
