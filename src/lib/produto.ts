import type { Lead } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { SEM_SITE, A_VERIFICAR } from "@/lib/places/audit";

/**
 * QUAL produto oferecer para este lead.
 *
 * Antes o sistema vendia uma coisa só: site. Isso jogava fora metade da base —
 * quem já tem site funcionando virava "média oportunidade" e nunca era
 * abordado. Só que um negócio com site bom e 200 avaliações no Google é
 * péssimo lead de site e ótimo lead de chatbot: o problema dele não é
 * aparecer, é dar conta de responder.
 *
 * REGRA DURA: chatbot só entra se o lead tem WhatsApp.
 * O produto roda no WhatsApp. Sem número, não existe o que vender, e prometer
 * assim mesmo é vender fumaça. Isso fica no código, não no texto da mensagem,
 * porque texto a gente esquece de conferir.
 *
 * Os sinais abaixo são todos VERIFICÁVEIS — vêm do que o OSM e o Google
 * publicaram. Nada de supor "vocês devem perder cliente de madrugada": isso é
 * chute e o dono percebe.
 */

export type Produto = "site" | "chatbot" | "site-e-chatbot";

export type Oferta = {
  produto: Produto;
  /** Nome curto pra etiqueta na tela. */
  rotulo: string;
  /** Frase completa do que oferecer. */
  servico: string;
  /** Por que ESTE produto para ESTE lead. */
  motivo: string;
  /** Sinais que sustentam a oferta de chatbot, para mostrar na tela do lead. */
  sinaisChatbot: string[];
};

/** A partir daqui o volume de gente passando pelo negócio é fato, não palpite. */
const AVALIACOES_MOVIMENTO = 25;

function precisaDeSite(lead: Lead): boolean {
  return (
    SEM_SITE.includes(lead.statusSite) ||
    A_VERIFICAR.includes(lead.statusSite) ||
    lead.statusSite === "sem-ssl"
  );
}

/**
 * O que sustenta a conversa de chatbot. Cada item é uma coisa que dá pra
 * apontar na tela do Google, não uma suposição sobre a rotina deles.
 */
function sinaisDeAtendimento(lead: Lead): string[] {
  const sinais: string[] = [];

  if ((lead.avaliacoes ?? 0) >= AVALIACOES_MOVIMENTO) {
    sinais.push(`${lead.avaliacoes} avaliações no Google — passa muita gente`);
  }
  if (lead.horarios) {
    sinais.push("Horário fixo publicado — fora dele ninguém responde");
  }
  if (lead.instagram) {
    sinais.push("Instagram ativo — mais um canal chegando mensagem");
  }

  return sinais;
}

export function escolherProduto(lead: Lead): Oferta {
  const ramo = categoriaSingular(lead.categoria);
  const faltaSite = precisaDeSite(lead);
  const sinaisChatbot = sinaisDeAtendimento(lead);

  // Sem WhatsApp não há chatbot possível. Cai no caminho de site, sempre.
  const podeChatbot = Boolean(lead.whatsapp) && sinaisChatbot.length >= 1;

  const servicoDeSite = (() => {
    switch (lead.statusSite) {
      case "site-fora-do-ar":
        return `Novo site para ${ramo} (o atual está fora do ar)`;
      case "sem-ssl":
        return `Site seguro para ${ramo} (o atual não tem HTTPS)`;
      case "so-rede-social":
        return `Site profissional para ${ramo} (hoje só tem rede social)`;
      case "so-agregador":
        return `Site próprio para ${ramo} (hoje depende de um agregador)`;
      case "tem-site":
        return `Redesign do site de ${ramo}`;
      default:
        return `Site profissional para ${ramo}`;
    }
  })();

  const servicoDeChatbot = `Atendente de WhatsApp com IA para ${ramo}`;

  // Falta site E o atendimento já tem volume: o pacote é a oferta certa.
  if (faltaSite && podeChatbot && sinaisChatbot.length >= 2) {
    return {
      produto: "site-e-chatbot",
      rotulo: "Site + chatbot",
      servico: `Site e atendente de WhatsApp com IA para ${ramo}`,
      motivo: "Não tem site e já recebe movimento — dá para vender os dois juntos",
      sinaisChatbot,
    };
  }

  if (faltaSite) {
    return {
      produto: "site",
      rotulo: "Site",
      servico: servicoDeSite,
      motivo: "O problema aqui é não ter presença própria na internet",
      sinaisChatbot,
    };
  }

  // Já tem site. Se dá para rodar chatbot, é essa a conversa.
  if (podeChatbot) {
    return {
      produto: "chatbot",
      rotulo: "Chatbot com IA",
      servico: servicoDeChatbot,
      motivo: "Já tem site — o gargalo dele é responder, não aparecer",
      sinaisChatbot,
    };
  }

  return {
    produto: "site",
    rotulo: "Site",
    servico: servicoDeSite,
    motivo: lead.whatsapp
      ? "Já tem site e não achamos sinal de volume de atendimento"
      : "Sem WhatsApp cadastrado, chatbot não se aplica",
    sinaisChatbot,
  };
}

/** Etiquetas curtas para filtro e badge. */
export const PRODUTOS: { valor: Produto; rotulo: string }[] = [
  { valor: "site", rotulo: "Site" },
  { valor: "chatbot", rotulo: "Chatbot com IA" },
  { valor: "site-e-chatbot", rotulo: "Site + chatbot" },
];
