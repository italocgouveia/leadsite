import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, respostasAutomaticas, configuracoes } from "@/lib/db";
import { INTENCOES_COM_RESPOSTA_AUTOMATICA, type IntencaoComRespostaAutomatica } from "@/lib/db/schema";
import { ROTULO_INTENCAO } from "@/lib/classificar";
import { CONFIG_ID } from "@/lib/config";

/**
 * Regras de resposta automática: uma linha por categoria de intenção.
 *
 * O motor de DETECÇÃO fica em lib/classificar.ts, calibrado por ordem e peso
 * — não é editável aqui. Esta tela só edita o TEXTO que sai quando cada
 * categoria é detectada, e se ela está ligada ou não.
 */

export async function GET() {
  const existentes = await db.select().from(respostasAutomaticas);
  const porIntencao = new Map(existentes.map((r) => [r.intencao, r]));

  // Garante uma linha para cada categoria, mesmo na primeira vez.
  const faltando = INTENCOES_COM_RESPOSTA_AUTOMATICA.filter((i) => !porIntencao.has(i));
  if (faltando.length > 0) {
    await db.insert(respostasAutomaticas).values(faltando.map((intencao) => ({ intencao })));
  }

  const regras = faltando.length > 0 ? await db.select().from(respostasAutomaticas) : existentes;
  const [cfg] = await db.select().from(configuracoes).limit(1);

  return NextResponse.json({
    ativa: cfg?.respostaAutomaticaAtiva ?? false,
    regras: regras
      .sort(
        (a, b) =>
          INTENCOES_COM_RESPOSTA_AUTOMATICA.indexOf(a.intencao as IntencaoComRespostaAutomatica) -
          INTENCOES_COM_RESPOSTA_AUTOMATICA.indexOf(b.intencao as IntencaoComRespostaAutomatica),
      )
      .map((r) => ({
        ...r,
        rotulo: ROTULO_INTENCAO[r.intencao as keyof typeof ROTULO_INTENCAO]?.rotulo ?? r.intencao,
        emoji: ROTULO_INTENCAO[r.intencao as keyof typeof ROTULO_INTENCAO]?.emoji ?? "💬",
      })),
  });
}

const Body = z.object({
  intencao: z.enum(INTENCOES_COM_RESPOSTA_AUTOMATICA),
  texto: z.string().max(1000).optional(),
  ativa: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const { intencao, ...valores } = params;
  if (Object.keys(valores).length === 0) {
    return NextResponse.json({ erro: "Nada para atualizar" }, { status: 400 });
  }

  const [existente] = await db
    .select({ id: respostasAutomaticas.id })
    .from(respostasAutomaticas)
    .where(eq(respostasAutomaticas.intencao, intencao))
    .limit(1);

  const [regra] = existente
    ? await db
        .update(respostasAutomaticas)
        .set({ ...valores, atualizadoEm: new Date() })
        .where(eq(respostasAutomaticas.id, existente.id))
        .returning()
    : await db
        .insert(respostasAutomaticas)
        .values({ intencao, ...valores })
        .returning();

  return NextResponse.json({ regra });
}

const BodyGlobal = z.object({ respostaAutomaticaAtiva: z.boolean() });

/** Toggle mestre — mesma tabela `configuracoes` de `automacaoAtiva`. */
export async function PUT(request: Request) {
  let params;
  try {
    params = BodyGlobal.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  await db
    .insert(configuracoes)
    .values({ id: CONFIG_ID, ...params, atualizadoEm: new Date() })
    .onConflictDoUpdate({ target: configuracoes.id, set: { ...params, atualizadoEm: new Date() } });

  return NextResponse.json({ ok: true, ...params });
}
