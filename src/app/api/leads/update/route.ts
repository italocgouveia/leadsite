import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, leads } from "@/lib/db";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1),
  etapa: z
    .enum(["novo", "contatado", "respondeu", "proposta", "cliente", "perdido"])
    .optional(),
  notas: z.string().max(5000).optional(),
  // Dados que só o dono do negócio sabe — habilitam as seções ricas do site.
  precos: z.string().max(3000).optional(),
  horarios: z.string().max(600).optional(),
  pagamento: z.string().max(300).optional(),
  diferenciais: z.string().max(1500).optional(),
  visto: z.boolean().optional(),
  noCrm: z.boolean().optional(),
});

const CAMPOS_EXTRA = [
  "precos",
  "horarios",
  "pagamento",
  "diferenciais",
  "visto",
  "noCrm",
] as const;

/** Move lead(s) de etapa no funil ou atualiza a anotação. */
export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const temExtra = CAMPOS_EXTRA.some((c) => params[c] !== undefined);
  if (params.etapa === undefined && params.notas === undefined && !temExtra) {
    return NextResponse.json({ erro: "Nada para atualizar" }, { status: 400 });
  }

  const atualizados = await db
    .update(leads)
    .set({
      ...(params.etapa !== undefined ? { etapa: params.etapa } : {}),
      ...(params.notas !== undefined ? { notas: params.notas } : {}),
      ...Object.fromEntries(
        CAMPOS_EXTRA.filter((c) => params[c] !== undefined).map((c) => [c, params[c]]),
      ),
      atualizadoEm: new Date(),
    })
    .where(params.ids.length === 1 ? eq(leads.id, params.ids[0]) : inArray(leads.id, params.ids))
    .returning();

  return NextResponse.json({ leads: atualizados });
}
