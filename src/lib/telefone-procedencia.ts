import { validarTelefone, dddCompativel, type TelefoneValidado } from "@/lib/telefone";

/**
 * DE ONDE VEIO ESTE NÚMERO, E QUANTO DÁ PARA CONFIAR NELE.
 *
 * POR QUE ISTO É UM ARQUIVO SEPARADO DE `telefone.ts`
 *
 * `telefone.ts` está no caminho do envio: `fila.ts` importa dele a cada
 * mensagem. Uma função nova ali é uma edição num arquivo que não pode
 * quebrar. Aqui não há nada que o worker chame — esta camada responde a uma
 * pergunta anterior ao envio ("vale a pena colocar este número na fila?") e
 * vive fora do caminho crítico de propósito.
 *
 * O QUE ELA ACRESCENTA
 *
 * `validarTelefone` responde "isto é um número brasileiro bem formado?". É
 * pouco. Um número pode ser perfeitamente válido e ainda assim ser o do
 * contador que abriu 40 CNPJs, o da agência que fez o site, ou um
 * `(34) 99999-9999` de formulário. Nenhuma dessas coisas se vê olhando o
 * número sozinho: só olhando o CONJUNTO e a PROCEDÊNCIA.
 *
 * Medido no piloto da Receita: 571 números apareciam em mais de uma empresa,
 * atingindo 1.375 cadastros; o campeão servia a 90 CNPJs.
 *
 * O QUE ELA NÃO FAZ
 *
 * Não afirma WhatsApp. `possivelWhatsapp` significa "é celular e nada o
 * desqualifica" — a única prova de conta é o envio, e ela vem depois.
 */

/** De onde o número foi obtido. Muda a confiança, e por bons motivos. */
export type OrigemTelefone =
  | "cadastro"
  | "receita"
  | "osm"
  | "site-proprio"
  | "places"
  | "manual"
  | "desconhecida";

/**
 * Confiança de partida por fonte.
 *
 * `manual` no topo porque alguém digitou olhando; `places` alto porque o
 * Google mantém o dado do próprio estabelecimento; `receita` baixo porque o
 * cadastro pode ter vinte anos e o número frequentemente é do contador —
 * mesmo antes de qualquer penalidade, um número da Receita vale menos que um
 * que a empresa publicou no próprio site.
 */
const CONFIANCA_BASE: Record<OrigemTelefone, number> = {
  manual: 90,
  places: 85,
  cadastro: 80,
  "site-proprio": 70,
  osm: 70,
  receita: 55,
  desconhecida: 40,
};

/**
 * Quantas empresas podem dividir um número antes de ele deixar de identificar
 * qualquer uma delas. A escala é a que a operação pediu, e cada degrau tem
 * consequência diferente: revisar não bloqueia, suspeito derruba a confiança
 * ao chão, bloquear tira da fila.
 */
export const FREQUENCIA = { revisar: 2, suspeito: 10, bloquear: 50 } as const;

export type ContextoTelefone = {
  /** Em quantas empresas distintas este número aparece. 1 = só nesta. */
  frequencia?: number;
  /** Id de OUTRO lead que já tem este número, quando houver. */
  jaPertenceA?: string | null;
  origem?: OrigemTelefone;
  /** UF do endereço da empresa, para conferir o DDD. */
  uf?: string | null;
  /**
   * O número veio em 8 dígitos e o nono foi reconstruído pela regra da
   * migração. Ver o piloto da Receita: o campo do cadastro tem 8 caracteres e
   * guarda a numeração anterior a 2016.
   */
  nonoReconstruido?: boolean;
};

export type TelefoneComProcedencia = {
  valido: boolean;
  e164: string | null;
  formatado: string | null;
  tipo: "celular" | "fixo" | "invalido";
  ddd: number | null;
  /** Só reconhecemos BR. Qualquer outra coisa não é validada, e é dito. */
  pais: "BR" | "desconhecido";
  nonoDigito: "presente" | "reconstruido" | "nao-aplicavel";
  frequencia: number;
  jaPertenceA: string | null;
  origem: OrigemTelefone;
  /** 0 a 100. Não é probabilidade de nada: é o quanto o dado se sustenta. */
  confianca: number;
  /**
   * É celular e nada o desqualifica.
   *
   * NÃO significa que existe conta de WhatsApp. Formato não prova conta, e
   * confundir os dois é o erro que faz a fila gastar o teto diário
   * descobrindo o que já se sabia.
   */
  possivelWhatsapp: boolean;
  /** O que sustenta ou derruba a confiança — para a tela poder explicar. */
  motivos: string[];
  /** O que impede de usar este número. Vazio quando dá para usar. */
  bloqueios: string[];
};

function invalido(origem: OrigemTelefone, motivo: string): TelefoneComProcedencia {
  return {
    valido: false,
    e164: null,
    formatado: null,
    tipo: "invalido",
    ddd: null,
    pais: "desconhecido",
    nonoDigito: "nao-aplicavel",
    frequencia: 0,
    jaPertenceA: null,
    origem,
    confianca: 0,
    possivelWhatsapp: false,
    motivos: [],
    bloqueios: [motivo],
  };
}

/** Número obviamente de formulário: dígito repetido ou sequência. */
function ehPreenchimentoFalso(digitos: string): boolean {
  const numero = digitos.replace(/^55/, "").slice(2);
  return /^(\d)\1+$/.test(numero) || /^(12345678|123456789|987654321|98765432)$/.test(numero);
}

export function validarComProcedencia(
  bruto: string | null | undefined,
  ctx: ContextoTelefone = {},
): TelefoneComProcedencia {
  const origem = ctx.origem ?? "desconhecida";

  const base: TelefoneValidado | null = validarTelefone(bruto);
  if (!base) return invalido(origem, "Número não é um telefone brasileiro válido");
  if (ehPreenchimentoFalso(base.e164)) {
    return invalido(origem, "Número de preenchimento (dígitos repetidos ou sequência)");
  }

  const ddd = Number(base.e164.slice(2, 4));
  const frequencia = ctx.frequencia ?? 1;
  const jaPertenceA = ctx.jaPertenceA ?? null;
  const motivos: string[] = [];
  const bloqueios: string[] = [];

  let confianca = CONFIANCA_BASE[origem];
  motivos.push(`Origem: ${origem}`);

  // ── o nono dígito ──
  const nonoDigito: TelefoneComProcedencia["nonoDigito"] =
    base.tipo === "fixo" ? "nao-aplicavel" : ctx.nonoReconstruido ? "reconstruido" : "presente";
  if (nonoDigito === "reconstruido") {
    /**
     * Prefixar o 9 é a regra pública da migração de 2016, não um chute — mas
     * ela não prova que a linha continua existindo. Um cadastro de 2009 pode
     * apontar para um número desativado, e só o envio revela isso.
     */
    confianca -= 20;
    motivos.push("Nono dígito reconstruído — número não verificado");
  }

  // ── frequência ──
  if (frequencia >= FREQUENCIA.bloquear) {
    bloqueios.push(`Número usado por ${frequencia} empresas — não identifica nenhuma`);
    confianca = 0;
  } else if (frequencia >= FREQUENCIA.suspeito) {
    confianca -= 50;
    motivos.push(`Aparece em ${frequencia} empresas — provável contador ou agência`);
  } else if (frequencia >= FREQUENCIA.revisar) {
    confianca -= 25;
    motivos.push(`Aparece em ${frequencia} empresas — revisar antes de usar`);
  }

  // ── já é de outro lead ──
  if (jaPertenceA) {
    bloqueios.push("Número já cadastrado em outro lead");
    confianca = Math.min(confianca, 20);
  }

  // ── território ──
  if (ctx.uf && !dddCompativel(base.e164, ctx.uf)) {
    confianca -= 25;
    motivos.push(`DDD ${ddd} não bate com o endereço em ${ctx.uf}`);
  }

  // ── fixo ──
  if (base.tipo === "fixo") {
    /**
     * Fixo não é um número ruim: muito comércio atende bem no fixo. O que ele
     * não é é alvo de disparo automático, por regra da operação.
     */
    bloqueios.push("Telefone fixo — fora da fila de WhatsApp");
  }

  confianca = Math.max(0, Math.min(100, Math.round(confianca)));

  return {
    valido: true,
    e164: base.e164,
    formatado: base.formatado,
    tipo: base.tipo,
    ddd,
    pais: "BR",
    nonoDigito,
    frequencia,
    jaPertenceA,
    origem,
    confianca,
    possivelWhatsapp: base.tipo === "celular" && bloqueios.length === 0,
    motivos,
    bloqueios,
  };
}

/**
 * OS TRÊS ESTADOS DO CONTATO, e por que são três e não dois.
 *
 *   📞 telefone            existe número, mas é fixo ou não serve para disparo
 *   📱 possível celular    formato de celular, nada o desqualifica
 *   🟢 WhatsApp confirmado o sistema TEM prova: mensagem entregue ou resposta
 *
 * A promoção de "possível" para "confirmado" nunca acontece por formato. Ela
 * exige `confirmado = true`, que quem chama só passa quando há evidência
 * registrada — envio concluído ou mensagem recebida do lead.
 */
export type EstadoDoNumero = "sem-numero" | "telefone" | "possivel-celular" | "whatsapp-confirmado";

export const ROTULO_ESTADO_NUMERO: Record<EstadoDoNumero, string> = {
  "sem-numero": "🔎 Sem número",
  telefone: "📞 Telefone",
  "possivel-celular": "📱 Possível celular",
  "whatsapp-confirmado": "🟢 WhatsApp confirmado",
};

export function estadoDoNumero(
  t: TelefoneComProcedencia,
  confirmado = false,
): EstadoDoNumero {
  if (!t.valido) return "sem-numero";
  if (confirmado) return "whatsapp-confirmado";
  if (t.possivelWhatsapp) return "possivel-celular";
  return "telefone";
}
