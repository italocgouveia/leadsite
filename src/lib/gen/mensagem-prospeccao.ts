import type { Lead } from "@/lib/db/schema";
import { gerarTexto } from "./cliente";
import { nichoDe } from "@/lib/nichos";
import { avaliarSistema } from "@/lib/sistemas";
import { avaliar } from "@/lib/oportunidade";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Mensagem de primeiro contato, uma por lead, escrita pela IA.
 *
 * Existe porque uma mensagem única para o lote inteiro (ver o parâmetro
 * `mensagem` de `montarCampanha`) é ótima quando a pessoa quer controle
 * total do texto, mas é sempre a mesma — quem recebe percebe "copiar e
 * colar" na hora. Isto aqui é o oposto: cada lead recebe uma mensagem
 * escrita para ELE, mas dentro de travas rígidas contra invenção.
 *
 * REGRA QUE MANDA: só entra no prompt o que é FATO verificável — vindo do
 * cadastro do lead (nome, cidade, nota do Google, se tem Instagram/site) ou
 * do catálogo de nichos (`lib/nichos.ts`, `lib/sistemas.ts`), que é
 * conhecimento GERAL do ramo, não uma alegação específica sobre ESTE
 * negócio. O prompt deixa isso explícito para o modelo não confundir "dor
 * comum desse ramo" com "eu vi que vocês têm esse problema".
 */

export type ProdutoProspeccao = "site" | "chatbot" | "sistema";

const SISTEMA = `Você escreve mensagens de primeiro contato no WhatsApp para pequenos negócios brasileiros, em nome de um desenvolvedor freelancer que oferece site, atendente de WhatsApp com IA, ou sistema de gestão sob medida.

Cada mensagem é para UM negócio específico, e você vai escrever várias, uma por vez, para negócios diferentes. Elas PRECISAM ser diferentes entre si de verdade — abertura, argumento, estrutura, comprimento e CTA podem variar — porque quem recebe percebe na hora se é copiar-e-colar com o nome trocado.

REGRA MAIS IMPORTANTE — NUNCA INVENTAR:
- Só afirme ter visto o Instagram, o site ou o Google do negócio se eu informar explicitamente que existe. Se eu disser "sem Instagram conhecido", jamais escreva "vi seu Instagram".
- Nunca cite resultado de cliente, case, depoimento ou número que eu não tiver fornecido.
- Um "problema comum desse RAMO" que eu forneço é conhecimento GERAL do tipo de negócio — não é algo que você observou especificamente NESTE negócio. Não escreva como se tivesse visto o problema acontecer lá. Fale em termos de "negócios assim costumam..." ou implique de leve, nunca afirme como fato observado.
- Sem informação suficiente sobre o negócio, escreva uma abordagem mais genérica e segura. Genérico e verdadeiro é sempre melhor que específico e inventado.

REGRAS DE ESCRITA:
- Português do Brasil, tom direto e natural — como uma pessoa de verdade escrevendo no WhatsApp, nunca como anúncio ou robô.
- Máximo 4 linhas.
- No máximo 1 emoji, ou nenhum. Nada de excesso.
- Sem termo técnico ou de marketing ("solução", "ferramenta digital", "plataforma", "sob medida" demais).
- Não mande proposta completa, preço ou lista de funcionalidades — é o primeiro contato, não a venda.
- Termine com um convite de baixo compromisso para mostrar algo (uma demonstração, um exemplo pronto) — nunca peça para "fechar", "contratar" ou "assinar" já na primeira mensagem.

Devolva APENAS o texto final da mensagem. Sem aspas, sem markdown, sem explicação, sem comentário antes ou depois.`;

/**
 * "Automático": a IA escolhe a oferta, mas não no escuro — recebe os MESMOS
 * sinais reais e verificáveis que o motor determinístico já usa para decidir
 * entre site/chatbot (`lib/oportunidade.ts` → `escolherProduto` em
 * lib/produto.ts) e para decidir se o ramo comporta um sistema
 * (`lib/sistemas.ts` → `avaliarSistema`). Nenhum desses sinais é chute: são
 * derivados de campos reais do lead (statusSite, whatsapp, categoria).
 *
 * A escolha final fica com o modelo — de propósito, por pedido explícito:
 * "a IA deve decidir individualmente para cada lead". O motor determinístico
 * (`textoPara`, usado quando `usarIA` não está ligado) continua tendo sua
 * própria regra fixa (sistema vence se o ramo encaixa); aqui é diferente:
 * os dois sinais são apresentados lado a lado e o modelo pesa qual tem a
 * melhor justificativa PARA ESTE lead.
 */
function contextoAutomatico(lead: Lead): string {
  const oportunidade = avaliar(lead);
  const encaixeSistema = avaliarSistema(lead);

  return [
    "Escolha a MELHOR oferta entre site, chatbot (atendente de WhatsApp com IA) ou sistema de gestão — baseado SÓ nos sinais reais abaixo. Não invente outro sinal além destes.",
    `Recomendação do motor de site/chatbot para este lead: ${oportunidade.oferta.produto} (${oportunidade.oferta.servico}) — motivo real: ${oportunidade.oferta.motivo}`,
    oportunidade.oferta.sinaisChatbot.length
      ? `Sinais reais de que atendimento automático faz sentido aqui: ${oportunidade.oferta.sinaisChatbot.join("; ")}.`
      : "Sem sinal forte de que atendimento automático seja prioridade para este lead.",
    encaixeSistema.serve
      ? `Este RAMO costuma ter operação que um sistema organiza — ${encaixeSistema.sistema.toLowerCase()}, eliminando ${encaixeSistema.dor}. Sinal de encaixe: ${encaixeSistema.sinais[0] ?? "encaixe é do ramo em geral, sem sinal extra de volume neste lead específico"}.`
      : "Este ramo não costuma precisar de um sistema de gestão dedicado — só ofereça sistema se outro dado forte acima justificar.",
    "Escolha UMA oferta, a com melhor justificativa real acima — nunca ofereça duas juntas. Se os sinais forem fracos para todas, escreva uma abordagem mais genérica, sem se comprometer com uma oferta específica.",
  ].join("\n");
}

function ofertaDe(produto: ProdutoProspeccao | undefined, lead: Lead): string {
  if (produto === "site") return "Ofereça: um site/página profissional para este negócio.";
  if (produto === "chatbot") return "Ofereça: um atendente de WhatsApp com IA para este negócio.";
  if (produto === "sistema") {
    const encaixe = avaliarSistema(lead);
    return encaixe.serve
      ? `Ofereça: ${encaixe.sistema.toLowerCase()}, especificamente para eliminar a tarefa de ${encaixe.dor} — isto é conhecimento geral do ramo, não algo que você viu neste negócio.`
      : "Ofereça: um sistema de gestão sob medida para o dia a dia deste tipo de negócio, em termos gerais.";
  }
  return contextoAutomatico(lead);
}

function briefing(lead: Lead, produto?: ProdutoProspeccao): string {
  const nicho = nichoDe(lead.categoria);

  const linhas = [
    `Negócio: ${lead.nome}`,
    `Ramo: ${categoriaSingular(lead.categoria)}`,
    lead.cidade ? `Cidade: ${lead.cidade}` : null,
    `Problema comum desse RAMO (conhecimento geral do tipo de negócio, NÃO uma observação sobre este negócio específico): ${nicho.dor}`,
    lead.nota != null
      ? `Nota no Google: ${lead.nota} (${lead.avaliacoes ?? 0} avaliações) — pode citar como elogio real, é fato.`
      : "Sem nota no Google disponível — não cite avaliação nem nota.",
    lead.instagram
      ? "Tem Instagram cadastrado — pode mencionar que viu o Instagram do negócio."
      : "Sem Instagram conhecido — não diga que viu o Instagram.",
    lead.website && lead.statusSite === "tem-site"
      ? "Já tem site próprio no ar — não ofereça site, ofereça outra coisa (chatbot ou sistema)."
      : "Sem site próprio — pode citar a falta de site como oportunidade real, se fizer sentido.",
    lead.diferenciais ? `O que já se sabe sobre este negócio: ${lead.diferenciais}` : null,
    ofertaDe(produto, lead),
    "Não existem depoimentos, cases nem clientes anteriores para citar. Não invente nenhum.",
  ];

  return linhas.filter((l): l is string => Boolean(l)).join("\n");
}

/** Limpa cerca de código/aspas que o modelo às vezes devolve mesmo sendo proibido. */
function limpar(texto: string): string {
  let t = texto.trim();
  const comCerca = t.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (comCerca) t = comCerca[1].trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  return t;
}

export type OpcoesMensagemProspeccao = {
  produto?: ProdutoProspeccao;
};

/**
 * Gera UMA mensagem, para UM lead. Chamada em loop, um lead por vez — ver
 * `montarCampanha` em lib/campanha.ts. Não grava nada; quem grava é quem
 * chama.
 */
export async function gerarMensagemProspeccao(
  lead: Lead,
  opcoes: OpcoesMensagemProspeccao = {},
): Promise<string> {
  const texto = await gerarTexto({
    sistema: SISTEMA,
    entrada: briefing(lead, opcoes.produto),
    // 500 cortava mensagem no meio em teste real — "low" ainda consome parte
    // do orçamento em raciocínio interno antes do texto visível começar.
    maxTokens: 900,
    raciocinio: "low",
  });

  return limpar(texto);
}
