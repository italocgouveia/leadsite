import { GoogleGenAI } from "@google/genai";

/**
 * Camada única de acesso ao modelo.
 *
 * Está isolada de propósito: se um dia você quiser voltar pro Claude (melhor
 * qualidade de HTML, mas pago), troca só este arquivo — os geradores de site,
 * script e logo não mudam.
 *
 * Gemini 3.7 Flash tem cota gratuita e a chave sai do Google AI Studio sem
 * cartão. O limite é por minuto e por dia; se estourar, a API devolve 429.
 */

let cliente: GoogleGenAI | null = null;

function obterCliente(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Pegue a chave grátis em https://aistudio.google.com/apikey",
    );
  }
  cliente ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cliente;
}

/**
 * gemini-3.5-flash, não o 3.7.
 *
 * O 3.7-flash devolve 429 (quota) na conta gratuita — testado com chave nova,
 * sem nenhum consumo prévio, e o erro persiste depois de esperar o limite por
 * minuto. Ele existe na lista de modelos, mas não é utilizável de graça.
 * O 3.5-flash responde normal na mesma chave.
 */
export const MODELO = "gemini-3.5-flash";

/** Para respostas curtas onde velocidade importa mais que capricho. */
export const MODELO_RAPIDO = "gemini-3.5-flash-lite";

export type OpcoesModelo = {
  sistema: string;
  entrada: string;
  maxTokens?: number;
  /**
   * "high" pra gerar site (vale a pena pensar), "low" pra texto curto.
   *
   * Dois detalhes que só aparecem em runtime:
   *  - A API exige MINÚSCULO. O enum `ThinkingLevel` do SDK exporta maiúsculo
   *    e a requisição volta 400. Por isso literais, não o enum.
   *  - "minimal" existe no enum mas o gemini-3.7-flash NÃO aceita: só
   *    high/low/medium. Deixar fora do tipo evita o 400.
   */
  raciocinio?: "low" | "medium" | "high";
};

export async function gerarTexto({
  sistema,
  entrada,
  maxTokens = 32000,
  raciocinio = "high",
}: OpcoesModelo): Promise<string> {
  const ai = obterCliente();

  let interacao;
  try {
    interacao = await ai.interactions.create({
      model: MODELO,
      system_instruction: sistema,
      input: entrada,
      generation_config: {
        max_output_tokens: maxTokens,
        thinking_level: raciocinio,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 429 na cota gratuita é o erro mais comum aqui — vale dizer o que fazer.
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
      throw new Error(
        "Cota gratuita do Gemini esgotada. Espere alguns minutos ou ative faturamento no AI Studio.",
      );
    }
    throw new Error(`Gemini: ${msg}`);
  }

  const texto = interacao.output_text?.trim();
  if (!texto) {
    throw new Error("O modelo devolveu resposta vazia");
  }

  return texto;
}
