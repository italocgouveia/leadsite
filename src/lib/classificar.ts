import type { Etapa } from "@/lib/db/schema";

/**
 * Classificação da intenção da resposta.
 *
 * Determinística por regras, com score de confiança. Escolha consciente sobre
 * mandar tudo para a IA:
 *
 *  - "quanto custa?" é orçamento com 100% de certeza. Chamar modelo para isso
 *    custa segundos e cota para chegar na mesma resposta.
 *  - o que a IA resolveria melhor é o caso ambíguo — e é justamente onde
 *    ERRAR é mais caro. Um lead classificado como "sem interesse" por engano
 *    some do funil sem ninguém revisar.
 *
 * Por isso o padrão é: regra clara decide, dúvida vira NECESSITA ANÁLISE e
 * espera você. Nunca forçar classificação.
 *
 * O limiar de confiança define o que move o funil sozinho. Abaixo dele o lead
 * é marcado, mas não anda — a movimentação automática exige certeza.
 */

export type Intencao =
  | "interessado"
  | "orcamento"
  | "agendamento"
  | "depois"
  | "sem-interesse"
  | "ja-tem-sistema"
  | "opt-out"
  | "necessita-analise";

export type Classificacao = {
  intencao: Intencao;
  /** 0 a 100. */
  confianca: number;
  /** Qual trecho da resposta decidiu — para você conferir sem adivinhar. */
  motivo: string;
  /** Para onde o funil deve ir, se a confiança bastar. */
  etapaSugerida: Etapa | null;
  /** Bloqueia contato futuro de forma permanente. */
  optOut: boolean;
};

/** A partir daqui o sistema move o lead sozinho. Abaixo, só marca. */
export const LIMIAR_CONFIANCA = 70;

type Regra = {
  intencao: Intencao;
  peso: number;
  padrao: RegExp;
  motivo: string;
};

/**
 * Ordem importa: a primeira regra que casar decide.
 *
 * Opt-out vem antes de tudo porque "não quero receber mais mensagens" contém
 * "não quero", que também casaria com sem-interesse — e as consequências das
 * duas são muito diferentes.
 */
const REGRAS: Regra[] = [
  // ---------- opt-out: sempre primeiro ----------
  {
    intencao: "opt-out",
    peso: 98,
    padrao: /n[ãa]o me (mand|envi|manda)|par[ea]r? de (mandar|enviar|me mandar)|remov(a|er) meu n[úu]mero|sair da lista|descadastr|me tira dessa|n[ãa]o quero receber|bloquear/i,
    motivo: "pediu para não receber mais mensagens",
  },
  {
    intencao: "opt-out",
    peso: 90,
    padrao: /\b(spam|importun|inconveniente)\b/i,
    motivo: "tratou o contato como spam",
  },

  // ---------- já tem sistema ----------
  {
    intencao: "ja-tem-sistema",
    peso: 92,
    padrao: /j[áa] (uso|usamos|tenho|temos|possu[oi]|contrat)|j[áa] (t[eê]m|tem) (um )?(sistema|software|programa|erp|crm)|nosso sistema|sistema pr[óo]prio/i,
    motivo: "disse que já usa um sistema",
  },

  /**
   * ---------- recusa, ANTES de interesse ----------
   *
   * A ordem aqui não é estética. "Não tenho interesse" contém "tenho
   * interesse", e com a regra de interesse vindo primeiro a frase era
   * classificada como INTERESSADO com 88% de confiança — um lead que recusou
   * ia direto para a coluna de oportunidades. Recusa vem antes.
   */
  {
    intencao: "sem-interesse",
    peso: 92,
    padrao: /n[ãa]o (tenho|temos) interesse|sem interesse|n[ãa]o (preciso|precisamos|quero|queremos)|obrigad[oa],? mas n[ãa]o|n[ãa]o vai dar|no momento n[ãa]o/i,
    motivo: "disse que não tem interesse",
  },

  // ---------- orçamento: mais específico que interesse ----------
  {
    intencao: "orcamento",
    peso: 95,
    padrao: /quanto (custa|fica|sai|[ée])|qual (o )?(valor|pre[çc]o|custo)|manda(r)? (o )?(or[çc]amento|proposta|valores)|quero (um )?(or[çc]amento|proposta)|tem (um )?valor/i,
    motivo: "perguntou preço ou pediu orçamento",
  },

  // ---------- quer agendar: mais específico que interesse genérico ----------
  {
    intencao: "agendamento",
    peso: 90,
    padrao: /marcar (uma |um )?(reuni[ãa]o|call|conversa|hor[áa]rio)|vamos marcar|podemos marcar|agendar (uma |um )?(reuni[ãa]o|call|conversa|hor[áa]rio)|que dia (voc[êe]|fica bom)|dispon[íi]vel (pra|para) (uma |um )?(call|reuni[ãa]o|conversa)|hor[áa]rio (livre|dispon[íi]vel)/i,
    motivo: "quer marcar uma reunião ou horário",
  },

  // ---------- interesse ----------
  {
    intencao: "interessado",
    peso: 88,
    padrao: /como funciona|me explica|explica melhor|quero saber mais|tenho interesse|me interessa|pode (me )?mostrar|gostaria de saber|manda (mais )?(detalhes|informa)|fiquei interessad/i,
    motivo: "pediu para entender melhor",
  },
  {
    intencao: "interessado",
    peso: 74,
    padrao: /^(sim|claro|pode(ria)? sim|vamos|bora|opa,? (sim|claro))\b/i,
    motivo: "respondeu afirmativamente ao convite",
  },

  // ---------- depois ----------
  {
    intencao: "depois",
    peso: 90,
    padrao: /(me )?chama (depois|mais tarde|amanh[ãa]|semana que vem|segunda|outro dia)|falo (com voc[êe] )?depois|agora (n[ãa]o d[áa]|estou ocupad|t[ôo] ocupad)|mais tarde|outra hora|retorna/i,
    motivo: "pediu para conversar em outro momento",
  },

  // ---------- recusa curta, confiança baixa de propósito ----------
  {
    intencao: "sem-interesse",
    peso: 62,
    padrao: /^(n[ãa]o|nao|nops?)\b[.! ]*$/i,
    motivo: "respondeu apenas 'não' — curto demais para ter certeza",
  },
];

/** Para onde cada intenção leva o lead no funil. */
const DESTINO: Record<Intencao, Etapa | null> = {
  interessado: "interessado",
  orcamento: "interessado",
  agendamento: "reuniao",
  depois: "respondeu",
  "sem-interesse": "sem-interesse",
  "ja-tem-sistema": "ja-tem-sistema",
  "opt-out": "opt-out",
  "necessita-analise": null,
};

function limpar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classificar(resposta: string): Classificacao {
  const bruto = (resposta ?? "").trim();

  if (bruto.length < 2) {
    return {
      intencao: "necessita-analise",
      confianca: 0,
      motivo: "resposta vazia ou curta demais",
      etapaSugerida: null,
      optOut: false,
    };
  }

  // Compara sem acento nos dois lados: quem responde no celular raramente acentua.
  const alvo = `${bruto} ${limpar(bruto)}`;

  for (const r of REGRAS) {
    if (r.padrao.test(alvo)) {
      /**
       * Resposta longa com uma regra só casando é menos confiável: o trecho
       * que casou pode ser parte de uma frase que diz outra coisa.
       */
      const palavras = bruto.split(/\s+/).length;
      const desconto = palavras > 40 ? 15 : palavras > 20 ? 8 : 0;
      const confianca = Math.max(0, r.peso - desconto);

      return {
        intencao: confianca >= 50 ? r.intencao : "necessita-analise",
        confianca,
        motivo:
          confianca >= 50
            ? r.motivo
            : `${r.motivo}, mas a resposta é longa demais para ter certeza`,
        etapaSugerida: confianca >= LIMIAR_CONFIANCA ? DESTINO[r.intencao] : null,
        optOut: r.intencao === "opt-out" && confianca >= LIMIAR_CONFIANCA,
      };
    }
  }

  return {
    intencao: "necessita-analise",
    confianca: 40,
    motivo: "nenhuma regra clara casou com a resposta",
    etapaSugerida: null,
    optOut: false,
  };
}

export const ROTULO_INTENCAO: Record<Intencao, { rotulo: string; emoji: string }> = {
  interessado: { rotulo: "Interessado", emoji: "🔥" },
  orcamento: { rotulo: "Pediu orçamento", emoji: "💰" },
  agendamento: { rotulo: "Quer agendar", emoji: "📆" },
  depois: { rotulo: "Quer conversar depois", emoji: "📅" },
  "sem-interesse": { rotulo: "Sem interesse", emoji: "❄️" },
  "ja-tem-sistema": { rotulo: "Já possui sistema", emoji: "🏢" },
  "opt-out": { rotulo: "Não quer receber", emoji: "🚫" },
  "necessita-analise": { rotulo: "Necessita análise", emoji: "❓" },
};
