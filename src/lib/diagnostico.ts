import type { Lead } from "@/lib/db";
import { avaliarSistema, type Modulo } from "@/lib/sistemas";

/**
 * As perguntas que o vendedor faz DEPOIS que o lead responde.
 *
 * DE ONDE ELAS VÊM, E POR QUE ISSO IMPORTA
 *
 * Cada pergunta é amarrada a um MÓDULO do catálogo (lib/sistemas), não escrita
 * à mão por nicho. A consequência prática: quando um perfil ganha o módulo
 * `retorno`, a pergunta sobre clientes que sumiram aparece sozinha naquele
 * ramo — sem ninguém lembrar de editar uma segunda lista. Uma lista paralela
 * de perguntas por nicho começaria sincronizada com o catálogo e divergiria na
 * primeira mudança.
 *
 * Cada pergunta investiga se o processo daquele módulo é MANUAL hoje. É a
 * única coisa que interessa nesta etapa: transformar hipótese em dor
 * confirmada, com a pessoa dizendo como faz — não com a gente supondo.
 *
 * Função pura, sem IA e sem banco.
 */

/** Pergunta + o que a resposta revela. Uma por módulo do catálogo. */
type Sondagem = { pergunta: string; investiga: string };

const POR_MODULO: Record<Modulo, Sondagem> = {
  "ordem-servico": {
    pergunta: "Como vocês controlam as ordens de serviço hoje — caderno, planilha ou sistema?",
    investiga: "controle de ordens",
  },
  agendamento: {
    pergunta: "Como vocês controlam a agenda hoje? É tudo pelo WhatsApp?",
    investiga: "agenda",
  },
  clientes: {
    pergunta: "Vocês têm um cadastro dos clientes ou fica tudo no histórico da conversa?",
    investiga: "cadastro de clientes",
  },
  historico: {
    pergunta: "Quando um cliente antigo volta, vocês conseguem ver o que já foi feito para ele?",
    investiga: "histórico",
  },
  retorno: {
    pergunta:
      "Hoje vocês conseguem identificar quais clientes estão há mais tempo sem voltar?",
    investiga: "retorno de clientes",
  },
  orcamento: {
    pergunta: "Como vocês montam e guardam os orçamentos?",
    investiga: "orçamentos",
  },
  estoque: {
    pergunta: "Vocês têm controle de estoque ou é conferido na hora?",
    investiga: "estoque",
  },
  financeiro: {
    pergunta: "Como vocês acompanham o que entrou no mês?",
    investiga: "financeiro",
  },
  comissao: {
    pergunta: "Como é calculada a comissão da equipe no fim do mês?",
    investiga: "comissão",
  },
  equipe: {
    pergunta: "Quantas pessoas mexem nesse controle hoje?",
    investiga: "tamanho da operação",
  },
  pedidos: {
    pergunta: "Como os pedidos chegam e como vocês anotam?",
    investiga: "pedidos",
  },
  cardapio: {
    pergunta: "O cardápio de vocês está em algum lugar online ou é enviado por foto?",
    investiga: "cardápio",
  },
  reservas: {
    pergunta: "Como vocês controlam as reservas — planilha, caderno ou sistema?",
    investiga: "reservas",
  },
  quartos: {
    pergunta: "Como vocês sabem quais quartos estão livres numa data?",
    investiga: "disponibilidade",
  },
  hospedes: {
    pergunta: "Onde ficam guardados os dados dos hóspedes?",
    investiga: "dados dos hóspedes",
  },
  fidelidade: {
    pergunta: "Vocês têm algum tipo de fidelização ou pacote para cliente que volta sempre?",
    investiga: "fidelização",
  },
  pets: {
    pergunta: "Vocês registram a ficha do pet — raça, tosa que o dono prefere, última vez?",
    investiga: "ficha do pet",
  },
  veiculos: {
    pergunta: "Vocês conseguem consultar o histórico por placa quando o carro volta?",
    investiga: "histórico do veículo",
  },
  imoveis: {
    pergunta: "Como vocês registram quais imóveis interessam a cada cliente?",
    investiga: "imóveis por cliente",
  },
  visitas: {
    pergunta: "Como vocês controlam as visitas agendadas e o retorno depois delas?",
    investiga: "visitas",
  },
};

/**
 * Respostas que indicam processo manual — o gatilho da dor confirmada.
 *
 * Deliberadamente conservador: só conta o que é inequívoco. Um falso positivo
 * aqui vira "dor confirmada" numa tela que o vendedor usa para decidir mandar
 * proposta, e proposta baseada em dor que não existe queima o lead.
 */
const SINAIS_MANUAIS =
  /\b(planilha|excel|caderno|papel|na m[ãa]o|manual|whats(app)?|agenda de papel|na cabe[çc]a|anota[çc][ãa]o|bloco)\b/i;

const SINAIS_JA_TEM =
  /\b(sistema|software|programa|erp|plataforma)\b/i;

export type LeituraResposta = {
  /** O que a resposta indica sobre o processo. */
  sinal: "manual" | "ja-tem-sistema" | "indefinido";
  /** Frase curta para o vendedor ver na hora, sem interpretar sozinho. */
  insight: string;
  /** Só `manual` confirma dor — é o que move a oportunidade de hipótese a fato. */
  confirmaDor: boolean;
};

/**
 * Lê a resposta do lead a uma pergunta de diagnóstico.
 *
 * Regex, não IA: é uma leitura de palavra-chave sobre uma frase curta, e
 * gastar uma chamada de modelo (com cota escassa) para reconhecer "planilha"
 * seria caro e mais frágil que a regra. A IA continua escrevendo texto; isto
 * aqui é leitura.
 */
export function lerResposta(resposta: string): LeituraResposta {
  const t = resposta.trim();
  if (t.length < 2) {
    return { sinal: "indefinido", insight: "Resposta muito curta.", confirmaDor: false };
  }

  // Manual vence: "uso uma planilha, sistema mesmo não temos" é processo manual.
  if (SINAIS_MANUAIS.test(t)) {
    return {
      sinal: "manual",
      insight: "⚠️ Processo manual identificado — dor confirmada pelo próprio cliente.",
      confirmaDor: true,
    };
  }
  if (SINAIS_JA_TEM.test(t)) {
    return {
      sinal: "ja-tem-sistema",
      insight:
        "🏢 Já usa algum sistema. Vale descobrir se ele cobre o processo inteiro ou só uma parte.",
      confirmaDor: false,
    };
  }
  return {
    sinal: "indefinido",
    insight: "Resposta registrada. Ainda não dá para afirmar que o processo é manual.",
    confirmaDor: false,
  };
}

/** As perguntas do ramo deste lead, na ordem dos módulos do perfil. */
export function perguntasDeDiagnostico(lead: Lead): string[] {
  const encaixe = avaliarSistema(lead);
  if (!encaixe.serve || encaixe.modulos.length === 0) {
    // Sem perfil no catálogo: a pergunta genérica não inventa nada sobre o ramo.
    return ["Como vocês organizam esse processo hoje — planilha, caderno ou sistema?"];
  }
  return encaixe.modulos.map((m) => POR_MODULO[m].pergunta);
}

/** Perguntas com o que cada uma investiga — para a tela dar contexto. */
export function sondagensDeDiagnostico(lead: Lead): Sondagem[] {
  const encaixe = avaliarSistema(lead);
  if (!encaixe.serve || encaixe.modulos.length === 0) {
    return [
      {
        pergunta: "Como vocês organizam esse processo hoje — planilha, caderno ou sistema?",
        investiga: "processo atual",
      },
    ];
  }
  return encaixe.modulos.map((m) => POR_MODULO[m]);
}
