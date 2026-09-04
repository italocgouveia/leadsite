import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, leads, negocios, conversas, type MemoriaComercial } from "@/lib/db";
import { determinarProximaAcao, type ContextoConversa } from "@/lib/proxima-acao";
import { detectarObjecao } from "@/lib/objecoes";
import { sondagensDeDiagnostico, lerResposta } from "@/lib/diagnostico";
import { esboçarProposta, ajustePorComportamento } from "@/lib/comercial";
import { pontuar } from "@/lib/pontuacao";
import type { Intencao } from "@/lib/classificar";

/**
 * O painel comercial de UM lead: o que já se sabe, e o que fazer agora.
 *
 * GET  → próxima ação, objeção detectada, diagnóstico, memória e esboço da
 *        proposta. Tudo calculado de dados já gravados — nenhuma chamada de IA,
 *        nenhum custo, então pode abrir à vontade.
 * PATCH→ registra o que a conversa revelou (resposta de diagnóstico, dor,
 *        objeção) e cria/atualiza o negócio.
 *
 * Não envia mensagem em nenhum verbo. O que sai daqui é sugestão na tela.
 */
export const dynamic = "force-dynamic";

async function montar(leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return null;

  const msgs = await db
    .select()
    .from(conversas)
    .where(eq(conversas.leadId, leadId))
    .orderBy(desc(conversas.criadoEm))
    .limit(30);

  const recebidas = msgs.filter((m) => m.direcao === "recebida");
  const enviadas = msgs.filter((m) => m.direcao === "enviada");
  const ultimaRecebida = recebidas[0];

  /**
   * A objeção é lida da ÚLTIMA mensagem do lead, não do histórico inteiro:
   * uma objeção de preço resolvida há duas semanas não deve continuar
   * travando a próxima ação de hoje.
   */
  const objecao = ultimaRecebida ? detectarObjecao(ultimaRecebida.texto) : null;

  const memoria: MemoriaComercial = lead.memoriaComercial ?? {};
  const respostas = memoria.respostas ?? [];

  const [negocio] = await db
    .select()
    .from(negocios)
    .where(eq(negocios.leadId, leadId))
    .orderBy(desc(negocios.criadoEm))
    .limit(1);

  const ctx: ContextoConversa = {
    respondeu: recebidas.length > 0,
    ultimaRecebidaEm: ultimaRecebida?.criadoEm ?? null,
    ultimaEnviadaEm: enviadas[0]?.criadoEm ?? null,
    intencao: (lead.intencao as Intencao | null) ?? null,
    objecao: objecao ? { id: objecao.id, nome: objecao.nome, pergunta: objecao.pergunta } : null,
    diagnosticoRespondido: respostas.length,
    temProposta: Boolean(negocio && negocio.status !== "rascunho"),
  };

  const base = pontuar(lead);
  const ajuste = ajustePorComportamento(lead);

  const sondagens = sondagensDeDiagnostico(lead);
  const respondidas = new Set(respostas.map((r) => r.pergunta));

  return {
    lead: { id: lead.id, nome: lead.nome, categoria: lead.categoria, etapa: lead.etapa },
    /** Score do cadastro + o que o lead FEZ. Interno, nunca dito ao cliente. */
    score: {
      total: Math.max(0, Math.min(100, base.total + ajuste.pontos)),
      base: base.total,
      ajuste: ajuste.pontos,
      emoji: base.emoji,
      motivos: [...base.criterios.filter((c) => c.ganhou).map((c) => c.rotulo), ...ajuste.motivos],
    },
    proximaAcao: determinarProximaAcao(lead, ctx),
    objecao: objecao
      ? {
          id: objecao.id,
          nome: objecao.nome,
          estrategia: objecao.estratégia,
          resposta: objecao.resposta,
          trecho: ultimaRecebida?.texto.slice(0, 140) ?? "",
        }
      : null,
    diagnostico: sondagens.map((s) => ({
      pergunta: s.pergunta,
      investiga: s.investiga,
      respondida: respondidas.has(s.pergunta),
      resposta: respostas.find((r) => r.pergunta === s.pergunta)?.resposta ?? null,
      insight: respostas.find((r) => r.pergunta === s.pergunta)?.insight ?? null,
    })),
    memoria,
    proposta: esboçarProposta(lead),
    negocio: negocio ?? null,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  const dados = await montar(leadId);
  if (!dados) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
  return NextResponse.json(dados);
}

const Acao = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("responder-diagnostico"),
    pergunta: z.string().min(3).max(300),
    resposta: z.string().min(1).max(600),
  }),
  z.object({ acao: z.literal("salvar-memoria"), processoAtual: z.string().max(400).optional(), dorConfirmada: z.string().max(400).optional() }),
  z.object({
    acao: z.literal("salvar-negocio"),
    status: z.enum(["rascunho", "enviada", "negociacao", "fechada", "perdida", "implantacao", "ativo", "pausado", "cancelado"]).optional(),
    setup: z.number().int().min(0).max(1_000_000).nullable().optional(),
    mensalidade: z.number().int().min(0).max(100_000).nullable().optional(),
    solucao: z.string().max(60).optional(),
    problema: z.string().max(600).optional(),
    observacoes: z.string().max(2000).optional(),
    proximoFollowUp: z.string().datetime().nullable().optional(),
    motivoFollowUp: z.string().max(300).optional(),
  }),
]);

export async function PATCH(request: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  let params;
  try {
    params = Acao.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  const memoria: MemoriaComercial = lead.memoriaComercial ?? {};

  if (params.acao === "responder-diagnostico") {
    const leitura = lerResposta(params.resposta);
    const respostas = (memoria.respostas ?? []).filter((r) => r.pergunta !== params.pergunta);
    respostas.push({
      pergunta: params.pergunta,
      resposta: params.resposta,
      insight: leitura.insight,
      em: new Date().toISOString(),
    });

    /**
     * A dor só vira CONFIRMADA quando o cliente descreve um processo manual.
     * "Já temos sistema" e resposta vaga não confirmam nada — e é justamente
     * essa distinção que separa hipótese de fato na proposta.
     */
    const novaMemoria: MemoriaComercial = {
      ...memoria,
      respostas,
      processoAtual: leitura.sinal === "manual" ? params.resposta : memoria.processoAtual,
      dorConfirmada: leitura.confirmaDor
        ? `${params.pergunta} → ${params.resposta}`
        : memoria.dorConfirmada,
    };

    await db
      .update(leads)
      .set({ memoriaComercial: novaMemoria, atualizadoEm: new Date() })
      .where(eq(leads.id, leadId));

    return NextResponse.json({ ok: true, leitura, ...(await montar(leadId)) });
  }

  if (params.acao === "salvar-memoria") {
    await db
      .update(leads)
      .set({
        memoriaComercial: {
          ...memoria,
          ...(params.processoAtual !== undefined ? { processoAtual: params.processoAtual } : {}),
          ...(params.dorConfirmada !== undefined ? { dorConfirmada: params.dorConfirmada } : {}),
        },
        atualizadoEm: new Date(),
      })
      .where(eq(leads.id, leadId));
    return NextResponse.json({ ok: true, ...(await montar(leadId)) });
  }

  // ------------------------------------------------------------ negócio
  const [existente] = await db
    .select()
    .from(negocios)
    .where(eq(negocios.leadId, leadId))
    .orderBy(desc(negocios.criadoEm))
    .limit(1);

  const campos = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.setup !== undefined ? { setup: params.setup } : {}),
    ...(params.mensalidade !== undefined ? { mensalidade: params.mensalidade } : {}),
    ...(params.solucao ? { solucao: params.solucao } : {}),
    ...(params.problema ? { problema: params.problema } : {}),
    ...(params.observacoes !== undefined ? { observacoes: params.observacoes } : {}),
    ...(params.motivoFollowUp !== undefined ? { motivoFollowUp: params.motivoFollowUp } : {}),
    ...(params.proximoFollowUp !== undefined
      ? { proximoFollowUp: params.proximoFollowUp ? new Date(params.proximoFollowUp) : null }
      : {}),
    /**
     * Datas de marco preenchidas pela TRANSIÇÃO, não pelo cliente da API:
     * é o que garante que `fechadaEm` signifique sempre a mesma coisa.
     */
    ...(params.status === "enviada" && !existente?.enviadaEm ? { enviadaEm: new Date() } : {}),
    ...(params.status === "fechada" && !existente?.fechadaEm ? { fechadaEm: new Date() } : {}),
    ...(params.status === "ativo" && !existente?.inicioEm ? { inicioEm: new Date() } : {}),
    atualizadoEm: new Date(),
  };

  if (existente) {
    await db.update(negocios).set(campos).where(eq(negocios.id, existente.id));
  } else {
    const esboco = esboçarProposta(lead);
    await db.insert(negocios).values({
      leadId,
      solucao: params.solucao ?? esboco.solucao,
      modulos: esboco.modulos.map((m) => m.id),
      problema: params.problema ?? esboco.problema,
      ...campos,
    });
  }

  /**
   * O funil NÃO avança sozinho por causa de uma proposta criada. Proposta não
   * é fechamento — quem move o lead para "fechado" é você, de propósito.
   */
  if (params.status === "enviada" && lead.etapa !== "proposta") {
    await db.update(leads).set({ etapa: "proposta" }).where(eq(leads.id, leadId));
  }

  return NextResponse.json({ ok: true, ...(await montar(leadId)) });
}
