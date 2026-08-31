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
    rotulo: "Automático",
    descricao: "Decide sozinho pelo que cada lead precisa",
    emoji: "✨",
  },
  { valor: "site", rotulo: "Site", descricao: "Página institucional para quem não tem", emoji: "🌐" },
  {
    valor: "chatbot",
    rotulo: "Chatbot",
    descricao: "Atendente de WhatsApp com IA",
    emoji: "🤖",
  },
  {
    valor: "sistema",
    rotulo: "Sistema",
    descricao: "Gestão sob medida: agenda, estoque, ordem de serviço",
    emoji: "🗂️",
  },
];
