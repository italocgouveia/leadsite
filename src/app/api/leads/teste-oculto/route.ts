import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, leads } from "@/lib/db";

/**
 * Registra o teste de cliente oculto.
 *
 * Três ações: marcar que a pergunta foi enviada (`iniciar`), anotar o que
 * aconteceu (`resultado`) e desfazer (`limpar`).
 *
 * O `enviadoEm` é gravado pelo SERVIDOR, nunca vem do navegador. É essa data
 * que vira a frase "mandei uma mensagem ontem às 21h" na abordagem, e data que
 * o cliente controla é data em que não dá para confiar — inclusive contra
 * engano do próprio usuário, com relógio errado.
 */

const Body = z.object({
  leadId: z.string().uuid(),
  acao: z.enum(["iniciar", "resultado", "limpar"]),
  resultado: z.enum(["sem-resposta", "demorou", "rapida"]).optional(),
  minutos: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .optional(),
  observacao: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, params.leadId))
    .limit(1);

  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  if (params.acao === "limpar") {
    const [zerado] = await db
      .update(leads)
      .set({ testeOculto: null, atualizadoEm: new Date() })
      .where(eq(leads.id, lead.id))
      .returning();
    return NextResponse.json({ lead: zerado });
  }

  if (params.acao === "iniciar") {
    const [iniciado] = await db
      .update(leads)
      .set({
        testeOculto: { enviadoEm: new Date().toISOString(), resultado: null },
        // Mandar a pergunta JÁ é contato: o funil tem que refletir isso sozinho.
        etapa: lead.etapa === "novo" ? "contatado" : lead.etapa,
        noCrm: true,
        atualizadoEm: new Date(),
      })
      .where(eq(leads.id, lead.id))
      .returning();
    return NextResponse.json({ lead: iniciado });
  }

  // --- resultado ---
  if (!lead.testeOculto?.enviadoEm) {
    return NextResponse.json(
      { erro: "Não há teste em andamento para este lead." },
      { status: 409 },
    );
  }
  if (!params.resultado) {
    return NextResponse.json({ erro: "Informe o resultado." }, { status: 400 });
  }

  const [salvo] = await db
    .update(leads)
    .set({
      testeOculto: {
        ...lead.testeOculto,
        resultado: params.resultado,
        ...(params.minutos !== undefined ? { minutos: params.minutos } : {}),
        ...(params.observacao ? { observacao: params.observacao } : {}),
      },
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, lead.id))
    .returning();

  return NextResponse.json({ lead: salvo });
}
