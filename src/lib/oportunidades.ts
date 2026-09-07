import { db, leads, mensagens, type Lead } from "@/lib/db";
import { avaliarContato, lerConfig } from "@/lib/fila";
import { pontuar, prioridadeComercial, type NivelPrioridade } from "@/lib/pontuacao";
import { classificarPorte, pareceNegocioLocal, ROTULO_PORTE, type Porte } from "@/lib/porte";
import { SEM_SITE } from "@/lib/places/audit";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import type { Etapa } from "@/lib/db/schema";

/**
 * A camada de INTELIGÊNCIA COMERCIAL de /disparos: quem vale a pena abordar,
 * por quê, e o que oferecer — antes de gastar uma única chamada de IA.
 *
 * POR QUE ISTO EXISTE SEPARADO DE lib/disparo.ts
 *
 * `previaFiltrada` responde "quantos cabem no disparo" e monta o texto pelo
 * motor determinístico antigo. Aqui a pergunta é outra: *destes, quais são os
 * melhores, e o que eu ofereço para cada um?* — e o texto não é problema desta
 * camada, porque quem escreve é a IA, depois, um por lead.
 *
 * A trava de elegibilidade é a MESMA (`avaliarContato` + etapa do funil). Não
 * existe versão relaxada aqui: uma tela que mostra mais leads do que a fila
 * aceita é pior que tela nenhuma — promete um lote que não sai.
 *
 * Nada neste arquivo chama IA, escreve no banco ou envia mensagem. É leitura
 * pura, e pode ser chamado a cada tecla de filtro sem custo nenhum.
 */

/** Só quem ainda não foi trabalhado entra em disparo em massa. */
const ETAPAS_ANTES_DO_CONTATO: Etapa[] = ["novo", "analisado", "qualificado"];

export type FiltroOportunidade = {
  segmento?: string;
  /** Sem WhatsApp não há disparo — ligado por padrão. */
  somenteWhatsapp?: boolean;
  /** Reabrir quem já recebeu contato. Desligado por padrão, e por bom motivo. */
  incluirContatados?: boolean;
  comInstagram?: boolean;
  site?: "qualquer" | "com" | "sem";
  notaMinima?: number;
  avaliacoesMinimas?: number;
  /** Corte por temperatura da oportunidade. */
  prioridade?: "alta" | "media" | "todas";

  // ───────── filtros de prospecção local ─────────
  /**
   * 🏪 Só negócios que se comportam como pequenos.
   *
   * Note que NÃO é filtro por porte declarado: porte é `desconhecido` para
   * quase toda a base, porque nenhuma fonte gratuita publica isso. O que este
   * filtro usa são os indícios de `lib/porte.ts`, e rede nunca passa.
   */
  somentePequenos?: boolean;
  /** 🛠 Só quem tem operação que um sistema organiza. */
  comPotencialSistema?: boolean;
  /**
   * 🌐 Só quem comprovadamente NÃO tem site próprio.
   *
   * Diferente de `site: "sem"`, que só olha a coluna vazia. Aqui vale a
   * auditoria: Instagram, Linktree, iFood e wa.me contam como "sem site", e
   * `nao-verificado` NÃO entra — ausência de tag no mapa não é prova.
   */
  semSiteConfirmado?: boolean;
  /** Gaveta comercial: 🔥 A, 🟡 B, 🔵 C. */
  nivel?: "A" | "B" | "C";
};

export type LeadOportunidade = {
  id: string;
  nome: string;
  cidade: string | null;
  categoria: string | null;
  segmento: string;
  /** Prioridade INTERNA de 0 a 100 — não é dado externo, é o nosso palpite. */
  score: number;
  emoji: string;
  classificacao: string;
  /** Só os critérios que o lead REALMENTE ganhou, para explicar o número. */
  motivos: string[];
  temWhatsapp: boolean;
  temInstagram: boolean;
  temSite: boolean;
  nota: number | null;
  avaliacoes: number | null;
  /** Palpite determinístico do sistema para o ramo. A IA pode discordar. */
  sistema: string | null;
  modulos: string[];
  dor: string | null;

  // ───────── prospecção local ─────────
  /** Gaveta comercial: A, B ou C. */
  nivel: NivelPrioridade;
  nivelEmoji: string;
  nivelPorque: string;
  /** Porte OFICIAL. `desconhecido` quase sempre — e isso é a resposta certa. */
  porte: Porte;
  porteRotulo: string;
  /** Indícios de negócio pequeno. Hipótese, não afirmação de porte. */
  sinaisPequeno: string[];
  /** É rede/franquia/corporação, e por quê. */
  rede: boolean;
  motivosRede: string[];
  /** A auditoria CONFIRMA que não há site próprio? */
  semSiteConfirmado: boolean;
  /** Site não conferido — nem "tem" nem "não tem". */
  siteNaoVerificado: boolean;
};

export type SegmentoResumo = {
  nome: string;
  total: number;
  comWhatsapp: number;
  elegiveis: number;
  /** Dica de solução do catálogo — o que este ramo costuma comprar. */
  solucao: string | null;
};

export type ResultadoOportunidades = {
  /** Todos os leads do filtro, elegíveis ou não. */
  encontrados: number;
  elegiveis: number;
  excluidos: number;
  /** Por que os excluídos ficaram de fora, agrupado e ordenado. */
  recusas: { motivo: string; quantidade: number }[];
  segmentos: SegmentoResumo[];
  /** Os melhores primeiro, já cortados no teto pedido. */
  leads: LeadOportunidade[];
  /**
   * Números do topo da tela, da base inteira — não do filtro.
   *
   * `semSiteConfirmado` e `siteNaoVerificado` são contados separados de
   * propósito. Somar os dois num "sem site" único inflaria o número com leads
   * que ninguém conferiu, e a tela passaria a prometer uma lacuna que talvez
   * não exista — que é exatamente o erro que este painel existe para não
   * cometer.
   */
  totais: {
    leads: number;
    comWhatsapp: number;
    elegiveis: number;
    pequenos: number;
    comPotencialSistema: number;
    semSiteConfirmado: number;
    siteNaoVerificado: number;
    prioridadeA: number;
    prioridadeB: number;
    prioridadeC: number;
  };
};

const LIMITE_LEADS = 200;

/** A auditoria CONFIRMOU ausência de site próprio? `nao-verificado` não conta. */
function semSiteConfirmado(lead: Lead): boolean {
  return SEM_SITE.includes(lead.statusSite);
}

function passaNosFiltros(lead: Lead, f: FiltroOportunidade): boolean {
  if (f.segmento && categoriaSingular(lead.categoria) !== f.segmento) return false;
  if (f.somenteWhatsapp !== false && !lead.whatsapp) return false;
  if (f.comInstagram && !lead.instagram) return false;
  if (f.site === "com" && !lead.website) return false;
  if (f.site === "sem" && lead.website) return false;
  if (f.notaMinima != null && (lead.nota ?? 0) < f.notaMinima) return false;
  if (f.avaliacoesMinimas != null && (lead.avaliacoes ?? 0) < f.avaliacoesMinimas) return false;

  if (f.somentePequenos && !pareceNegocioLocal(lead)) return false;
  if (f.comPotencialSistema && !avaliarSistema(lead).serve) return false;
  if (f.semSiteConfirmado && !semSiteConfirmado(lead)) return false;
  if (f.nivel && prioridadeComercial(lead).nivel !== f.nivel) return false;
  return true;
}

/**
 * Monta o painel de oportunidades para um filtro.
 *
 * Devolve TRÊS coisas de uma vez porque a tela precisa das três juntas para
 * não mentir: quantos existem, quantos podem receber mensagem hoje, e por que
 * os outros não podem. Mostrar só o primeiro número é o que fazia a tela
 * prometer 300 leads e entregar 9.
 */
export async function oportunidades(
  filtro: FiltroOportunidade = {},
  quantidade = 50,
): Promise<ResultadoOportunidades> {
  const cfg = await lerConfig();

  const [base, historico] = await Promise.all([
    db.select().from(leads),
    db
      .select({
        id: mensagens.id,
        leadId: mensagens.leadId,
        status: mensagens.status,
        enviadaEm: mensagens.enviadaEm,
      })
      .from(mensagens),
  ]);

  const porLead = new Map<string, { id: string; status: string; enviadaEm: Date | null }[]>();
  for (const m of historico) {
    const atual = porLead.get(m.leadId);
    if (atual) atual.push(m);
    else porLead.set(m.leadId, [m]);
  }

  /** Mesma pergunta que a fila fará depois. Nunca uma versão mais frouxa. */
  const elegivel = (lead: Lead): { pode: true } | { pode: false; motivo: string } => {
    if (!lead.whatsapp) return { pode: false, motivo: "Sem WhatsApp cadastrado" };
    if (!ETAPAS_ANTES_DO_CONTATO.includes(lead.etapa)) {
      return { pode: false, motivo: "Já está adiante no funil" };
    }
    /**
     * `paraNovaCampanha`: esta tela decide quem ENTRA numa campanha nova, e
     * essa pergunta e mais estrita que "posso enviar agora" — telefone fixo e
     * rascunho pendente contam aqui e nao contam no envio.
     */
    const check = avaliarContato(lead, cfg, porLead.get(lead.id) ?? [], {
      paraNovaCampanha: true,
    });
    return check.pode ? { pode: true } : { pode: false, motivo: check.motivo };
  };

  // ---------- números do topo: a base inteira, sem filtro nenhum ----------
  const niveis = base.map((l) => prioridadeComercial(l).nivel);
  const totais = {
    leads: base.length,
    comWhatsapp: base.filter((l) => l.whatsapp).length,
    elegiveis: base.filter((l) => elegivel(l).pode).length,
    pequenos: base.filter(pareceNegocioLocal).length,
    comPotencialSistema: base.filter((l) => avaliarSistema(l).serve).length,
    semSiteConfirmado: base.filter(semSiteConfirmado).length,
    siteNaoVerificado: base.filter((l) => l.statusSite === "nao-verificado").length,
    prioridadeA: niveis.filter((n) => n === "A").length,
    prioridadeB: niveis.filter((n) => n === "B").length,
    prioridadeC: niveis.filter((n) => n === "C").length,
  };

  // ---------- cards de nicho: contagem real por segmento ----------
  const porSegmento = new Map<string, { total: number; wpp: number; ok: number; lead: Lead }>();
  for (const lead of base) {
    const seg = categoriaSingular(lead.categoria);
    const atual = porSegmento.get(seg) ?? { total: 0, wpp: 0, ok: 0, lead };
    atual.total++;
    if (lead.whatsapp) atual.wpp++;
    if (elegivel(lead).pode) atual.ok++;
    porSegmento.set(seg, atual);
  }

  const segmentos: SegmentoResumo[] = [...porSegmento.entries()]
    .map(([nome, v]) => {
      const encaixe = avaliarSistema(v.lead);
      return {
        nome,
        total: v.total,
        comWhatsapp: v.wpp,
        elegiveis: v.ok,
        solucao: encaixe.serve ? encaixe.sistema : null,
      };
    })
    .sort((a, b) => b.elegiveis - a.elegiveis || b.total - a.total);

  // ---------- o filtro em si ----------
  const doFiltro = base.filter((l) => passaNosFiltros(l, filtro));
  const contagemRecusa = new Map<string, number>();
  const aptos: Lead[] = [];

  for (const lead of doFiltro) {
    const check = elegivel(lead);
    if (check.pode || filtro.incluirContatados) {
      aptos.push(lead);
      continue;
    }
    contagemRecusa.set(check.motivo, (contagemRecusa.get(check.motivo) ?? 0) + 1);
  }

  /**
   * A ordem da tela: gaveta primeiro, score dentro dela.
   *
   * Ordenar só por score deixaria um lead C de score 71 na frente de um A de
   * 68 — e A/B/C responde a pergunta que score nenhum responde: dá para falar
   * com esse negócio hoje e existe sistema para vender a ele? Quem abre o
   * painel quer trabalhar a lista de cima para baixo, e é a gaveta que garante
   * que os primeiros são realmente trabalháveis.
   */
  const ORDEM: Record<NivelPrioridade, number> = { A: 0, B: 1, C: 2 };
  const comScore = aptos
    .map((lead) => ({ lead, p: pontuar(lead), nivel: prioridadeComercial(lead) }))
    .filter(({ p }) => {
      if (filtro.prioridade === "alta") return p.total >= 70;
      if (filtro.prioridade === "media") return p.total >= 45;
      return true;
    })
    .sort(
      (a, b) => ORDEM[a.nivel.nivel] - ORDEM[b.nivel.nivel] || b.p.total - a.p.total,
    );

  const escolhidos = comScore.slice(0, Math.min(quantidade, LIMITE_LEADS));

  return {
    encontrados: doFiltro.length,
    elegiveis: comScore.length,
    excluidos: doFiltro.length - comScore.length,
    recusas: [...contagemRecusa.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    segmentos,
    totais,
    leads: escolhidos.map(({ lead, p, nivel }) => {
      const encaixe = avaliarSistema(lead);
      const classe = classificarPorte(lead);
      return {
        id: lead.id,
        nome: lead.nome,
        cidade: lead.cidade,
        categoria: lead.categoria,
        segmento: categoriaSingular(lead.categoria),
        score: p.total,
        emoji: p.emoji,
        classificacao: p.rotulo,
        // Só o que ele ganhou de fato: listar critério perdido vira ruído.
        motivos: p.criterios.filter((c) => c.ganhou).map((c) => c.rotulo),
        temWhatsapp: Boolean(lead.whatsapp),
        temInstagram: Boolean(lead.instagram),
        temSite: Boolean(lead.website),
        nota: lead.nota,
        avaliacoes: lead.avaliacoes,
        sistema: encaixe.serve ? encaixe.sistema : null,
        modulos: encaixe.serve ? encaixe.modulos : [],
        dor: encaixe.serve ? encaixe.dor : null,

        nivel: nivel.nivel,
        nivelEmoji: nivel.emoji,
        nivelPorque: nivel.porque,
        porte: classe.porte,
        porteRotulo: ROTULO_PORTE[classe.porte],
        sinaisPequeno: classe.sinais,
        rede: classe.rede,
        motivosRede: classe.motivosRede,
        semSiteConfirmado: semSiteConfirmado(lead),
        siteNaoVerificado: lead.statusSite === "nao-verificado",
      };
    }),
  };
}
