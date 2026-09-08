import type { Lead } from "@/lib/db/schema";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";

/**
 * A PRAÇA da operação: onde a ICG Tech de fato vende.
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 *
 * Medido na base: dos 20 melhores leads do painel, 19 NÃO eram de Uberlândia.
 * O topo era dentista em São Paulo, fisioterapeuta em Goiânia, psiquiatra em
 * Brasília — e só 14 dos 123 acionáveis estavam na cidade da operação.
 *
 * A causa não é o score: é a origem dos dados. Os 222 leads preservados da
 * prospecção antiga de pousadas estão espalhados pelo Brasil e TÊM telefone,
 * porque vieram de uma coleta mais rica. Os 835 novos de Uberlândia quase não
 * têm. Sem geografia na régua, quem tem telefone ganha — mesmo a 600 km.
 *
 * Para venda local isso é qualidade comercial, não detalhe: fora da praça não
 * há visita, não há referência de vizinho, não há "conheço o pessoal do posto
 * ao lado". A distância entra no score como o sinal comercial que ela é.
 *
 * NÃO É DESCARTE. Lead fora da praça continua na base e continua visível —
 * vários têm histórico real de conversa. Ele só para de ocupar o topo de uma
 * lista que existe para dizer com quem falar HOJE.
 */

/**
 * Onde a operação atende. Configurável por ambiente para quem mudar de praça
 * não precisar editar código — e com padrão explícito, para não depender de
 * variável que ninguém setou.
 */
export const PRACA = {
  cidade: process.env.PRACA_CIDADE?.trim() || "Uberlândia",
  uf: (process.env.PRACA_UF?.trim() || "MG").toUpperCase(),
  /**
   * O DDD é o melhor marcador de REGIÃO que existe de graça.
   *
   * "Mesmo estado" não serve para venda local: Belo Horizonte é MG e está a
   * 550 km de Uberlândia — tão fora de alcance quanto São Paulo. O DDD 34
   * cobre o Triângulo Mineiro, que é a região onde dá para ir e voltar no
   * mesmo dia. Foi medido: sem esta distinção, uma clínica de BH ficava em
   * primeiro lugar numa lista de prospecção de Uberlândia.
   */
  ddd: Number(process.env.PRACA_DDD?.trim() || 34),
};

export type Alcance = "local" | "regional" | "fora";

export const ROTULO_ALCANCE: Record<Alcance, string> = {
  local: "📍 na praça",
  regional: "🛣 mesmo estado",
  fora: "✈ fora da praça",
};

function normalizar(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * O lead está na praça, no estado, ou fora?
 *
 * A comparação é sem acento e sem caixa de propósito: a base tem "Uberlândia"
 * e "Uberlandia" gravados como cidades diferentes, e tratá-las como lugares
 * distintos jogaria leads da própria cidade para fora da operação.
 *
 * Quando a cidade não é reconhecível (a base tem "Minas Gerais" gravado no
 * campo de cidade), a UF decide — é o dado que sobrou, e ele ainda separa
 * "perto" de "longe".
 */
export function alcanceDoLead(
  lead: Pick<Lead, "cidade" | "estado" | "telefone" | "whatsapp">,
): Alcance {
  const cidade = normalizar(lead.cidade);
  const uf = normalizar(lead.estado);
  const praca = normalizar(PRACA.cidade);
  const pracaUf = normalizar(PRACA.uf);

  if (cidade && cidade === praca) return "local";

  /**
   * O ENDEREÇO manda, não o telefone.
   *
   * É onde o negócio funciona que decide se dá para visitar. Um lead com
   * endereço em São Paulo e celular de DDD 34 (dono que se mudou, número
   * antigo) continua sendo uma empresa de São Paulo — deixar o DDD decidir
   * traria a empresa errada para o topo da lista local.
   */
  if (uf && uf !== pracaUf) return "fora";

  /**
   * Dentro da UF, o DDD refina: ele separa Uberaba (34, uma hora de estrada)
   * de Belo Horizonte (31, 550 km), que "mesmo estado" trata como iguais.
   * Minas é grande demais para a UF sozinha significar alguma coisa.
   */
  const tel = validarTelefone(telefoneDoLead(lead));
  if (uf === pracaUf && tel) {
    return Number(tel.e164.slice(2, 4)) === PRACA.ddd ? "regional" : "fora";
  }

  /**
   * Sem telefone e sem UF que contradiga, sobra a aproximação grosseira — e
   * ela fica assumida como tal: o lead vai para `regional` em vez de levar a
   * penalidade cheia, porque ninguém apurou a distância dele de verdade.
   */
  if (uf === pracaUf) return "regional";
  if (!cidade && !uf) return "regional";
  return "fora";
}

export function ehDaPraca(
  lead: Pick<Lead, "cidade" | "estado" | "telefone" | "whatsapp">,
): boolean {
  return alcanceDoLead(lead) === "local";
}

/** Dá para trabalhar sem pegar estrada longa: a praça ou a região do DDD. */
export function ehAlcancavel(
  lead: Pick<Lead, "cidade" | "estado" | "telefone" | "whatsapp">,
): boolean {
  return alcanceDoLead(lead) !== "fora";
}
