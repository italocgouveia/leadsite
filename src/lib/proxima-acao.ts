import type { Lead } from "@/lib/db";
import type { Intencao } from "@/lib/classificar";
import { avaliarSistema } from "@/lib/sistemas";
import { perguntasDeDiagnostico } from "@/lib/diagnostico";

/**
 * A pergunta que o CRM precisa responder a qualquer momento:
 * *qual é a melhor coisa que eu, vendedor, faço agora com este lead?*
 *
 * POR QUE UM MÓDULO, E NÃO REGRAS NA TELA
 *
 * A resposta depende de seis coisas ao mesmo tempo — etapa do funil, se
 * respondeu, o que respondeu, quanto tempo faz, se há proposta, se há objeção.
 * Espalhar isso por componentes garante duas coisas: a Central de Conversas e
 * o Pipeline dariam respostas diferentes para o mesmo lead, e ninguém
 * conseguiria testar nenhuma das duas.
 *
 * NADA AQUI CHAMA IA. É função pura sobre dados que já estão no banco, então
 * pode rodar em toda listagem, para todo lead, sem custo e sem cota. A IA
 * continua servindo para ESCREVER (mensagem, proposta); decidir o próximo
 * passo é regra de negócio, e regra de negócio precisa ser previsível.
 */

export type TipoAcao =
  | "abordar"
  | "aguardar"
  | "diagnosticar"
  | "tratar-objecao"
  | "agendar"
  | "demonstrar"
  | "propor"
  | "negociar"
  | "follow-up"
  | "encerrar"
  | "fechar-ganho";

export type ProximaAcao = {
  tipo: TipoAcao;
  /** O que fazer, em uma linha, na voz do vendedor. */
  titulo: string;
  /** Por que esta ação e não outra — o que no lead levou a ela. */
  motivo: string;
  /** Pergunta pronta para copiar, quando a ação é descobrir algo. */
  pergunta?: string;
  /** Rótulo do botão, quando existe uma ação concreta na tela. */
  acao?: string;
  /** Alta = faça hoje. Serve para ordenar a lista de pendências. */
  urgencia: "alta" | "media" | "baixa";
};

/** Sinais da conversa que a decisão usa. Todos já existem no banco. */
export type ContextoConversa = {
  /** O lead já escreveu alguma vez? */
  respondeu: boolean;
  /** Quando o lead falou pela última vez. */
  ultimaRecebidaEm?: Date | string | null;
  /** Quando VOCÊ falou pela última vez. */
  ultimaEnviadaEm?: Date | string | null;
  /** Última intenção classificada (lib/classificar). */
  intencao?: Intencao | null;
  /** Objeção detectada na última mensagem do lead (lib/objecoes). */
  objecao?: { id: string; nome: string; pergunta: string } | null;
  /** Quantas perguntas de diagnóstico já foram respondidas. */
  diagnosticoRespondido?: number;
  /** Existe proposta registrada para este lead? */
  temProposta?: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Aceita `Date` ou string ISO.
 *
 * Não é frouxidão: estas datas atravessam duas fronteiras que não preservam
 * `Date` — agregação SQL (`max(criado_em)` volta como texto, mesmo com o tipo
 * anotado no Drizzle) e JSON de API. Assumir `Date` quebrava com
 * "getTime is not a function" bem no meio do cálculo da próxima ação.
 */
function diasDesde(d?: Date | string | null): number | null {
  if (!d) return null;
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / DIA_MS);
}

/**
 * Decide o próximo passo.
 *
 * A ordem das checagens É a regra de negócio, e ela vai do mais urgente para o
 * mais genérico: objeção na mesa trava tudo o mais; depois vem o que o lead
 * pediu; depois o estágio do funil; e só no fim o tempo parado.
 */
export function determinarProximaAcao(lead: Lead, ctx: ContextoConversa): ProximaAcao {
  const encaixe = avaliarSistema(lead);
  const solucao = encaixe.serve ? encaixe.sistema : "a solução que fizer sentido para o ramo";
  const perguntas = perguntasDeDiagnostico(lead);

  // ---------------------------------------------------------- saídas do funil
  if (lead.naoContatar || lead.etapa === "opt-out") {
    return {
      tipo: "encerrar",
      titulo: "Não contatar este lead",
      motivo: "O lead pediu para não receber mais mensagens.",
      urgencia: "baixa",
    };
  }

  if (lead.etapa === "fechado") {
    return {
      tipo: "fechar-ganho",
      titulo: "Registrar implantação e mensalidade",
      motivo: "Negócio fechado — falta transformar em cliente ativo.",
      acao: "Registrar cliente",
      urgencia: "alta",
    };
  }

  if (lead.etapa === "sem-interesse" || lead.etapa === "ja-tem-sistema") {
    return {
      tipo: "encerrar",
      titulo: "Oportunidade encerrada por ora",
      motivo:
        lead.etapa === "ja-tem-sistema"
          ? "Já possui sistema. Vale revisitar daqui alguns meses."
          : "Disse que não tem interesse.",
      urgencia: "baixa",
    };
  }

  // ------------------------------------------------- objeção é sempre primeiro
  /**
   * Objeção na mesa vence qualquer outra ação. Seguir para proposta ou
   * demonstração com uma objeção sem resposta é como continuar apresentando
   * enquanto a pessoa espera você responder o que ela acabou de perguntar.
   */
  if (ctx.objecao) {
    return {
      tipo: "tratar-objecao",
      titulo: `Responder a objeção: ${ctx.objecao.nome}`,
      motivo: "O lead levantou uma objeção na última mensagem. Ela vem antes de qualquer avanço.",
      pergunta: ctx.objecao.pergunta,
      acao: "Ver resposta sugerida",
      urgencia: "alta",
    };
  }

  // ------------------------------------------------- o que o lead pediu vence
  if (ctx.intencao === "orcamento") {
    return {
      tipo: "propor",
      titulo: "Montar e enviar a proposta",
      motivo: "O lead pediu orçamento — é o pedido mais direto que existe.",
      acao: "Gerar proposta",
      urgencia: "alta",
    };
  }

  if (ctx.intencao === "agendamento") {
    return {
      tipo: "agendar",
      titulo: "Confirmar dia e horário",
      motivo: "O lead quer agendar. Marcar agora evita o esfriamento.",
      pergunta: "Consigo te mostrar em 15 minutos. Prefere amanhã de manhã ou à tarde?",
      urgencia: "alta",
    };
  }

  if (ctx.intencao === "depois") {
    return {
      tipo: "follow-up",
      titulo: "Marcar follow-up e não insistir agora",
      motivo: "O lead pediu para falar depois. Insistir agora queima a conversa.",
      acao: "Agendar follow-up",
      urgencia: "media",
    };
  }

  // ------------------------------------------------------------ ainda não falou
  if (!ctx.respondeu) {
    const dias = diasDesde(ctx.ultimaEnviadaEm);
    if (dias === null) {
      return {
        tipo: "abordar",
        titulo: "Fazer o primeiro contato",
        motivo: `Lead ainda não abordado. Hipótese para o ramo: ${solucao}.`,
        acao: "Preparar campanha",
        urgencia: "media",
      };
    }
    if (dias < 3) {
      return {
        tipo: "aguardar",
        titulo: "Aguardar resposta",
        motivo: `Mensagem enviada há ${dias === 0 ? "menos de um dia" : `${dias} dia(s)`}. Cobrar cedo demais reduz a chance de resposta.`,
        urgencia: "baixa",
      };
    }
    return {
      tipo: "follow-up",
      titulo: "Fazer um follow-up manual",
      motivo: `${dias} dias sem resposta. Uma retomada curta costuma recuperar parte dos silêncios.`,
      pergunta: "Oi! Só retomando aqui — faz sentido eu te mostrar como funciona?",
      acao: "Agendar follow-up",
      urgencia: "media",
    };
  }

  // ------------------------------------------------------- respondeu: diagnosticar
  /**
   * Aqui está a virada de modo que a fase pede: depois que o lead responde, o
   * CRM PARA de empurrar pitch e passa a perguntar. Continuar apresentando
   * para quem já demonstrou abertura é o erro que transforma interesse em
   * silêncio.
   */
  const jaDiagnosticou = ctx.diagnosticoRespondido ?? 0;

  if (ctx.temProposta || lead.etapa === "proposta") {
    const dias = diasDesde(ctx.ultimaEnviadaEm);
    return {
      tipo: "negociar",
      titulo: "Confirmar se conseguiu analisar a proposta",
      motivo:
        dias && dias >= 2
          ? `Proposta enviada há ${dias} dias sem retorno.`
          : "Proposta na mesa. O passo é confirmar o entendimento, não repropor.",
      pergunta: "Conseguiu dar uma olhada no que te mandei? Ficou alguma dúvida?",
      urgencia: dias && dias >= 2 ? "alta" : "media",
    };
  }

  if (lead.etapa === "reuniao") {
    return {
      tipo: "demonstrar",
      titulo: "Preparar a demonstração",
      motivo: `Reunião marcada. Mostre exatamente ${solucao} resolvendo o que ele contou.`,
      acao: "Ver módulos da solução",
      urgencia: "alta",
    };
  }

  if (jaDiagnosticou >= 3) {
    return {
      tipo: "propor",
      titulo: "Já dá para propor",
      motivo: `${jaDiagnosticou} respostas de diagnóstico registradas — há material suficiente para uma proposta com base real.`,
      acao: "Gerar proposta",
      urgencia: "alta",
    };
  }

  if (ctx.intencao === "interessado" || jaDiagnosticou > 0) {
    const proxima = perguntas[jaDiagnosticou] ?? perguntas[0];
    return {
      tipo: "diagnosticar",
      titulo: "Descobrir como o processo funciona hoje",
      motivo:
        jaDiagnosticou > 0
          ? `${jaDiagnosticou} de ${perguntas.length} perguntas respondidas. Falta entender o resto antes de propor.`
          : "O lead demonstrou interesse. Antes de propor, entenda o processo atual — proposta sem diagnóstico vira chute de preço.",
      pergunta: proxima,
      acao: "Registrar resposta",
      urgencia: "alta",
    };
  }

  // Respondeu algo que a classificação não entendeu bem.
  const diasResposta = diasDesde(ctx.ultimaRecebidaEm);
  return {
    tipo: "diagnosticar",
    titulo: "Puxar a conversa com uma pergunta aberta",
    motivo:
      diasResposta !== null && diasResposta > 2
        ? `O lead respondeu há ${diasResposta} dias e a conversa parou.`
        : "O lead respondeu, mas a intenção não ficou clara. Uma pergunta sobre o processo destrava.",
    pergunta: perguntas[0],
    acao: "Registrar resposta",
    urgencia: diasResposta !== null && diasResposta > 2 ? "alta" : "media",
  };
}
