/**
 * As abordagens que dá para forçar na hora de montar uma campanha.
 *
 * Compartilhado entre /campanhas e /disparos: as duas telas deixam escolher
 * segmento + abordagem antes de mandar, então a lista de opções vive num só
 * lugar em vez de duplicada em cada página.
 */

export type Abordagem = "" | "site" | "chatbot" | "sistema";

export const OPCOES_ABORDAGEM: {
  valor: Abordagem;
  rotulo: string;
  descricao: string;
  emoji: string;
}[] = [
  {
    valor: "",
    rotulo: "Melhor oferta para cada lead",
    descricao: "A IA escolhe entre WhatsApp, site ou sistema",
    emoji: "✨",
  },
  {
    valor: "site",
    rotulo: "Site para captar clientes",
    descricao: "Para empresas sem site ou com presença digital fraca",
    emoji: "🌐",
  },
  {
    valor: "chatbot",
    rotulo: "Bot de WhatsApp",
    descricao: "Atendimento automático, dúvidas e encaminhamento para uma pessoa",
    emoji: "🤖",
  },
  {
    valor: "sistema",
    rotulo: "Sistema ou automação",
    descricao: "Organize tarefas como agenda, pedidos, estoque ou atendimento",
    emoji: "🗂️",
  },
];
