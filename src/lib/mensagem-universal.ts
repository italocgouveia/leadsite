import type { Lead } from "@/lib/db";

/**
 * A primeira abordagem: UMA copy para todos, só o nome da empresa muda.
 *
 * POR QUE A PRIMEIRA MENSAGEM DEIXOU DE SER INTELIGENTE
 *
 * O sistema escolhia produto por lead — site para um, sistema para outro,
 * chatbot para o terceiro — e a IA escrevia um argumento diferente para cada.
 * Isso parece melhor e não é: na primeira mensagem não existe contexto real
 * nenhum. O que havia era palpite a partir do ramo, e palpite escrito com
 * confiança vira afirmação sobre o negócio de um estranho.
 *
 * A inteligência comercial não sumiu — ela mudou de lugar. Catálogo, score,
 * diagnóstico, objeção e próxima ação continuam inteiros e entram DEPOIS que
 * o lead responde, quando existe contexto de verdade para sustentar uma
 * recomendação. Antes da resposta: abertura universal. Depois: inteligência.
 *
 * CONSEQUÊNCIA PRÁTICA: gerar campanha não gasta cota do Gemini. A geração de
 * um lote de 30 passou de 30 chamadas de IA para zero, e deixou de depender
 * de cota, de 429 e de retry para acontecer.
 */

/**
 * A copy. Fonte única — a tela mostra esta mesma constante na prévia, para o
 * que você lê ser exatamente o que sai.
 *
 * Deliberadamente sem: nome de pessoa (a IA já inventou "Lucas" e "Felipe"
 * antes), promessa de resultado, menção a produto e qualquer afirmação sobre
 * a operação do lead. O que ela faz é pedir permissão para explicar — e é só
 * isso que a primeira mensagem precisa conseguir.
 */
export const MENSAGEM_BASE =
  "Olá, tudo bem? Falo da ICG Tech. Vi a empresa [NOME_EMPRESA] e queria te " +
  "mostrar uma ideia que pode ajudar vocês a melhorar alguns processos e " +
  "oportunidades comerciais. Posso te explicar rapidinho?";

/** O marcador que é trocado. Único ponto de variação entre um lead e outro. */
export const PLACEHOLDER = "[NOME_EMPRESA]";

/**
 * Quando o cadastro não tem nome utilizável.
 *
 * "Vi a empresa  e queria" com um buraco no meio é pior que genérico: parece
 * sistema quebrado, e quem recebe não responde.
 *
 * O texto escolhido tem que encaixar NO SLOT. "sua empresa" produziria "Vi a
 * empresa sua empresa e queria" — gramaticalmente quebrado, e mais denunciante
 * que o buraco. "de vocês" completa a frase: "Vi a empresa de vocês e queria".
 */
const SEM_NOME = "de vocês";

/**
 * Limpa o nome do jeito que ele será lido em voz alta pelo destinatário.
 *
 * Cadastro de mapa vem com sujeira que não se escreve numa mensagem: sufixo
 * de razão social, telefone colado, endereço no meio do nome. Cortar isso é
 * a diferença entre "Vi a empresa Oficina do João" e "Vi a empresa OFICINA DO
 * JOAO LTDA ME - AV BRASIL 1200".
 */
export function nomeParaMensagem(lead: Pick<Lead, "nome">): string {
  const bruto = (lead.nome ?? "").trim();
  if (!bruto) return SEM_NOME;

  const limpo = bruto
    // Corta o que vem depois de separador: endereço, telefone, filial.
    .split(/\s+[-–|]\s+/)[0]
    // Sufixos societários não são o nome que a pessoa usa.
    .replace(/\s*\b(ltda|me|epp|eireli|s\/?a|mei)\b\.?\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (limpo.length < 2) return SEM_NOME;
  if (limpo.length > 60) return SEM_NOME;

  /**
   * TUDO EM CAIXA ALTA vira Capitalizado. Manda-se "Vi a empresa Auto Center
   * Silva", não "Vi a empresa AUTO CENTER SILVA" — que na leitura soa como
   * grito e denuncia cópia de cadastro.
   */
  if (limpo === limpo.toUpperCase() && /[A-ZÀ-Ú]{4,}/.test(limpo)) {
    return limpo
      .toLocaleLowerCase("pt-BR")
      .replace(/(^|\s)(\p{L})/gu, (_, s, c: string) => s + c.toLocaleUpperCase("pt-BR"));
  }

  return limpo;
}

/**
 * A mensagem que vai para este lead.
 *
 * Função pura: mesmo lead, mesmo texto, sempre. Sem IA, sem rede, sem banco —
 * o que permite gerar mil mensagens instantaneamente e testar a igualdade
 * entre elas com uma comparação de string.
 *
 * NÃO varia por nicho, solução, score, oportunidade ou etapa. Se algum dia
 * variar, o teste de igualdade quebra — que é exatamente o objetivo dele.
 */
export function montarMensagemUniversal(lead: Pick<Lead, "nome">): string {
  return MENSAGEM_BASE.split(PLACEHOLDER).join(nomeParaMensagem(lead));
}
