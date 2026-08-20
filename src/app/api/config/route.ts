import { NextResponse } from "next/server";
import { z } from "zod";
import { db, configuracoes } from "@/lib/db";
import { carregarConfig, CONFIG_ID as ID } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ config: await carregarConfig() });
}

const Body = z.object({
  marcaDaguaAtiva: z.boolean().optional(),
  marcaDaguaTexto: z.string().max(80).nullable().optional(),
  marcaDaguaUrl: z.string().url().nullable().optional().or(z.literal("")),
  pixelFacebook: z.string().max(40).nullable().optional(),
  googleAnalytics: z.string().max(40).nullable().optional(),
  googleAds: z.string().max(40).nullable().optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const valores = { ...params, id: ID, atualizadoEm: new Date() };

  const [config] = await db
    .insert(configuracoes)
    .values(valores)
    .onConflictDoUpdate({ target: configuracoes.id, set: valores })
    .returning();

  return NextResponse.json({ config });
}
