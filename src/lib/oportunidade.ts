import type { Lead, StatusSite } from "@/lib/db/schema";
import { escolherProduto, type Oferta, type Produto } from "@/lib/produto";

/**
 * Traduz o score numérico em algo que responde a única pergunta que importa
 * na hora da prospecção: "vale a pena chamar essa empresa agora?".
 *
 * O score de 0 a 100 continua existindo no banco e ordena as listas, mas não
 * aparece mais na tela: número solto não ajuda a decidir. Três níveis e uma
 * frase explicando o porquê resolvem em dois segundos.
 */

export type Nivel = "alta" | "boa" | "media";

export type Oportunidade = {
  nivel: Nivel;
  rotulo: string;
  /** Frase curta: "Sem site + WhatsApp + boa avaliação" */
  resumo: string;
  /** Lista para a página do lead, cada item com sinal de bom ou ruim. */
  motivos: { texto: string; bom: boolean }[];
  /** Serviço que faz sentido oferecer para este caso. */
  servico: string;
  /** Qual produto vender: site, chatbot ou os dois. */
  produto: Produto;
  /** A decisão completa de produto, com motivo e sinais. */
  oferta: Oferta;
};

const PRECISA_SITE: StatusSite[] = [
  "sem-site",
  "nao-verificado",
  "so-rede-social",
  "so-agregador",
  "site-fora-do-ar",
];

export function avaliar(lead: Lead): Oportunidade {
  const motivos: { texto: string; bom: boolean }[] = [];
  const oferta = escolherProduto(lead);

  /**
   * Quando a venda é chatbot, os sinais de atendimento (movimento, horário,
   * Instagram) entram com a leitura de chatbot mais adiante. Aqui eles são
   * suprimidos para a lista não repetir o mesmo fato com duas frases —
   * "Instagram ativo" logo acima de "Instagram ativo — mais um canal".
   */
  const vendeChatbot = oferta.produto !== "site";

  // --- presença online (o motivo da venda) ---
  const precisaSite = PRECISA_SITE.includes(lead.statusSite);
  switch (lead.statusSite) {
    case "sem-site":
      motivos.push({ texto: "Não tem site próprio", bom: false });
      break;
    case "nao-verificado":
      motivos.push({ texto: "Não encontramos site — confirme antes de abordar", bom: false });
      break;
    case "so-rede-social":
      motivos.push({ texto: "Só tem rede social, sem site", bom: false });
      break;
    case "so-agregador":
      motivos.push({ texto: "Depende de agregador (Linktree, iFood, etc.)", bom: false });
      break;
    case "site-fora-do-ar":
      motivos.push({ texto: "O site cadastrado está fora do ar", bom: false });
      break;
    case "sem-ssl":
      motivos.push({ texto: "Site sem HTTPS — navegador marca como inseguro", bom: false });
      break;
    case "tem-site":
      motivos.push({ texto: "Já tem site funcionando", bom: true });
      break;
  }

  // --- canais de contato (sem isso não há abordagem) ---
  if (lead.whatsapp) motivos.push({ texto: "WhatsApp disponível", bom: true });
  else if (lead.telefone) motivos.push({ texto: "Telefone disponível", bom: true });
  else motivos.push({ texto: "Sem telefone — só dá para abordar presencialmente", bom: false });

  if (lead.instagram && !vendeChatbot)
    motivos.push({ texto: "Instagram ativo", bom: true });

  // --- sinais de que o negócio está vivo ---
  if (lead.nota != null && lead.nota >= 4.3) {
    motivos.push({
      texto: `Boa avaliação no Google (${lead.nota}${lead.avaliacoes ? ` · ${lead.avaliacoes} avaliações` : ""})`,
      bom: true,
    });
  }
  if ((lead.avaliacoes ?? 0) >= 40 && !vendeChatbot) {
    motivos.push({ texto: "Movimento alto — muita gente avaliando", bom: true });
  }
  if (lead.horarios && !vendeChatbot)
    motivos.push({ texto: "Horário de funcionamento publicado", bom: true });
  if (lead.endereco) motivos.push({ texto: "Endereço confirmado", bom: true });

  // --- o que dá pra vender ---
  if (vendeChatbot) {
    for (const sinal of oferta.sinaisChatbot) {
      motivos.push({ texto: sinal, bom: true });
    }
  }

  // --- nível ---
  const temContato = Boolean(lead.whatsapp || lead.telefone || lead.instagram);
  let nivel: Nivel;
  if (!temContato) nivel = "media";
  else if (precisaSite && lead.score >= 60) nivel = "alta";
  else if (oferta.produto === "site-e-chatbot") nivel = "alta";
  else if (precisaSite) nivel = "boa";
  /**
   * Quem já tem site parava aqui como "média" e sumia das melhores
   * oportunidades. Com chatbot no catálogo isso passou a ser desperdício:
   * site pronto + movimento comprovado é o melhor lead de chatbot que existe.
   */
  else if (oferta.produto === "chatbot") {
    nivel = oferta.sinaisChatbot.length >= 2 ? "alta" : "boa";
  } else nivel = "media";

  // --- resumo em uma linha ---
  const partes: string[] = [];
  if (lead.statusSite === "sem-site" || lead.statusSite === "nao-verificado")
    partes.push("sem site");
  else if (lead.statusSite === "so-rede-social") partes.push("só Instagram");
  else if (lead.statusSite === "so-agregador") partes.push("só agregador");
  else if (lead.statusSite === "site-fora-do-ar") partes.push("site fora do ar");
  else if (lead.statusSite === "sem-ssl") partes.push("site inseguro");
  else if (oferta.produto === "chatbot") partes.push("site pronto");
  else partes.push("já tem site");

  if (lead.whatsapp) partes.push("WhatsApp");
  // "só Instagram" já disse tudo — repetir vira "Só Instagram + Instagram ativo".
  if (lead.instagram && lead.statusSite !== "so-rede-social")
    partes.push("Instagram ativo");
  if (lead.nota != null && lead.nota >= 4.3) partes.push("boa avaliação");
  if (vendeChatbot && (lead.avaliacoes ?? 0) >= 25) partes.push("muito movimento");
  if (!temContato) partes.push("sem contato");

  const rotulo =
    nivel === "alta"
      ? "Alta oportunidade"
      : nivel === "boa"
        ? "Boa oportunidade"
        : "Média oportunidade";

  const resumo = partes.join(" + ").replace(/^./, (c) => c.toUpperCase());

  return {
    nivel,
    rotulo,
    resumo,
    motivos,
    servico: oferta.servico,
    produto: oferta.produto,
    oferta,
  };
}

/** Só quem dá pra abordar hoje entra nas "melhores oportunidades". */
export function ehOportunidade(lead: Lead): boolean {
  const o = avaliar(lead);
  return o.nivel === "alta" || o.nivel === "boa";
}
