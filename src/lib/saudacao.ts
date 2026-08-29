/**
 * Saudação por hora do dia — resolvida no ENVIO, não na criação.
 *
 * Este arquivo existe por causa de um descompasso: o texto da mensagem é
 * gravado no banco quando a campanha é montada, mas sai da fila ao longo de
 * dias. Com 354 mensagens a 30/dia, a última sai quase duas semanas depois da
 * primeira.
 *
 * Se a saudação fosse calculada na montagem, uma campanha criada às 20h sairia
 * dizendo "Boa noite" para quem abre o WhatsApp às 9h da manhã de quinta —
 * pior do que o "Oi" neutro que havia antes.
 *
 * Por isso o texto guarda um marcador e a troca acontece no último instante,
 * dentro de `enviarProxima`.
 */

/** O que fica gravado no banco no lugar da saudação. */
export const MARCA_SAUDACAO = "{{saudacao}}";

/**
 * Fuso fixo em São Paulo, não o do servidor.
 *
 * O painel roda na sua máquina hoje, onde a hora local já é a certa. Mas a
 * mesma função existe no build que sobe para a Vercel, e lá o relógio é UTC —
 * 21h de Uberlândia seria meia-noite, e o lead receberia "Bom dia" na hora do
 * jantar. Fixar o fuso remove a pegadinha antes de ela acontecer.
 */
const FUSO = "America/Sao_Paulo";

export function horaEmSaoPaulo(quando: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    hour12: false,
  }).format(quando);
  return Number(h);
}

/**
 * As faixas seguem o uso comum no Brasil, não o relógio astronômico:
 * "boa tarde" começa ao meio-dia e "boa noite" às 18h.
 */
export function saudacaoDe(quando: Date = new Date()): string {
  const h = horaEmSaoPaulo(quando);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Troca o marcador pela saudação da hora. Texto sem marcador passa igual. */
export function resolverSaudacao(texto: string, quando: Date = new Date()): string {
  if (!texto.includes(MARCA_SAUDACAO)) return texto;
  return texto.split(MARCA_SAUDACAO).join(saudacaoDe(quando));
}

/**
 * O caminho de volta: texto com saudação literal vira texto com marcador.
 *
 * Existe por causa da edição manual. A tela mostra "Bom dia, tudo bem?" (o
 * marcador cru pareceria defeito), então quem edita e salva gravaria essa
 * saudação chumbada — e a mensagem sairia dizendo "Bom dia" às oito da noite,
 * que é exatamente o problema que o marcador resolve.
 *
 * Só troca no COMEÇO do texto. Uma saudação no meio da mensagem é escolha de
 * quem escreveu e não deve virar variável.
 */
export function reinserirSaudacao(texto: string): string {
  return texto.replace(/^(Bom dia|Boa tarde|Boa noite)\b/, MARCA_SAUDACAO);
}

/** Só o que a abertura precisa do lead — evita arrastar o tipo inteiro. */
type ComSocios = { socios?: { nome: string; decide: boolean }[] | null };

/**
 * A primeira linha das três abordagens: site, chatbot e sistema.
 *
 * Mora aqui, e não em cada motor de mensagem, porque a versão anterior tinha
 * duas aberturas diferentes — "Oi, tudo bem?" no sistema e "Boa!" nas outras
 * duas. Três cópias da mesma decisão é como elas voltam a divergir na próxima
 * vez que uma for ajustada.
 *
 * Chama o dono pelo nome quando a Receita informou o quadro societário. É a
 * diferença entre cair na recepção e falar com quem decide.
 */
export function aberturaSaudacao(lead: ComSocios): string {
  const socios = lead.socios ?? [];
  const dono = socios.find((s) => s.decide) ?? socios[0];
  const primeiro = dono?.nome?.trim().split(/\s+/)[0];

  if (!primeiro) return `${MARCA_SAUDACAO}, tudo bem?`;

  // NOME COMPLETO EM CAIXA ALTA é como a Receita devolve; "CARLOS" assusta.
  const capitalizado = primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
  return `${MARCA_SAUDACAO} ${capitalizado}, tudo bem?`;
}
