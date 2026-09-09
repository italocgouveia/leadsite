import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, leads } from "@/lib/db";
import { analisarSite, oportunidadesDoSite } from "@/lib/analise-site";
import { enriquecerPeloSite } from "@/lib/enriquecimento-site";

/**
 * 🔎 ANÁLISE DE SITE, sob demanda.
 *
 * SÓ LEITURA. A rota busca a home pública do lead, extrai o que a empresa
 * publicou e devolve — junto com o que PODERIA ser gravado e por quê. Ela não
 * grava nada: a decisão de escrever no cadastro é do script de enriquecimento,
 * que roda com dry-run por padrão e sob supervisão.
 *
 * Por que separar ver de gravar: a análise é barata e reversível; a gravação
 * não. Um botão que faz as duas coisas de uma vez transforma curiosidade em
 * alteração de base.
 */
export const dynamic = "force-dynamic";

const corpo = z.object({ leadId: z.string().uuid() });

export async function POST(req: Request) {
  const dados = corpo.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });

  const [lead] = await db.select().from(leads).where(eq(leads.id, dados.data.leadId)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
  if (!lead.website) {
    return NextResponse.json({ ok: false, motivo: "Este lead não tem site cadastrado" });
  }

  const analise = await analisarSite(lead.website);
  /** A simulação é sempre `true` aqui — esta rota nunca escreve. */
  const enriquecimento = await enriquecerPeloSite(lead, true);

  return NextResponse.json({
    analise,
    oportunidades: analise.ok ? oportunidadesDoSite(analise) : [],
    achados: enriquecimento.achados,
    /** O que uma gravação supervisionada aproveitaria deste lead. */
    gravaria: enriquecimento.gravaria,
  });
}
