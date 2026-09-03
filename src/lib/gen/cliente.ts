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

/**
 * Modelo do raciocínio de prospecção (analisar o lead e escolher a solução).
 *
 * NÃO é um modelo "pro", e não é por preguiça — foi medido em 02/09/2026 com
 * esta chave:
 *  - `gemini-2.5-pro`: 404, aposentado para chaves novas. O próprio Google
 *    manda usar `gemini-3.1-pro-preview` no lugar.
 *  - `gemini-3.1-pro-preview`: existe, mas devolve 429 com
 *    `limit: 0` em `generate_content_free_tier_input_token_count`. Ou seja,
 *    a família Pro tem cota gratuita ZERO — só funciona com faturamento
 *    ativo, que é justamente o que está travado (erro OR_BACR2_59 no cartão).
 *
 * Entre os Flash que respondem de graça, o critério virou COTA DIÁRIA, não
 * esperteza — medido no mesmo dia:
 *  - `gemini-3.8-flash`: `limit: 20` requisições por DIA. Como cada lead é
 *    uma requisição e o teto de envio é 30/dia, 20 não fecha nem uma
 *    campanha. Inutilizável aqui, por mais moderno que seja.
 *  - `gemini-3.5-flash`: cota diária muito maior, e é o mesmo modelo que já
 *    gera site inteiro neste projeto — ou seja, aguenta tarefa bem mais
 *    pesada que escrever 4 linhas de WhatsApp.
 *
 * Trocar por um Pro é mudar esta linha, no dia em que houver faturamento.
 */
export const MODELO_PROSPECCAO = "gemini-3.5-flash";

export type OpcoesModelo = {
  sistema: string;
  entrada: string;
  maxTokens?: number;
  /** Sobrescreve o modelo padrão só nesta chamada. */
  modelo?: string;
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
  /** Quantas vezes tentar quando o 429 for de rajada (limite por minuto). */
  tentativas?: number;
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 por rajada é temporário; `limit: 0` é falta de plano e não adianta insistir. */
function ehCotaTemporaria(msg: string): boolean {
  if (/limit:\s*0/.test(msg)) return false;
  return msg.includes("429") || /quota|resource_exhausted|rate.?limit/i.test(msg);
}

export async function gerarTexto({
  sistema,
  entrada,
  maxTokens = 32000,
  raciocinio = "high",
  modelo = MODELO,
  tentativas = 3,
}: OpcoesModelo): Promise<string> {
  const ai = obterCliente();

  /**
   * Repete quando o 429 é de RAJADA.
   *
   * O free tier tem limite por minuto baixo, e a geração de campanha chama
   * uma vez POR LEAD, em sequência. Sem isto, um lote de 20 leads começava a
   * falhar no meio e os leads seguintes entravam em "pulados" — campanha
   * pela metade, sem motivo visível. Espera crescente (8s, 16s) porque o
   * limite é por minuto: repetir na hora só queima a próxima tentativa.
   *
   * `limit: 0` (modelo sem cota no plano, caso dos Pro) NÃO repete: seria
   * esperar 24s para receber o mesmo "não" três vezes.
   */
  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const interacao = await ai.interactions.create({
        model: modelo,
        system_instruction: sistema,
        input: entrada,
        generation_config: {
          max_output_tokens: maxTokens,
          thinking_level: raciocinio,
        },
      });

      const texto = interacao.output_text?.trim();
      if (!texto) throw new Error("O modelo devolveu resposta vazia");
      return texto;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ultimoErro = msg;

      if (/limit:\s*0/.test(msg)) {
        throw new Error(
          `O modelo ${modelo} não tem cota no plano desta chave (limit: 0) — família Pro exige faturamento ativo.`,
        );
      }
      if (ehCotaTemporaria(msg) && tentativa < tentativas) {
        await dormir(8000 * tentativa);
        continue;
      }
      if (ehCotaTemporaria(msg)) {
        throw new Error(
          "Cota gratuita do Gemini esgotada (limite por minuto). Espere alguns minutos ou ative faturamento no AI Studio.",
        );
      }
      throw new Error(`Gemini: ${msg}`);
    }
  }

  throw new Error(`Gemini: ${ultimoErro}`);
}
