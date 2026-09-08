import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, leads, STATUS_INSTAGRAM } from "@/lib/db";
import { oportunidades } from "@/lib/oportunidades";

/**
 * A FILA MANUAL DE INSTAGRAM.
 *
 * GET   → as empresas para abordar à mão, ordenadas por oportunidade.
 * PATCH → move o status manual de UMA empresa.
 *
 * O QUE ESTA ROTA NUNCA FAZ, e é o motivo de ela existir separada:
 *
 *   não cria mensagem · não aprova · não enfileira envio · não fala com a
 *   Bridge · não encosta em `etapa`.
 *
 * `etapa` é o funil do WhatsApp. O status daqui vive em `instagramStatus`,
 * coluna própria — é isso que permite deixar o disparo automático rodando e
 * trabalhar o Instagram à mão ao mesmo tempo, sem um mexer no outro.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const segmento = q.get("segmento") || undefined;

  /**
   * `incluirContatados: true` porque a fila do Instagram não tem nada a ver
   * com a janela de recontato do WhatsApp: alguém que recebeu mensagem por
   * WhatsApp semana passada continua sendo abordável por Instagram hoje.
   */
  const r = await oportunidades(
    { fila: "instagram", segmento, somenteWhatsapp: false, incluirContatados: true },
    200,
  );

  return NextResponse.json({
    total: r.leads.length,
    resumo: r.canais,
    leads: r.leads.map((l) => ({
      id: l.id,
      nome: l.nome,
      nicho: l.segmento,
      cidade: l.cidade,
      username: l.instagramUsername,
      url: l.instagramUrl,
      canal: l.canal,
      scoreComercial: l.scoreComercial,
      scoreContatabilidade: l.scoreContatabilidade,
      scoreFinal: l.scoreFinal,
      solucao: l.sistema,
      oportunidade: l.dor,
      porQue: l.porQue,
      porteEstimadoRotulo: l.porteEstimadoRotulo,
      temWhatsapp: l.canal === "ambos",
      status: l.instagramStatus ?? "nao-abordado",
    })),
  });
}

const Mudanca = z.object({
  leadId: z.string().uuid(),
  status: z.enum(STATUS_INSTAGRAM),
});

export async function PATCH(request: Request) {
  let params;
  try {
    params = Mudanca.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, params.leadId)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  /**
   * O UPDATE toca em DUAS colunas e mais nada. `etapa`, `naoContatar`,
   * `whatsapp` e `telefone` ficam intocados de propósito — marcar "sem
   * interesse" no Instagram não pode tirar o lead da campanha de WhatsApp,
   * porque são conversas diferentes com pessoas possivelmente diferentes.
   */
  await db
    .update(leads)
    .set({
      instagramStatus: params.status,
      instagramAbordadoEm: params.status === "nao-abordado" ? null : new Date(),
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, params.leadId));

  return NextResponse.json({ ok: true, leadId: params.leadId, status: params.status });
}
