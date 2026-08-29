import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, eventos, mensagens, campanhas } from "@/lib/db";

/**
 * Atividades + Campanhas do lead, para as abas do painel.
 *
 * `eventos` já é gravado por todo o sistema (lib/campanha.ts `registrar`) —
 * é o log que responde "o que aconteceu com este lead?" sem precisar de uma
 * tabela de auditoria nova.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [linhaEventos, linhaMensagens] = await Promise.all([
    db.select().from(eventos).where(eq(eventos.leadId, id)).orderBy(desc(eventos.criadoEm)).limit(200),
    db
      .select({
        id: mensagens.id,
        texto: mensagens.texto,
        status: mensagens.status,
        origem: mensagens.origem,
        enviadaEm: mensagens.enviadaEm,
        criadoEm: mensagens.criadoEm,
        campanhaNome: campanhas.nome,
      })
      .from(mensagens)
      .leftJoin(campanhas, eq(mensagens.campanhaId, campanhas.id))
      .where(and(eq(mensagens.leadId, id), isNotNull(mensagens.campanhaId)))
      .orderBy(desc(mensagens.criadoEm)),
  ]);

  return NextResponse.json({ eventos: linhaEventos, mensagensCampanha: linhaMensagens });
}
