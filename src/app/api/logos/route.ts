import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, leads, logos } from "@/lib/db";
import { gerarLogo } from "@/lib/gen/logo";

export const maxDuration = 120;

const Body = z.object({
  leadId: z.string().uuid(),
  direcao: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, params.leadId)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  let resultado;
  try {
    resultado = await gerarLogo(lead, params.direcao);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gerar o logo";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  const [logo] = await db
    .insert(logos)
    .values({ leadId: lead.id, svg: resultado.svg, conceito: resultado.conceito })
    .returning();

  return NextResponse.json({ logo });
}

export async function GET(request: Request) {
  const leadId = new URL(request.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ erro: "leadId obrigatório" }, { status: 400 });

  const lista = await db
    .select()
    .from(logos)
    .where(eq(logos.leadId, leadId))
    .orderBy(desc(logos.criadoEm));

  return NextResponse.json({ logos: lista });
}
