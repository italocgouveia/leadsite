import type { Lead } from "@/lib/db/schema";
import { validarTelefone, telefoneDoLead, dddCompativel } from "@/lib/telefone";
import { avaliarSistema } from "@/lib/sistemas";
import { SEM_SITE, ehPlataformaCompartilhada } from "@/lib/places/audit";
import { classificarPorte, ehCategoriaDeGrandePorte } from "@/lib/porte";

/**
 * POR QUAL CANAL dá para falar com esta empresa — e o que isso permite fazer.
 *
 * A distinção que organiza o CRM inteiro:
 *
 *   WHATSAPP   canal AUTOMÁTICO. Alimenta campanha, gera mensagem, envia pela
 *              Bridge. Exige celular plausível, porque fixo não recebe disparo.
 *   INSTAGRAM  canal MANUAL. Nunca dispara nada; é uma lista para a pessoa
 *              abrir e abordar à mão enquanto o WhatsApp roda sozinho.
 *
 * Os dois NUNCA se misturam. Um lead só de Instagram não pode entrar numa
 * campanha, e marcar "abordado no Instagram" não pode mexer no funil de
 * WhatsApp — são pipelines paralelos sobre o mesmo cadastro.
 *
 * Medido na base de 1.057 leads: 138 com celular, 47 com Instagram, 33 com os
 * dois, e 905 sem canal nenhum. Esses 905 são o motivo deste arquivo existir:
 * uma tela que anuncia "1.057 leads" quando 127 são abordáveis não está
 * informando, está enganando.
 */

export type Canal = "ambos" | "whatsapp" | "instagram" | "site" | "sem-canal";

export const ROTULO_CANAL: Record<Canal, string> = {
  ambos: "🔥 WhatsApp + Instagram",
  whatsapp: "📱 WhatsApp",
  instagram: "📸 Instagram",
  site: "🌐 Só site — enriquecer",
  "sem-canal": "❌ Sem canal",
};

/** O status da abordagem MANUAL por Instagram. Independente do funil. */
export const STATUS_INSTAGRAM = [
  "nao-abordado",
  "abordado",
  "respondeu",
  "sem-interesse",
  "cliente",
] as const;
export type StatusInstagram = (typeof STATUS_INSTAGRAM)[number];

export const ROTULO_STATUS_INSTAGRAM: Record<StatusInstagram, string> = {
  "nao-abordado": "Não abordado",
  abordado: "Abordado",
  respondeu: "Respondeu",
  "sem-interesse": "Sem interesse",
  cliente: "Cliente",
};

/**
 * Caminhos do Instagram que NÃO são perfil.
 *
 * Encontrado na base: `instagram.com/p/CXPE90aJ1e4/` gravado como se fosse o
 * perfil de uma empresa. É o link de um POST — abrir isso para prospectar leva
 * a uma foto, não ao negócio. Reels, stories e páginas internas do produto
 * caem no mesmo caso.
 */
export const NAO_E_PERFIL = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct",
  "about", "developer", "legal", "privacy", "terms", "help", "web",
]);

export type PerfilInstagram = { username: string; url: string };

/**
 * O @ do perfil comercial do lead, quando existe um utilizável.
 *
 * Devolve `null` sempre que não dá para afirmar que aquilo é um perfil — e
 * essa recusa é o ponto: um link quebrado numa fila de prospecção manual
 * custa o tempo de alguém abrindo a aba para nada.
 */
export function instagramDoLead(lead: Pick<Lead, "instagram">): PerfilInstagram | null {
  const bruto = lead.instagram?.trim();
  if (!bruto) return null;

  // Aceita tanto URL quanto "@empresa" digitado à mão.
  const semArroba = bruto.replace(/^@/, "");
  let caminho: string;
  try {
    const url = new URL(semArroba.startsWith("http") ? semArroba : `https://instagram.com/${semArroba}`);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
    caminho = url.pathname;
  } catch {
    return null;
  }

  const [primeiro] = caminho.split("/").filter(Boolean);
  if (!primeiro) return null;
  if (NAO_E_PERFIL.has(primeiro.toLowerCase())) return null;

  /**
   * Regra de username do Instagram: letras, números, ponto e underline, até 30
   * caracteres. Qualquer coisa fora disso não é um @ — é lixo de parsing.
   */
  const username = primeiro.toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return null;

  return { username, url: `https://instagram.com/${username}` };
}

/**
 * O lead tem celular plausível para receber disparo?
 *
 * "Plausível", não "confirmado": o formato indica que o número é de celular, e
 * celular é onde o WhatsApp costuma estar. Quem confirma a conta é o envio.
 *
 * O DDD é conferido contra a UF do lead quando ela existe — um número com DDD
 * de outro estado num negócio de bairro quase sempre é telefone de terceiro
 * (contador, agência, matriz), e mandar mensagem para ele é abordar a empresa
 * errada.
 */
export function temCelularPlausivel(lead: Lead): boolean {
  const tel = validarTelefone(telefoneDoLead(lead));
  if (!tel || tel.tipo !== "celular") return false;
  return dddCompativel(tel.formatado, lead.estado);
}

/**
 * A empresa tem SITE PRÓPRIO — e isso é um canal, ainda que fraco.
 *
 * Fraco porque site não é endereço de conversa: ninguém vende por formulário
 * de contato. O que ele dá é um CAMINHO até o canal — a home publica o wa.me,
 * o @ do Instagram ou o telefone do rodapé. Por isso o site entra como canal
 * de ENRIQUECIMENTO, nunca de disparo.
 *
 * `SEM_SITE` cobre o caso que já custou caro nesta base: Instagram, Linktree,
 * iFood e wa.me gravados na coluna `website`. Nada disso é site próprio, e
 * contar como tal inflaria o canal com links que já são outro canal.
 *
 * Duas checagens, e as duas são necessárias.
 *
 * `SEM_SITE` cobre o que a auditoria JÁ CONFERIU e classificou como rede
 * social ou agregador. Mas 1.108 leads estão em `nao-verificado`, e nesses a
 * auditoria não tem opinião — um `instagram.com/oficina` gravado na coluna
 * `website` passaria como site próprio só porque ninguém o conferiu ainda.
 *
 * Por isso o endereço também é olhado direto: `ehPlataformaCompartilhada`
 * reconhece o host sem depender de auditoria nenhuma. Link de rede social já é
 * OUTRO canal; contá-lo como site inflaria a fila de enriquecimento com quem
 * já tem por onde ser abordado.
 */
export function temSiteProprio(lead: Pick<Lead, "website" | "statusSite">): boolean {
  if (!lead.website) return false;
  if (ehPlataformaCompartilhada(lead.website)) return false;
  return !SEM_SITE.includes(lead.statusSite);
}

export function canalDoLead(lead: Lead): Canal {
  const zap = temCelularPlausivel(lead);
  const ig = Boolean(instagramDoLead(lead));
  if (zap && ig) return "ambos";
  if (zap) return "whatsapp";
  if (ig) return "instagram";
  /**
   * Site vem por último de propósito: quem já tem WhatsApp ou Instagram é
   * classificado por eles, porque são canais de conversa. O site só decide o
   * canal de quem não tem nenhum dos dois — e o que ele significa, na prática,
   * é "dá para descobrir um canal aqui", não "dá para falar hoje".
   */
  if (temSiteProprio(lead)) return "site";
  return "sem-canal";
}

// ═══════════════════════════════════ relevância comercial ═══════════════

export type Descarte =
  | "sem-canal"
  | "sem-sistema"
  | "rede-ou-grande"
  | "opt-out"
  | "encerrado"
  | null;

/**
 * Por que este lead está FORA da visão comercial — ou `null` se está dentro.
 *
 * Separado de `canalDoLead` porque são perguntas diferentes: "dá para falar
 * com ele?" e "vale a pena falar com ele?". Um lead pode ter WhatsApp e ainda
 * assim não ser oportunidade — franquia é o caso óbvio.
 *
 * Nada aqui apaga nada. O lead continua no banco com todo o histórico; ele só
 * não polui a tela de quem está escolhendo com quem falar hoje.
 */
export function motivoDeDescarte(lead: Lead): Descarte {
  if (lead.naoContatar) return "opt-out";
  if (["sem-interesse", "ja-tem-sistema", "opt-out", "contato-invalido"].includes(lead.etapa)) {
    return "encerrado";
  }
  if (classificarPorte(lead).rede || ehCategoriaDeGrandePorte(lead.categoria)) {
    return "rede-ou-grande";
  }
  /** Só site conta como sem canal AQUI: não dá para conversar com um site. */
  const c = canalDoLead(lead);
  if (c === "sem-canal" || c === "site") return "sem-canal";
  if (!avaliarSistema(lead).serve) return "sem-sistema";
  return null;
}

export const ROTULO_DESCARTE: Record<NonNullable<Descarte>, string> = {
  "sem-canal": "Sem WhatsApp e sem Instagram",
  "sem-sistema": "Nenhuma solução se encaixa no ramo",
  "rede-ou-grande": "Rede, franquia ou ramo de grande porte",
  "opt-out": "Pediu para não ser contatado",
  encerrado: "Já encerrado",
};

/**
 * ACIONÁVEL: tem canal real E existe o que vender.
 *
 * É a métrica principal do painel — a que substitui "total de leads". Um lead
 * acionável é uma empresa que dá para abordar hoje, por algum canal, com uma
 * solução concreta na mão.
 */
export function ehAcionavel(lead: Lead): boolean {
  return motivoDeDescarte(lead) === null;
}
