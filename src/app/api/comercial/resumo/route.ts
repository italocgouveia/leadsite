import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, leads, negocios, conversas } from "@/lib/db";
import { pipeline, desempenhoPorNicho, followUpsPendentes, ajustePorComportamento } from "@/lib/comercial";
import { determinarProximaAcao } from "@/lib/proxima-acao";
import { detectarObjecao } from "@/lib/objecoes";
import { pontuar } from "@/lib/pontuacao";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import type { Intencao } from "@/lib/classificar";

/**
 * Tudo que o painel e o pipeline precisam, numa chamada só.
 *
 * POR QUE AGREGADO, E NÃO UM ENDPOINT POR BLOCO
 *
 * Com 924 leads, montar "melhores oportunidades" pedindo o painel comercial de
 * cada lead seria 924 requisições — o N+1 clássico. Aqui as conversas vêm numa
 * query agrupada e os motores rodam em memória: são funções puras
 * (lib/proxima-acao, lib/objecoes, lib/pontuacao), custo desprezível e zero
 * chamadas de IA.
 *
 * NENHUM cálculo novo mora aqui. Pipeline, MRR, ranking, score e próxima ação
 * vêm dos motores que já existem — este arquivo só junta e recorta.
 *
 * Só leitura. Não envia, não aprova, não gera.
 */
export const dynamic = "force-dynamic";

/** Etapas que contam como "já abordado" — mesma lista de lib/metricas. */
const ABORDADOS = ["mensagem-enviada", "respondeu", "interessado", "reuniao", "proposta", "fechado"];
const RESPONDERAM = ["respondeu", "interessado", "reuniao", "proposta", "fechado"];
const INTERESSADOS = ["interessado", "reuniao", "proposta", "fechado"];

/** Parado há mais que isto merece um olhar. Só sinaliza — nada dispara. */
const DIAS_PARADO = 7;

export async function GET() {
  const [todos, pl, nichos, followUps] = await Promise.all([
    db.select().from(leads),
    pipeline(),
    desempenhoPorNicho(),
    followUpsPendentes(),
  ]);

  /**
   * Última mensagem recebida por lead, numa query agrupada.
   * É o que permite detectar objeção sem abrir conversa por conversa.
   */
  const ultimas = await db
    .select({
      leadId: conversas.leadId,
      texto: sql<string>`(array_agg(${conversas.texto} order by ${conversas.criadoEm} desc))[1]`,
      em: sql<Date>`max(${conversas.criadoEm})`,
    })
    .from(conversas)
    .where(eq(conversas.direcao, "recebida"))
    .groupBy(conversas.leadId);

  const porLead = new Map(ultimas.map((u) => [u.leadId, u]));

  const negociosPorLead = new Map(
    (
      await db
        .select({ leadId: negocios.leadId, status: negocios.status, setup: negocios.setup, mensalidade: negocios.mensalidade })
        .from(negocios)
    ).map((n) => [n.leadId, n]),
  );

  // ---------------------------------------------------------- funil
  const conta = (etapas: string[]) => todos.filter((l) => etapas.includes(l.etapa)).length;
  const abordados = conta(ABORDADOS);
  const responderam = conta(RESPONDERAM);
  const interessados = conta(INTERESSADOS);
  const diagnosticos = todos.filter((l) => (l.memoriaComercial?.respostas?.length ?? 0) > 0).length;
  const propostas = conta(["proposta", "fechado"]);
  const ganhos = conta(["fechado"]);
  const perdidos = todos.filter((l) => ["sem-interesse", "ja-tem-sistema"].includes(l.etapa)).length;

  /**
   * Taxa só existe com denominador. Sem base, devolve `null` e a tela mostra
   * "—" — nunca "0%", que faria parecer que 1.000 abordagens não converteram
   * nada quando na verdade não houve abordagem nenhuma.
   */
  const taxa = (parte: number, base: number): number | null =>
    base > 0 ? Math.round((parte / base) * 1000) / 10 : null;

  // ------------------------------------------- melhores oportunidades
  const agora = Date.now();
  const ranking = todos
    .filter((l) => !l.naoContatar && !["sem-interesse", "ja-tem-sistema", "opt-out"].includes(l.etapa))
    .map((lead) => {
      const base = pontuar(lead);
      const ajuste = ajustePorComportamento(lead);
      const ultima = porLead.get(lead.id);
      const objecao = ultima ? detectarObjecao(ultima.texto) : null;
      const encaixe = avaliarSistema(lead);
      const memoria = lead.memoriaComercial;

      const acao = determinarProximaAcao(lead, {
        respondeu: Boolean(ultima),
        ultimaRecebidaEm: ultima?.em ?? null,
        ultimaEnviadaEm: lead.ultimaInteracao,
        intencao: (lead.intencao as Intencao | null) ?? null,
        objecao: objecao ? { id: objecao.id, nome: objecao.nome, pergunta: objecao.pergunta } : null,
        diagnosticoRespondido: memoria?.respostas?.length ?? 0,
        temProposta: negociosPorLead.get(lead.id)?.status !== undefined,
      });

      const mexidoEm = lead.atualizadoEm?.getTime() ?? agora;
      return {
        id: lead.id,
        nome: lead.nome,
        nicho: categoriaSingular(lead.categoria),
        etapa: lead.etapa,
        score: Math.max(0, Math.min(100, base.total + ajuste.pontos)),
        emoji: base.emoji,
        /** Só o que o lead realmente ganhou — nada inventado. */
        motivos: [...base.criterios.filter((c) => c.ganhou).map((c) => c.rotulo), ...ajuste.motivos],
        dorConfirmada: memoria?.dorConfirmada ?? null,
        hipotese: encaixe.serve ? encaixe.dor : null,
        solucao: encaixe.serve ? encaixe.sistema : null,
        proximaAcao: { titulo: acao.titulo, pergunta: acao.pergunta ?? null, urgencia: acao.urgencia },
        objecao: objecao ? { nome: objecao.nome, resposta: objecao.resposta } : null,
        diasParado: Math.floor((agora - mexidoEm) / 86_400_000),
        valorPotencial: lead.valorPotencial,
        negocio: negociosPorLead.get(lead.id) ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({
    indicadores: {
      leads: todos.length,
      comWhatsapp: todos.filter((l) => l.whatsapp).length,
      abordados,
      responderam,
      interessados,
      diagnosticos,
      propostas,
      negociacoes: pl.porEstado.find((e) => e.status === "negociacao")?.quantos ?? 0,
      ganhos,
      perdidos,
    },
    funil: [
      { etapa: "Abordados", quantos: abordados, taxa: null },
      { etapa: "Responderam", quantos: responderam, taxa: taxa(responderam, abordados) },
      { etapa: "Interessados", quantos: interessados, taxa: taxa(interessados, responderam) },
      { etapa: "Diagnóstico", quantos: diagnosticos, taxa: taxa(diagnosticos, interessados) },
      { etapa: "Proposta", quantos: propostas, taxa: taxa(propostas, diagnosticos) },
      { etapa: "Ganho", quantos: ganhos, taxa: taxa(ganhos, propostas) },
    ],
    /** Direto de lib/comercial.pipeline() — potencial e real já separados lá. */
    financeiro: pl,
    nichos,
    /**
     * Só destaca um "melhor nicho" quando a amostra sustenta. Com 3 abordagens
     * e 1 resposta, "33%" é ruído — e nomear isso de melhor nicho leva a
     * decidir a próxima campanha inteira em cima de acaso.
     */
    melhorNicho: nichos.find((n) => n.confiavel) ?? null,
    oportunidades: ranking.slice(0, 10),
    totalOportunidades: ranking.length,
    parados: ranking
      .filter((o) => o.diasParado >= DIAS_PARADO && ABORDADOS.includes(o.etapa))
      .slice(0, 8),
    followUps: followUps.map((f) => ({
      id: f.id,
      leadId: f.leadId,
      lead: f.lead,
      status: f.status,
      quando: f.quando?.toISOString() ?? null,
      motivo: f.motivo,
    })),
  });
}
