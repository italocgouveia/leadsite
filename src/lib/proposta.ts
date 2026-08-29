import { aberturaSaudacao } from "@/lib/saudacao";
import type { Lead } from "@/lib/db/schema";
import { avaliar } from "@/lib/oportunidade";
import { categoriaPlural, ondeFica } from "@/lib/categoria-nome";
import { nichoDe, type Nicho } from "@/lib/nichos";

/**
 * Mensagem de abordagem montada NA HORA, sem chamar a IA.
 *
 * O objetivo do produto é abrir o WhatsApp com a mensagem pronta em segundos.
 * Gerar por modelo levava 10 a 20 segundos e às vezes estourava a cota — tempo
 * demais para uma ação que você repete dezenas de vezes por dia.
 *
 * ESTRUTURA (a mesma sempre, o conteúdo muda por lead):
 *  1. elogio ancorado em algo verificável
 *  2. a falta específica DAQUELE ramo
 *  3. quem você é e o que já fez
 *  4. a tarefa chata do dia a dia que a página elimina
 *  5. pergunta fácil, de 30 segundos
 */

export type Proposta = {
  problema: string;
  servico: string;
  mensagem: string;
};

/** Primeiro nome/apelido do negócio, pra mensagem não ficar robótica. */
function nomeCurto(nome: string): string {
  return nome
    .replace(/\s*[-–|].*$/, "")
    .replace(/\b(ltda|me|epp|eireli|s\/a|sa)\b\.?/gi, "")
    .trim();
}

function problemaDe(lead: Lead, produto?: string): string {
  // Vendendo chatbot, "tem site mas dá pra modernizar" é a leitura errada:
  // o site dele está de pé, o gargalo é o atendimento.
  if (produto === "chatbot") return "Tem site e recebe movimento — o gargalo é responder";

  switch (lead.statusSite) {
    case "site-fora-do-ar":
      return "O site cadastrado no Google está fora do ar";
    case "sem-ssl":
      return "O site não tem HTTPS e o navegador marca como inseguro";
    case "so-rede-social":
      return "Só tem rede social, sem site próprio";
    case "so-agregador":
      return "Depende de um agregador, sem site próprio";
    case "tem-site":
      return "Tem site, mas dá para modernizar";
    default:
      return "Não encontramos site próprio";
  }
}

/**
 * O elogio precisa ser ancorado em algo que dá pra verificar.
 *
 * "Vi que o trabalho de vocês é excelente" sem base é elogio de vendedor e o
 * dono percebe. Com nota do Google, é fato. Sem nota, uso uma abertura neutra
 * em vez de afirmar qualidade que não conheço.
 */
function elogio(lead: Lead, nome: string): string {
  if (lead.nota != null && (lead.avaliacoes ?? 0) >= 10) {
    return `Vi as avaliações da ${nome} no Google (${lead.nota} com ${lead.avaliacoes} avaliações) e o trabalho de vocês é muito bem falado`;
  }
  if (lead.nota != null && lead.nota >= 4) {
    return `Vi a ${nome} no Google e as avaliações de vocês são ótimas`;
  }
  if (lead.instagram) {
    return `Dei uma olhada no Instagram da ${nome} e o trabalho de vocês é muito bom`;
  }
  return `Conheci a ${nome} procurando ${categoriaPlural(lead.categoria)} ${ondeFica(lead.cidade)}`;
}

/**
 * A falta muda conforme o que ele JÁ tem.
 *
 * Os casos "agregador" e "já tem site" usam o nome CURTO da página
 * (`nicho.pagina`), não a frase longa: encaixar a frase inteira produzia coisas
 * como "agendar pelo celular próprio, só o link de terceiros" e "deixar uma
 * página onde o cliente veja os serviços bem mais prático".
 */
function falta(lead: Lead, nicho: Nicho): string {
  switch (lead.statusSite) {
    case "site-fora-do-ar":
      return "mas percebi que o site que aparece no Google está fora do ar — quem procura vocês acaba não achando nada";
    case "sem-ssl":
      return 'mas percebi que o site de vocês aparece como "não seguro" no navegador, e isso faz o cliente fechar a página';
    case "so-agregador": {
      const um = nicho.genero === "m" ? "um" : "uma";
      const proprio = nicho.genero === "m" ? "próprio" : "própria";
      return `mas percebi que vocês ainda não têm ${um} ${nicho.pagina} ${proprio}, só o link de um serviço de terceiros`;
    }
    case "so-rede-social":
      return `mas percebi que vocês ainda não têm ${nicho.falta} — hoje tudo passa pela rede social`;
    case "tem-site": {
      const artigo = nicho.genero === "m" ? "o" : "a";
      const pratico = nicho.genero === "m" ? "prático" : "prática";
      return `e percebi que dá para deixar ${artigo} ${nicho.pagina} de vocês bem mais ${pratico} para o cliente`;
    }
    default:
      return `mas percebi que vocês ainda não têm ${nicho.falta}`;
  }
}

/**
 * Transforma a `dor` do nicho (que começa sempre em "evitar ...") na parte que
 * o atendente assume. "evitar mandar a tabela de preços toda hora" vira
 * "mandar a tabela de preços toda hora".
 *
 * Duas dores do catálogo falam de COMISSÃO de plataforma, não de responder
 * mensagem — "o bot tira de vocês a parte de pagar comissão" é bobagem. Nesses
 * casos cai numa frase genérica que continua verdadeira.
 */
function tarefaDeAtendimento(nicho: Nicho): string {
  const bruta = nicho.dor.replace(/^evitar\s+/i, "");
  if (/comiss[ãa]o|plataforma/i.test(bruta)) {
    return "responder as mesmas perguntas de preço e horário o dia inteiro";
  }
  return bruta;
}

/**
 * Abordagem de chatbot.
 *
 * Nunca afirma que eles perdem cliente ou demoram para responder — isso seria
 * chute sobre a rotina de alguém que eu não conheço, e o dono percebe na hora.
 * A âncora é o que dá para VER: o volume de avaliações no Google. Quando nem
 * isso existe, a abertura fica neutra.
 */
function mensagemChatbot(lead: Lead, nome: string, nicho: Nicho): string {
  /**
   * O elogio já cita o número de avaliações quando ele existe. Repetir logo em
   * seguida saía "…(4.7 com 80 avaliações)… Com 80 avaliações, imagino…" — o
   * mesmo dado duas vezes em frases coladas. Se o número já foi dito, aqui só
   * se referencia o movimento.
   */
  const numeroJaCitado = lead.nota != null && (lead.avaliacoes ?? 0) >= 10;
  const movimento = numeroJaCitado
    ? `Com esse movimento todo, imagino que chegue bastante mensagem no WhatsApp de vocês`
    : (lead.avaliacoes ?? 0) >= 25
      ? `Com ${lead.avaliacoes} avaliações no Google, imagino que chegue bastante mensagem no WhatsApp de vocês`
      : `Imagino que boa parte do contato de vocês chegue pelo WhatsApp`;

  /**
   * A tarefa vem POR ÚLTIMO na frase de propósito. No meio, ela colava no
   * "e chama vocês" e virava uma oração ambígua: "…em cada conversa e chama
   * vocês…". Frase longa no fim resolve sem precisar de vírgula estranha.
   */
  return [
    // Mesma abertura das outras duas abordagens. Ver lib/saudacao.ts.
    aberturaSaudacao(lead),
    ``,
    `${elogio(lead, nome)}. ${movimento}.`,
    ``,
    `Sou desenvolvedor e montei um atendente de WhatsApp com IA para ${categoriaPlural(lead.categoria)}: ele responde na hora, chama vocês quando o assunto precisa de gente e assume a parte de ${tarefaDeAtendimento(nicho)}.`,
    ``,
    `Posso te mostrar funcionando em 30 segundos?`,
  ].join("\n");
}

export function montarProposta(lead: Lead, temPrevia = false): Proposta {
  const nome = nomeCurto(lead.nome);
  const { servico, produto } = avaliar(lead);
  const nicho = nichoDe(lead.categoria);

  // Quem já tem site não quer ouvir sobre site. A conversa dele é atendimento.
  if (produto === "chatbot") {
    return {
      problema: problemaDe(lead, produto),
      servico,
      mensagem: mensagemChatbot(lead, nome, nicho),
    };
  }

  const fechamento = temPrevia
    ? "Posso te enviar o link para vocês darem uma olhada em 30 segundos?"
    : "Posso te enviar o link para vocês darem uma olhada em 30 segundos?";

  /**
   * No pacote (site + chatbot) a mensagem PUXA PELO SITE e cita o atendente em
   * uma linha só, entre parênteses. Oferecer as duas coisas com o mesmo peso
   * numa abordagem fria dilui — o dono acaba não decidindo sobre nenhuma. A
   * falta do site é o que ele reconhece na hora; o chatbot entra na conversa.
   */
  const extraChatbot =
    produto === "site-e-chatbot"
      ? [
          ``,
          `(Também deixo o WhatsApp de vocês respondendo sozinho, mas isso a gente vê depois.)`,
        ]
      : [];

  const mensagem = [
    aberturaSaudacao(lead),
    ``,
    `${elogio(lead, nome)}, ${falta(lead, nicho)}.`,
    ``,
    `Sou desenvolvedor e montei um modelo de ${nicho.pagina} para ${categoriaPlural(lead.categoria)}, justamente para ${nicho.dor}.`,
    ``,
    fechamento,
    ...extraChatbot,
  ].join("\n");

  return { problema: problemaDe(lead), servico, mensagem };
}

/** Link do WhatsApp já com a mensagem embutida. */
export function linkWhatsappComMensagem(lead: Lead, mensagem: string): string | null {
  if (!lead.whatsapp) return null;
  const numero = lead.whatsapp.match(/wa\.me\/(\d+)/)?.[1];
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
