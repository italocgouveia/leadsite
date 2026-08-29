import type { Etapa } from "@/lib/db/schema";

/**
 * Sete status, na linguagem de quem prospecta.
 *
 * O banco tem dezesseis etapas: nove do funil e sete saídas paralelas. Isso
 * é certo para a automação — `opt-out` precisa existir separado de "sem
 * interesse" porque um é pedido explícito da pessoa e trava envio por
 * obrigação legal, o outro é leitura sua. Mas dezesseis opções num select é
 * o que fazia a tela parecer CRM corporativo.
 *
 * A solução é simplificar a EXIBIÇÃO sem mexer no dado. O mapa de leitura é
 * muitos-para-um (várias etapas viram "Perdido"); o de escrita é um-para-um,
 * e nunca produz `opt-out`. Marcar "Perdido" na tela não pode criar uma trava
 * permanente que só a pessoa do outro lado tem o direito de pedir.
 */

export const STATUS = [
  { valor: "novo", rotulo: "Novo", cor: "#3f6fd8" },
  { valor: "contatado", rotulo: "Contatado", cor: "#8a4bb8" },
  { valor: "conversa", rotulo: "Em conversa", cor: "#c2410c" },
  { valor: "proposta", rotulo: "Proposta enviada", cor: "#8a6100" },
  { valor: "negociacao", rotulo: "Negociação", cor: "#d97706" },
  { valor: "fechado", rotulo: "Fechado", cor: "#128c4a" },
  { valor: "perdido", rotulo: "Perdido", cor: "#8b8b8b" },
] as const;

export type StatusSimples = (typeof STATUS)[number]["valor"];

export const VALORES_STATUS = STATUS.map((s) => s.valor) as readonly string[];

/** Leitura: qualquer uma das 16 etapas vira um dos 7 status. */
export function simplificar(etapa: string): StatusSimples {
  switch (etapa) {
    case "novo":
    case "analisado":
    case "qualificado":
      return "novo";
    case "mensagem-enviada":
      return "contatado";
    case "respondeu":
      return "conversa";
    case "interessado":
    case "reuniao":
      return "negociacao";
    case "proposta":
      return "proposta";
    case "fechado":
      return "fechado";
    default:
      // sem-interesse, nao-respondeu, ja-tem-sistema, opt-out,
      // necessita-analise, contato-invalido, campanha-cancelada
      return "perdido";
  }
}

/**
 * Escrita: o status escolhido na tela vira UMA etapa canônica.
 *
 * "Perdido" grava `sem-interesse`, nunca `opt-out`. Opt-out significa que a
 * pessoa pediu para não receber mais nada, e só o webhook — ao classificar
 * uma resposta dela — tem autoridade para marcar isso.
 */
export function etapaCanonica(status: StatusSimples): Etapa {
  const mapa: Record<StatusSimples, Etapa> = {
    novo: "novo",
    contatado: "mensagem-enviada",
    conversa: "respondeu",
    proposta: "proposta",
    negociacao: "interessado",
    fechado: "fechado",
    perdido: "sem-interesse",
  };
  return mapa[status];
}

export function rotuloStatus(v: string): string {
  return STATUS.find((s) => s.valor === v)?.rotulo ?? v;
}

export function corStatus(v: string): string {
  return STATUS.find((s) => s.valor === v)?.cor ?? "#8b8b8b";
}

/**
 * Trocar de status na tela não pode desfazer um opt-out.
 *
 * Um lead em `opt-out` aparece como "Perdido". Se você reabrisse ele para
 * "Novo" sem perceber, a fila voltaria a mandar mensagem para quem pediu
 * explicitamente para parar. A tela precisa avisar antes.
 */
export function ehTravaDura(etapa: string): boolean {
  return etapa === "opt-out";
}
