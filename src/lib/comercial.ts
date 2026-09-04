import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, leads, negocios, mensagens, type Lead, type StatusNegocio } from "@/lib/db";
import { avaliarSistema, ROTULO_MODULO } from "@/lib/sistemas";

/**
 * A camada comercial: proposta, pipeline, MRR e follow-up.
 *
 * DUAS REGRAS QUE VALEM PARA TUDO AQUI
 *
 * 1. Receita POTENCIAL e receita REAL nunca se somam. São duas contas
 *    diferentes com nomes diferentes, e misturar as duas é como se convence
 *    de um faturamento que não existe.
 * 2. Preço nenhum é inventado. `setup` e `mensalidade` só têm valor quando
 *    alguém digitou; `null` aparece na tela como "a definir", não como zero e
 *    muito menos como um chute.
 *
 * Sem IA — a IA escreve o TEXTO da proposta (ver gen/proposta-comercial), os
 * números e os estados são regra.
 */

/** Estados em que o negócio ainda é promessa. */
const POTENCIAL: StatusNegocio[] = ["rascunho", "enviada", "negociacao"];
/** Estados em que o cliente paga de fato. */
const RECEITA_REAL: StatusNegocio[] = ["implantacao", "ativo"];

export type Pipeline = {
  /** Quantos negócios em cada estado. */
  porEstado: { status: StatusNegocio; quantos: number; setup: number; mensalidade: number }[];
  /** Soma do que AINDA NÃO fechou. É promessa, não caixa. */
  setupPotencial: number;
  mrrPotencial: number;
  /** Soma do que já é cliente pagante. */
  setupFechado: number;
  mrrAtual: number;
  /** Negócios sem valor definido — o número que explica um pipeline baixo. */
  semValorDefinido: number;
};

/**
 * O pipeline em números, separando promessa de caixa.
 *
 * `semValorDefinido` existe porque um pipeline de R$ 0 com 8 propostas na rua
 * não é um pipeline vazio: é um pipeline sem preço preenchido. Sem esse
 * contador, a tela pareceria dizer que as propostas não valem nada.
 */
export async function pipeline(): Promise<Pipeline> {
  const linhas = await db
    .select({
      status: negocios.status,
      quantos: sql<number>`count(*)::int`,
      setup: sql<number>`coalesce(sum(${negocios.setup}), 0)::int`,
      mensalidade: sql<number>`coalesce(sum(${negocios.mensalidade}), 0)::int`,
    })
    .from(negocios)
    .groupBy(negocios.status);

  const [sem] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(negocios)
    .where(
      and(
        inArray(negocios.status, POTENCIAL),
        sql`${negocios.setup} is null and ${negocios.mensalidade} is null`,
      ),
    );

  const soma = (estados: StatusNegocio[], campo: "setup" | "mensalidade") =>
    linhas.filter((l) => estados.includes(l.status)).reduce((s, l) => s + l[campo], 0);

  return {
    porEstado: linhas.map((l) => ({
      status: l.status,
      quantos: l.quantos,
      setup: l.setup,
      mensalidade: l.mensalidade,
    })),
    setupPotencial: soma(POTENCIAL, "setup"),
    mrrPotencial: soma(POTENCIAL, "mensalidade"),
    setupFechado: soma(["fechada", ...RECEITA_REAL], "setup"),
    /**
     * MRR conta só quem está pagando: implantação e ativo. `fechada` fica de
     * fora de propósito — negócio fechado que ainda não começou não gera
     * mensalidade, e contá-lo antecipa receita que não entrou. Perdido e
     * cancelado nunca entram.
     */
    mrrAtual: soma(RECEITA_REAL, "mensalidade"),
    semValorDefinido: sem?.n ?? 0,
  };
}

export type EsboçoProposta = {
  /** O problema, na palavra do cliente quando existe; hipótese quando não. */
  problema: string;
  problemaConfirmado: boolean;
  solucao: string;
  solucaoId: string | null;
  modulos: { id: string; rotulo: string }[];
  /** Sempre null aqui: preço é decisão humana. */
  setup: null;
  mensalidade: null;
  /** O que a tela precisa avisar antes de deixar enviar. */
  pendencias: string[];
};

/**
 * Monta o esqueleto de uma proposta a partir do que JÁ está registrado.
 *
 * Não chama IA e não sugere preço. O que ela faz é reunir: a dor confirmada
 * (se a conversa confirmou), a solução do catálogo para o ramo e os módulos do
 * escopo — e listar o que falta.
 *
 * `pendencias` é o ponto: uma proposta sem dor confirmada e sem preço PODE ser
 * criada, mas a tela mostra os dois furos. Gerar um PDF bonito com dor
 * suposta é como se manda proposta que o cliente não reconhece.
 */
export function esboçarProposta(lead: Lead): EsboçoProposta {
  const encaixe = avaliarSistema(lead);
  const memoria = lead.memoriaComercial;
  const dor = memoria?.dorConfirmada;

  const pendencias: string[] = [];
  if (!dor) pendencias.push("Dor ainda não confirmada pelo cliente — a proposta parte de hipótese.");
  if (!encaixe.serve) pendencias.push("Ramo sem solução mapeada no catálogo.");
  pendencias.push("Setup e mensalidade precisam ser definidos por você.");

  return {
    problema: dor ?? encaixe.dor ?? "Processo manual a confirmar com o cliente.",
    problemaConfirmado: Boolean(dor),
    solucao: encaixe.serve ? encaixe.sistema : "Solução a definir",
    solucaoId: lead.servico ?? null,
    modulos: encaixe.serve
      ? encaixe.modulos.map((m) => ({ id: m, rotulo: ROTULO_MODULO[m] }))
      : [],
    setup: null,
    mensalidade: null,
    pendencias,
  };
}

/** Follow-ups vencidos ou de hoje. Nada dispara — só aparece na tela. */
export async function followUpsPendentes() {
  return db
    .select({
      id: negocios.id,
      leadId: negocios.leadId,
      lead: leads.nome,
      status: negocios.status,
      quando: negocios.proximoFollowUp,
      motivo: negocios.motivoFollowUp,
      setup: negocios.setup,
      mensalidade: negocios.mensalidade,
    })
    .from(negocios)
    .innerJoin(leads, eq(leads.id, negocios.leadId))
    .where(
      and(
        isNotNull(negocios.proximoFollowUp),
        lte(negocios.proximoFollowUp, sql`now()`),
        inArray(negocios.status, POTENCIAL),
      ),
    )
    .orderBy(negocios.proximoFollowUp);
}

export type DesempenhoNicho = {
  nicho: string;
  abordados: number;
  respostas: number;
  interessados: number;
  taxaResposta: number;
  taxaInteresse: number;
  /** Solução mais associada ao nicho, do catálogo. */
  solucao: string | null;
  /** Falso quando a amostra é pequena demais para concluir qualquer coisa. */
  confiavel: boolean;
};

/** Abaixo disto, porcentagem é ruído: 1 resposta em 3 não é "33% de conversão". */
const AMOSTRA_MINIMA = 20;

/**
 * Ranking de nichos por resultado real.
 *
 * Estatística simples de propósito — contagem e divisão, nada de modelo. E com
 * `confiavel: false` quando a amostra é pequena: com 3 abordagens, uma
 * resposta vira "33%" e leva a decidir a próxima campanha inteira em cima de
 * ruído. A tela mostra o número, mas marcado.
 */
export async function desempenhoPorNicho(): Promise<DesempenhoNicho[]> {
  const linhas = await db
    .select({
      categoria: leads.categoria,
      etapa: leads.etapa,
      intencao: leads.intencao,
      enviadas: sql<number>`count(*) filter (where ${mensagens.status} in ('enviada','entregue','respondida'))::int`,
    })
    .from(mensagens)
    .innerJoin(leads, eq(leads.id, mensagens.leadId))
    .groupBy(leads.categoria, leads.etapa, leads.intencao);

  const porNicho = new Map<string, { abordados: number; respostas: number; interessados: number }>();
  for (const l of linhas) {
    const nicho = l.categoria ?? "sem categoria";
    const atual = porNicho.get(nicho) ?? { abordados: 0, respostas: 0, interessados: 0 };
    atual.abordados += l.enviadas;
    if (l.etapa === "respondeu" || l.etapa === "interessado" || l.etapa === "reuniao" || l.etapa === "proposta" || l.etapa === "fechado") {
      atual.respostas += l.enviadas;
    }
    if (l.intencao && ["interessado", "orcamento", "agendamento"].includes(l.intencao)) {
      atual.interessados += l.enviadas;
    }
    porNicho.set(nicho, atual);
  }

  return [...porNicho.entries()]
    .filter(([, v]) => v.abordados > 0)
    .map(([nicho, v]) => {
      /**
       * `nome: ""` não é enfeite: `perfilDe` lê o nome como reforço das tags do
       * OSM e quebra com `undefined`. Aqui só existe a categoria agregada — não
       * há um lead único para o grupo — então o nome vai vazio de propósito.
       */
      const encaixe = avaliarSistema({ categoria: nicho, nome: "" } as Lead);
      return {
        nicho,
        abordados: v.abordados,
        respostas: v.respostas,
        interessados: v.interessados,
        taxaResposta: Math.round((v.respostas / v.abordados) * 100),
        taxaInteresse: v.respostas ? Math.round((v.interessados / v.respostas) * 100) : 0,
        solucao: encaixe.serve ? encaixe.sistema : null,
        confiavel: v.abordados >= AMOSTRA_MINIMA,
      };
    })
    .sort((a, b) => b.taxaResposta - a.taxaResposta || b.abordados - a.abordados);
}

/**
 * Ajuste de prioridade por COMPORTAMENTO, somado ao score do cadastro.
 *
 * O score de lib/pontuacao olha o que o lead É (ramo, presença, porte). Este
 * olha o que ele FEZ — e o que ele fez vale mais: um lead mediano que pediu
 * orçamento está mais perto de fechar que um lead perfeito que nunca
 * respondeu.
 *
 * Some ao score existente; não o substitui. Teto em 100 para continuar
 * legível como "de 0 a 100".
 */
export function ajustePorComportamento(lead: Lead): { pontos: number; motivos: string[] } {
  const motivos: string[] = [];
  let pontos = 0;

  const ganhou = (p: number, motivo: string) => {
    pontos += p;
    motivos.push(motivo);
  };

  if (lead.ultimaInteracao) ganhou(5, "Respondeu");
  if (lead.intencao === "interessado") ganhou(10, "Demonstrou interesse");
  if (lead.memoriaComercial?.dorConfirmada) ganhou(10, "Dor confirmada pelo cliente");
  if (lead.etapa === "reuniao") ganhou(10, "Aceitou reunião");
  if (lead.intencao === "orcamento" || lead.etapa === "proposta") ganhou(10, "Pediu proposta");
  if (lead.etapa === "fechado") return { pontos: 100, motivos: ["Cliente fechado"] };

  // Perdas derrubam a prioridade — o lead não some, sai da frente.
  if (lead.etapa === "sem-interesse") return { pontos: -40, motivos: ["Disse que não tem interesse"] };
  if (lead.etapa === "ja-tem-sistema") return { pontos: -20, motivos: ["Já possui sistema"] };
  if (lead.naoContatar) return { pontos: -100, motivos: ["Opt-out"] };

  return { pontos, motivos };
}
