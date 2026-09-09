import type { Lead } from "@/lib/db/schema";
import { canalDoLead, instagramDoLead, type Canal } from "@/lib/canais";
import { classificarPorte, ehCategoriaDeGrandePorte } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { alcanceDoLead, PRACA } from "@/lib/territorio";
import { probabilidadeComercial, type Classificacao, type DorDoLead } from "@/lib/probabilidade";
import { avaliarContato, type Config, type HistoricoLead } from "@/lib/fila";

/**
 * A FONTE ÚNICA de "isto é uma oportunidade comercial?".
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A regra estava espalhada: `disparo.ts` decidia quem entra na campanha,
 * `oportunidades.ts` decidia o que a tela mostra, e `probabilidade.ts` decidia
 * a classificação. Três lugares com a mesma responsabilidade é como o painel e
 * a campanha já divergiram uma vez — a tela prometia 12 e o botão oferecia 61,
 * com 79% de telefone fixo.
 *
 * Agora existe UMA função. `/cacada`, `/disparos`, `/instagram`, o ranking e os
 * cartões chamam esta; nenhuma tela tem régua própria.
 *
 * A DISTINÇÃO QUE ORGANIZA TUDO
 *
 *   POTENCIAL DE SOLUÇÃO   existe sistema que serve para este ramo?
 *   OPORTUNIDADE COMERCIAL existe sistema E dá para falar com a empresa?
 *
 * Os dois eram tratados como a mesma coisa, e é por isso que a tela anunciava
 * "907 potencial forte" numa base onde 12 dá para abordar. Um negócio ótimo sem
 * telefone e sem Instagram não é oportunidade: é potencial aguardando canal, e
 * o lugar dele é a fila de enriquecimento, não a de trabalho.
 */

export type OportunidadeComercial = {
  /** Dá para trabalhar este lead HOJE? Canal + solução + nenhum bloqueio. */
  elegivel: boolean;
  canal: Canal | "nenhum";
  /** 0–100. Ordena; nunca decide a classificação sozinha. */
  prioridade: number;
  classificacao: Classificacao;
  /** O que se vende para ela, na linguagem do dono. `null` se nada serve. */
  sistema: string | null;
  /** Por que vale a pena — o que sustenta a oportunidade. */
  motivos: string[];
  /** O que impede de trabalhar agora. Vazio quando `elegivel`. */
  bloqueios: string[];
  /**
   * Todos os bloqueios são de ESPERA, não de qualidade.
   *
   * "Contatada há 12 dias" e "rede nacional" reprovam o lead do mesmo jeito
   * hoje, e são coisas opostas: a primeira expira sozinha, a segunda nunca.
   * Sem essa distinção a tela mostra "1 pronta" numa base onde 35 empresas
   * boas voltam à fila quando a janela de recontato fechar — e o vendedor
   * conclui que a base acabou.
   */
  bloqueioTemporario: boolean;
  /**
   * Tem solução aplicável, INDEPENDENTE de haver canal.
   *
   * É o que separa "potencial de solução" de "oportunidade comercial" — e o
   * que impede a tela de contar 907 empresas como oportunidade.
   */
  temPotencialDeSolucao: boolean;
  /** Só falta contato: potencial sim, canal não. Alvo do enriquecimento. */
  aguardandoCanal: boolean;
  /** Hipótese até o cliente falar. Ver `dorDoLead`. */
  dor: DorDoLead;
};

export type ContextoOportunidade = {
  possivelDuplicata?: boolean;
  /**
   * Mensagens do lead e configuração da fila.
   *
   * Opcionais de propósito: as travas de FUNIL (recontato, mensagem viva) só
   * podem ser avaliadas com histórico. Sem eles a função continua respondendo
   * sobre canal, solução e perfil — e diz, no bloqueio, que o funil não foi
   * conferido, em vez de fingir que está limpo.
   */
  historico?: HistoricoLead;
  cfg?: Config;
};

/** Estados que encerram o lead — não é "prioridade baixa", é porta fechada. */
const ENCERRADOS = ["sem-interesse", "ja-tem-sistema", "opt-out", "contato-invalido"];

/** Só quem ainda não foi trabalhado entra em abordagem de primeiro contato. */
const ETAPAS_ANTES_DO_CONTATO = ["novo", "analisado", "qualificado"];

export function avaliarOportunidadeComercial(
  lead: Lead,
  ctx: ContextoOportunidade = {},
): OportunidadeComercial {
  const bloqueios: string[] = [];

  const encaixe = avaliarSistema(lead);
  const canalBruto = canalDoLead(lead);
  const canal: Canal | "nenhum" = canalBruto === "sem-canal" ? "nenhum" : canalBruto;
  /**
   * Site é caminho para um canal, não um canal. Um lead que só tem site não
   * pode ser abordado hoje: ele é alvo de enriquecimento, e tratá-lo como
   * oportunidade pronta encheria a fila de empresas com quem não há como
   * falar — que é exatamente o defeito que esta função existe para evitar.
   */
  const soSite = canal === "site";
  const prob = probabilidadeComercial(lead, { possivelDuplicata: ctx.possivelDuplicata });
  const classe = classificarPorte(lead);

  // ─────────────────── 7. bloqueios ───────────────────
  if (lead.naoContatar) bloqueios.push("Pediu para não ser contatado");
  if (ENCERRADOS.includes(lead.etapa)) bloqueios.push(`Já encerrado (${lead.etapa})`);
  if (classe.rede) bloqueios.push(`Rede ou franquia: ${classe.motivosRede[0]}`);
  if (ehCategoriaDeGrandePorte(lead.categoria)) bloqueios.push("Ramo de grande porte");
  if (!encaixe.serve) bloqueios.push("Nenhuma solução da ICG Tech se encaixa no ramo");
  if (canal === "nenhum") bloqueios.push("Sem WhatsApp e sem Instagram");
  if (soSite) bloqueios.push("Só site — falta descobrir WhatsApp ou Instagram");
  if (ctx.possivelDuplicata) bloqueios.push("Possível duplicata de outro cadastro");

  // ─────────────────── 6. já foi trabalhada? ───────────────────
  if (!ETAPAS_ANTES_DO_CONTATO.includes(lead.etapa) && !ENCERRADOS.includes(lead.etapa)) {
    bloqueios.push(`Já está adiante no funil (${lead.etapa})`);
  }
  /**
   * As travas do FUNIL só se aplicam a quem entra pela porta automática.
   *
   * `avaliarContato` responde "posso mandar WhatsApp?", e entre os motivos dele
   * estão "sem WhatsApp" e "telefone fixo". Num lead só de Instagram esses dois
   * são verdadeiros e irrelevantes: ninguém vai disparar nada para ele — o
   * vendedor abre o perfil e escreve à mão. Perguntar do WhatsApp para decidir
   * o Instagram é o tipo de regra cruzada que já fez a tela e a campanha
   * divergirem antes.
   */
  const usaWhatsapp = canal === "whatsapp" || canal === "ambos";
  if (usaWhatsapp && ctx.cfg && ctx.historico) {
    const check = avaliarContato(lead, ctx.cfg, ctx.historico, { paraNovaCampanha: true });
    if (!check.pode) bloqueios.push(check.motivo.replace(/\.$/, ""));
  }

  // ─────────────────── 5. o que sustenta ───────────────────
  const motivos = prob.positivos.map((m) => m.texto);

  const temPotencialDeSolucao = encaixe.serve;
  const aguardandoCanal = temPotencialDeSolucao && (canal === "nenhum" || soSite);

  /**
   * ELEGÍVEL = tem canal, tem o que vender, e nada impede hoje.
   *
   * Note que a classificação vem de `probabilidadeComercial` e NÃO é
   * recalculada aqui: duas fórmulas para a mesma pergunta voltariam a
   * divergir. O que esta função acrescenta é o funil — recontato, mensagem
   * viva, etapa — que a função pura não tem como conhecer.
   */
  const elegivel = bloqueios.length === 0;

  /**
   * O que passa sozinho com o tempo: a janela de recontato e a mensagem que
   * ainda está na fila de envio. Nada aqui diz nada sobre a qualidade da
   * empresa — só sobre o relógio.
   */
  const ESPERA = /nos últimos \d+ dias|aguardando envio|intervalo entre envios|limite diário/i;
  const bloqueioTemporario = !elegivel && bloqueios.every((b) => ESPERA.test(b));

  return {
    elegivel,
    canal,
    prioridade: prob.pontos,
    /** Bloqueado nunca é 🔥, por mais pontos que tenha. */
    classificacao: elegivel ? prob.classificacao : "nao-prioritario",
    sistema: encaixe.serve ? encaixe.sistema : null,
    motivos,
    bloqueios,
    bloqueioTemporario,
    temPotencialDeSolucao,
    aguardandoCanal,
    dor: prob.dor,
  };
}

/**
 * Pode entrar numa campanha de WhatsApp AGORA?
 *
 * É a mesma avaliação, com a exigência extra do canal automático. Existe como
 * função nomeada para `disparo.ts` e a tela pedirem a MESMA coisa — §16: não
 * pode haver uma rota montando lista diferente de outra.
 */
export function prontoParaWhatsapp(lead: Lead, ctx: ContextoOportunidade = {}): boolean {
  const o = avaliarOportunidadeComercial(lead, ctx);
  return o.elegivel && (o.canal === "whatsapp" || o.canal === "ambos");
}

/** Pode ser abordado à mão pelo Instagram? Nunca dispara nada. */
export function prontoParaInstagram(lead: Lead, ctx: ContextoOportunidade = {}): boolean {
  const o = avaliarOportunidadeComercial(lead, ctx);
  return (
    o.elegivel && (o.canal === "instagram" || o.canal === "ambos") && Boolean(instagramDoLead(lead))
  );
}

/** As melhores: os dois canais, elegível, e vale vender. */
export function melhorOportunidade(lead: Lead, ctx: ContextoOportunidade = {}): boolean {
  const o = avaliarOportunidadeComercial(lead, ctx);
  return o.elegivel && o.canal === "ambos" && o.classificacao === "quero-vender";
}

/** A praça da operação, para a tela nomear sem repetir string. */
export const PRACA_ATUAL = `${PRACA.cidade}/${PRACA.uf}`;
export { alcanceDoLead };
