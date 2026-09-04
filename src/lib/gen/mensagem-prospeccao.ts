import type { Lead } from "@/lib/db/schema";
import { gerarTexto, MODELO_PROSPECCAO } from "./cliente";
import { nichoDe } from "@/lib/nichos";
import { avaliarSistema, modulosNaFrase } from "@/lib/sistemas";
import { avaliar } from "@/lib/oportunidade";
import { categoriaSingular } from "@/lib/categoria-nome";
import { catalogoParaPrompt, solucaoPorId, type IdSolucao } from "@/lib/catalogo-solucoes";

/**
 * A IA como SDR: analisa UM lead, escolhe UMA solução, escreve UMA mensagem.
 *
 * Antes isto era "escreva uma mensagem bonita" e o resultado puxava sempre
 * para site, que é a oferta mais óbvia e a menos valiosa. Agora a saída é
 * estruturada — oportunidade, solução e mensagem — por dois motivos:
 *
 *  1. A prévia mostra POR QUE a IA escolheu aquela abordagem. Sem isso não
 *     dá para saber se ela raciocinou ou chutou.
 *  2. Escolher a solução ANTES de escrever força o raciocínio comercial a
 *     acontecer. Pedindo só o texto, o modelo escreve primeiro e racionaliza
 *     depois — e escreve sobre site, porque é o clichê do ramo.
 *
 * REGRA QUE MANDA: fato só entra se veio do cadastro (nome, cidade, nota,
 * Instagram, site). Dor de ramo é HIPÓTESE, nunca afirmação sobre este
 * negócio — a diferença entre "vi que vocês perdem cliente" (mentira que o
 * dono percebe) e "uma coisa que costuma fazer sentido" (convite).
 */

export type ProdutoProspeccao = "site" | "chatbot" | "sistema";

export type AnaliseProspeccao = {
  /** A oportunidade que a IA enxergou, em uma linha. Para a prévia. */
  oportunidade: string;
  /** Id da solução escolhida no catálogo da ICG Tech. */
  solucao: IdSolucao;
  /** Rótulo legível da solução, para a prévia. */
  solucaoRotulo: string;
  /** O texto que vai para a fila e sai no WhatsApp, exatamente assim. */
  mensagem: string;
};

const SISTEMA = `Você é o SDR da ICG Tech, uma software house brasileira. Seu trabalho é olhar UMA empresa por vez e decidir qual solução da casa faz mais sentido oferecer — e então escrever a primeira mensagem de WhatsApp para o dono.

A ICG Tech NÃO é uma fábrica de sites. Vende, nesta ordem de prioridade:

${catalogoParaPrompt()}

COMO DECIDIR:
Pergunte-se: "qual processo dessa empresa provavelmente é feito na mão hoje, e dá para resolver com software?". Agendamento, ordem de serviço, orçamento, pedido, reserva, confirmação, cobrança de quem sumiu, controle de cliente. É aí que está o dinheiro e é aí que o dono sente dor.

Site é a ÚLTIMA opção. Só escolha site quando a empresa não tiver presença digital nenhuma, ou quando o site for a porta de entrada de algo maior. E mesmo aí, posicione como canal de negócio ("um canal que também organiza os contatos que chegam"), nunca como "faço sites profissionais".

Prefira a solução de prioridade menor quando duas couberem — mas use julgamento: um lead sem nenhuma presença digital pode legitimamente puxar site na frente de um sistema.

REGRA ABSOLUTA — NUNCA INVENTAR:
- Nunca afirme que a empresa TEM um problema. Você não olhou a operação dela. Trate como possibilidade: "uma coisa que costuma fazer sentido em X é...", "não sei como vocês fazem hoje, mas...".
- ERRADO: "Vi que vocês perdem clientes por não ter sistema."
- CERTO: "Uma coisa que pode fazer sentido é automatizar a confirmação de agendamento."
- Só cite Instagram, site ou nota do Google se eu informar explicitamente que existem. Se eu disser "sem Instagram conhecido", jamais escreva que viu o Instagram.
- Nunca invente cliente, case, resultado, número, faturamento, quantidade de funcionários, concorrente.
- NUNCA invente o nome de quem está escrevendo. Não assine, não diga "sou o Fulano", não use primeira pessoa com nome próprio. Se quiser se identificar, diga apenas "sou da ICG Tech" — sem nome de pessoa.
- ERRADO: "Oi, sou o Lucas da ICG Tech." / "Sou o Felipe, da ICG Tech."
- CERTO: "Oi, tudo bem? Sou da ICG Tech." ou simplesmente "Oi, tudo bem?"
- Sem informação suficiente, seja mais genérico e verdadeiro. Genérico honesto vende; específico inventado queima.

COMO ESCREVER A MENSAGEM:
- Português do Brasil, tom de pessoa real no WhatsApp. Nunca anúncio, nunca corporativo.
- Máximo 4 linhas. Curta.
- No máximo 1 emoji, ou nenhum.
- Proibido: "soluções inovadoras", "transforme seu negócio", "alavancar", "potencializar", "somos especialistas", "plataforma completa".
- Não mande preço, proposta nem lista de funcionalidades. É o primeiro contato.
- Termine com um convite leve de conversa: "posso te mostrar a ideia?", "quer que eu te explique rapidinho?", "faz sentido pra vocês?". Varie — nunca a mesma frase em duas mensagens.
- Varie também abertura, argumento e estrutura entre um lead e outro. Quem recebe percebe copiar-e-colar na hora.

FORMATO DA RESPOSTA — responda APENAS com um JSON válido, sem markdown, sem cerca de código, sem texto antes ou depois:
{"oportunidade":"<a oportunidade que você enxergou, uma linha curta, em português>","solucao":"<um id exato do catálogo acima>","mensagem":"<a mensagem de WhatsApp, máximo 4 linhas>"}`;

function briefing(lead: Lead, produtoForcado?: ProdutoProspeccao): string {
  const nicho = nichoDe(lead.categoria);
  const encaixe = avaliarSistema(lead);
  const oportunidade = avaliar(lead);

  const linhas: (string | null)[] = [
    `Empresa: ${lead.nome}`,
    `Ramo: ${categoriaSingular(lead.categoria)}`,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,

    // --- fatos verificáveis do cadastro ---
    lead.nota != null
      ? `Nota no Google: ${lead.nota} com ${lead.avaliacoes ?? 0} avaliações. É FATO, pode citar como elogio.`
      : "Sem nota no Google no cadastro — NÃO cite avaliação nem nota.",
    lead.instagram
      ? "Tem Instagram no cadastro — pode dizer que viu o Instagram."
      : "Sem Instagram conhecido — NÃO diga que viu o Instagram.",
    lead.statusSite === "tem-site"
      ? "JÁ TEM site próprio no ar — não ofereça criação de site."
      : lead.statusSite === "so-rede-social"
        ? "Só tem rede social, sem site próprio."
        : lead.statusSite === "so-agregador"
          ? "Depende de um agregador (tipo iFood/Linktree), sem site próprio."
          : lead.statusSite === "site-fora-do-ar"
            ? "O site que aparece no Google está FORA DO AR — isso é fato verificado."
            : "Sem site próprio conhecido.",
    lead.horarios ? "Publica horário de funcionamento — opera com agenda." : null,
    lead.diferenciais ? `O que já se sabe do negócio: ${lead.diferenciais}` : null,

    // --- hipóteses de ramo (NÃO são fatos deste negócio) ---
    `HIPÓTESE de ramo (conhecimento geral, NÃO observação sobre esta empresa): negócios de ${categoriaSingular(lead.categoria)} costumam ${nicho.dor.replace(/^evitar\s+/i, "gastar tempo com ")}.`,
    encaixe.serve
      ? `HIPÓTESE de sistema para este ramo: ${encaixe.sistema} (${modulosNaFrase(encaixe.modulos)}), que tira da mão a tarefa de ${encaixe.dor}.`
      : "Este ramo não tem perfil de sistema pronto no catálogo — pense no processo manual mais provável dele, sem afirmar que existe.",
    oportunidade.oferta.sinaisChatbot.length
      ? `Sinais REAIS de volume de atendimento: ${oportunidade.oferta.sinaisChatbot.join("; ")}.`
      : "Sem sinal de volume alto de atendimento neste cadastro.",

    produtoForcado
      ? `O operador FORÇOU a oferta desta campanha: ${produtoForcado}. Use essa família de solução mesmo que outra pareça melhor.`
      : "O operador escolheu Automático: você decide a solução pelo catálogo e pela prioridade.",
    "Não existem cases, depoimentos nem clientes anteriores para citar. Não invente nenhum.",
  ];

  return linhas.filter((l): l is string => Boolean(l)).join("\n");
}

/** Tira cerca de código/aspas que o modelo às vezes devolve mesmo proibido. */
function limparJson(texto: string): string {
  let t = texto.trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) t = cerca[1].trim();
  const inicio = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  if (inicio !== -1 && fim > inicio) t = t.slice(inicio, fim + 1);
  return t;
}

/**
 * Conserta o defeito de JSON que este prompt produz na prática: quebra de
 * linha CRUA dentro do valor da mensagem.
 *
 * Medido em 02/09/2026 — 1 lead em 5 falhava com "JSON inválido" porque a
 * mensagem de WhatsApp tem várias linhas e o modelo escreve o Enter de
 * verdade em vez de `\n`. `JSON.parse` recusa caractere de controle dentro
 * de string, e o lead era pulado por um erro de formatação, não de conteúdo.
 *
 * Percorre caractere a caractere rastreando se está dentro de string, e
 * escapa \n, \r e \t só ali dentro — fora da string eles são espaço legítimo
 * entre campos e não podem ser tocados.
 */
function repararJson(t: string): string {
  let dentro = false;
  let escapando = false;
  let saida = "";

  for (const c of t) {
    if (escapando) {
      saida += c;
      escapando = false;
      continue;
    }
    if (c === "\\") {
      saida += c;
      escapando = true;
      continue;
    }
    if (c === '"') {
      dentro = !dentro;
      saida += c;
      continue;
    }
    if (dentro && (c === "\n" || c === "\r" || c === "\t")) {
      saida += c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t";
      continue;
    }
    saida += c;
  }
  return saida;
}

/**
 * Controle de qualidade ANTES de gravar.
 *
 * Mensagem quebrada na fila é pior que lead pulado: o lead pulado volta na
 * próxima campanha, a mensagem quebrada sai no WhatsApp de um estranho.
 */
export function validarMensagem(m: string): string | null {
  const t = m.trim();
  if (t.length < 40) return "mensagem curta demais";
  if (t.length > 900) return "mensagem longa demais";
  if (/undefined|null|NaN/.test(t)) return "contém valor de variável não preenchido";
  if (/\{\{|\}\}|\[nome|\[empresa|\[cidade|<[a-z_]+>/i.test(t)) return "contém placeholder não substituído";
  if (/^\s*[{[]/.test(t) || /"mensagem"\s*:/.test(t)) return "veio JSON no lugar do texto";
  if (/como (SDR|IA|assistente)|posso ajudar com mais|segue a mensagem/i.test(t))
    return "contém explicação da IA em vez da mensagem";

  /**
   * Nome de pessoa inventado na assinatura.
   *
   * A regra já está no prompt, mas prompt não é garantia: em 27 mensagens
   * geradas, duas se apresentaram como "Lucas" e "Felipe" — pessoas que não
   * existem. Assinar com nome falso é pior que não assinar: o lead responde
   * "oi Felipe" e a mentira precisa ser mantida ou desfeita na segunda
   * mensagem.
   *
   * "Sou da ICG Tech" passa; "sou o Lucas" não. A checagem exige inicial
   * maiúscula para não confundir com "sou o responsável".
   */
  const assinatura = t.match(
    /\b(?:[Ss]ou [oa]|[Aa]qui é [oa]|[Mm]eu nome é|[Mm]e chamo)\s+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]{2,})/,
  );
  if (assinatura) return `inventou o nome do remetente ("${assinatura[1]}")`;

  return null;
}

export type OpcoesMensagemProspeccao = {
  /** Força a família de solução. Sem isto, a IA decide (modo Automático). */
  produto?: ProdutoProspeccao;
};

/**
 * Analisa UM lead e devolve oportunidade + solução + mensagem.
 *
 * Chamada em laço, um lead por vez — ver `montarCampanha` em lib/campanha.ts.
 * Não grava nada; quem grava é quem chama. Erro aqui é para SUBIR: o
 * chamador pula o lead em vez de enfileirar lixo.
 */
async function umaTentativa(
  lead: Lead,
  produto: ProdutoProspeccao | undefined,
): Promise<AnaliseProspeccao> {
  const bruto = await gerarTexto({
    sistema: SISTEMA,
    entrada: briefing(lead, produto),
    modelo: MODELO_PROSPECCAO,
    // Analisar e decidir pede mais que escrever: "medium" é o teto que o
    // free tier aguenta sem a latência explodir no laço por lead.
    raciocinio: "medium",
    maxTokens: 1200,
  });

  const limpo = limparJson(bruto);
  let dados: { oportunidade?: unknown; solucao?: unknown; mensagem?: unknown };
  try {
    dados = JSON.parse(limpo);
  } catch {
    // Segunda chance no mesmo texto: quebra de linha crua dentro da string.
    try {
      dados = JSON.parse(repararJson(limpo));
    } catch {
      throw new Error("a IA não devolveu JSON válido");
    }
  }

  const mensagem = typeof dados.mensagem === "string" ? dados.mensagem.trim() : "";
  const problema = validarMensagem(mensagem);
  if (problema) throw new Error(`mensagem reprovada no controle de qualidade: ${problema}`);

  const solucao = solucaoPorId(String(dados.solucao ?? ""));
  if (!solucao) throw new Error(`a IA escolheu uma solução fora do catálogo: ${String(dados.solucao)}`);

  const oportunidade =
    typeof dados.oportunidade === "string" && dados.oportunidade.trim()
      ? dados.oportunidade.trim()
      : solucao.rotulo;

  return { oportunidade, solucao: solucao.id, solucaoRotulo: solucao.rotulo, mensagem };
}

export async function gerarMensagemProspeccao(
  lead: Lead,
  opcoes: OpcoesMensagemProspeccao = {},
): Promise<AnaliseProspeccao> {
  /**
   * Duas tentativas. A primeira falha às vezes por formato (JSON torto,
   * mensagem que não passou no controle de qualidade), não por cota — e
   * gerar de novo costuma resolver, porque a saída do modelo varia. Sem
   * isto, um lead bom era descartado por um Enter no lugar errado.
   *
   * Erro de cota NÃO chega aqui repetido: `gerarTexto` já tem a própria
   * espera crescente para 429 de rajada.
   */
  try {
    return await umaTentativa(lead, opcoes.produto);
  } catch (primeiro) {
    const msg = primeiro instanceof Error ? primeiro.message : String(primeiro);
    if (/cota|quota|limit: 0/i.test(msg)) throw primeiro;
    return await umaTentativa(lead, opcoes.produto);
  }
}
