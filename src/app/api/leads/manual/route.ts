import { NextResponse } from "next/server";
import { z } from "zod";
import { db, leads } from "@/lib/db";
import { linkWhatsapp, formatarTelefone } from "@/lib/telefone";
import { auditarSite, calcularScore } from "@/lib/places/audit";

/**
 * "Crie sites pra quem não está na busca."
 *
 * Cliente que veio por indicação, negócio novo que ainda não tem ficha no Maps,
 * ou aquele lead que você anotou num guardanapo. Mesmo pipeline, entrada manual.
 */

const Body = z.object({
  nome: z.string().min(2),
  categoria: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  bairro: z.string().optional(),
  endereco: z.string().optional(),
  telefone: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  /** O que já se sabe sobre o negócio — vira base da seção de destaque no site gerado. */
  diferenciais: z.string().optional(),
  notas: z.string().optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  // Mesmo entrando na mão, o site informado é auditado de verdade.
  const auditoria = await auditarSite(params.website);
  const { score, temperatura } = calcularScore({
    status: auditoria.status,
    nota: null,
    avaliacoes: null,
    temTelefone: Boolean(params.telefone),
  });

  const [lead] = await db
    .insert(leads)
    .values({
      // Sem place_id do Google, geramos um sintético pra não quebrar o índice único.
      placeId: `manual:${crypto.randomUUID()}`,
      nome: params.nome,
      categoria: params.categoria ?? null,
      cidade: params.cidade ?? null,
      estado: params.estado ?? null,
      bairro: params.bairro ?? null,
      endereco: params.endereco ?? null,
      telefone: formatarTelefone(params.telefone),
      whatsapp: linkWhatsapp(params.telefone),
      website: params.website ?? null,
      instagram: params.instagram ?? null,
      diferenciais: params.diferenciais ?? null,
      notas: params.notas ?? null,
      fotos: [],
      statusSite: auditoria.status,
      score,
      temperatura,
    })
    .returning();

  return NextResponse.json({ lead });
}
