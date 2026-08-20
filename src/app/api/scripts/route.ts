import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, leads, sites, scripts } from "@/lib/db";
import { gerarScript } from "@/lib/gen/scripts";

export const maxDuration = 120;

const Body = z.object({
  leadId: z.string().uuid(),
  tipo: z.enum(["whatsapp", "ligacao", "reuniao", "objecao"]),
  regerar: z.boolean().default(false),
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

  if (!params.regerar) {
    const [existente] = await db
      .select()
      .from(scripts)
      .where(and(eq(scripts.leadId, lead.id), eq(scripts.tipo, params.tipo)))
      .orderBy(desc(scripts.criadoEm))
      .limit(1);

    if (existente) return NextResponse.json({ script: existente, reaproveitado: true });
  }

  // Se já existe prévia publicada, o script menciona — muda muito a taxa de resposta.
  const [site] = await db.select().from(sites).where(eq(sites.leadId, lead.id)).limit(1);
  const urlPrevia = site?.publicado
    ? `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/s/${site.slug}`
    : null;

  let conteudo: string;
  try {
    conteudo = await gerarScript(lead, params.tipo, urlPrevia);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gerar o script";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  const [script] = await db
    .insert(scripts)
    .values({ leadId: lead.id, tipo: params.tipo, conteudo })
    .returning();

  return NextResponse.json({ script });
}

export async function GET(request: Request) {
  const leadId = new URL(request.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ erro: "leadId obrigatório" }, { status: 400 });

  const lista = await db
    .select()
    .from(scripts)
    .where(eq(scripts.leadId, leadId))
    .orderBy(desc(scripts.criadoEm));

  return NextResponse.json({ scripts: lista });
}
