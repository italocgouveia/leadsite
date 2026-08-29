import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, conversas, leads, mensagens } from "@/lib/db";
import { numeroDoLead } from "@/lib/fila";
import { lerConfigProvedor } from "@/lib/integracao";
import { provedorDe } from "@/lib/providers";
import { registrar } from "@/lib/campanha";

async function buscarLead(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return lead ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = await buscarLead(leadId);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  const thread = await db
    .select()
    .from(conversas)
    .where(eq(conversas.leadId, leadId))
    .orderBy(conversas.criadoEm);

  return NextResponse.json({ lead, mensagens: thread });
}

const BodyPatch = z.object({ acao: z.enum(["marcar-lida", "assumir", "devolver"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  let body;
  try {
    body = BodyPatch.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  if (body.acao === "marcar-lida") {
    await db
      .update(conversas)
      .set({ lida: true })
      .where(and(eq(conversas.leadId, leadId), eq(conversas.direcao, "recebida")));
    return NextResponse.json({ ok: true });
  }

  const atendimentoHumano = body.acao === "assumir";
  await db.update(leads).set({ atendimentoHumano, atualizadoEm: new Date() }).where(eq(leads.id, leadId));
  return NextResponse.json({ ok: true, atendimentoHumano });
}

const BodyPost = z.object({ texto: z.string().min(1).max(4000) });

/** Envio manual avulso, direto do inbox — sem passar pela fila de campanha. */
export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  let body;
  try {
    body = BodyPost.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const lead = await buscarLead(leadId);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
  if (lead.naoContatar) {
    return NextResponse.json({ erro: "Lead marcado como não contatar." }, { status: 422 });
  }
  const numero = numeroDoLead(lead);
  if (!numero) return NextResponse.json({ erro: "Lead sem WhatsApp." }, { status: 422 });

  const cfgProv = await lerConfigProvedor();
  if (!cfgProv) return NextResponse.json({ erro: "Provedor não configurado." }, { status: 422 });

  const r = await provedorDe(cfgProv.tipo).enviar(cfgProv, numero, body.texto);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });

  const agora = new Date();
  await db.insert(mensagens).values({
    leadId,
    texto: body.texto,
    status: "enviada",
    origem: "modelo",
    provedorId: r.provedorId,
    campanhaId: null,
    enviadaEm: agora,
  });
  await db.insert(conversas).values({
    leadId,
    direcao: "enviada",
    autor: "humano",
    texto: body.texto,
    provedorMsgId: r.provedorId,
    lida: true,
  });
  await registrar("MANUAL_MESSAGE_SENT", `Mensagem manual enviada para ${lead.nome}`, { leadId });

  return NextResponse.json({ ok: true });
}
