import { eq } from "drizzle-orm";
import { db, leads, mensagens, conversas, type Lead } from "@/lib/db";
import { avaliarContato, lerConfig } from "@/lib/fila";
import {
  pontuar,
  prioridadeComercial,
  scores,
  type NivelPrioridade,
  type ContextoLead,
} from "@/lib/pontuacao";
import {
  classificarPorte,
  pareceNegocioLocal,
  ROTULO_PORTE,
  ROTULO_PORTE_ESTIMADO,
  type Porte,
  type PorteEstimado,
} from "@/lib/porte";
import { deduplicar } from "@/lib/dedup";
import { alcanceDoLead, ehAlcancavel, ROTULO_ALCANCE, PRACA, type Alcance } from "@/lib/territorio";
import {
  probabilidadeComercial,
  ROTULO_CLASSIFICACAO,
  ORDEM_CLASSIFICACAO,
  type Classificacao,
  type Motivo,
  type DorDoLead,
} from "@/lib/probabilidade";
import {
  canalDoLead,
  instagramDoLead,
  motivoDeDescarte,
  ehAcionavel,
  ROTULO_CANAL,
  ROTULO_DESCARTE,
  type Canal,
  type Descarte,
} from "@/lib/canais";
import {
  precisaEnriquecer,
  motivoDaGaveta,
  estadoDoContato,
  ROTULO_CONTATO,
  ROTULO_MOTIVO,
  type MotivoGaveta,
  type EstadoContato,
} from "@/lib/enriquecimento";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";
import { SEM_SITE } from "@/lib/places/audit";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import { nichoPrioritario } from "@/lib/nichos-locais";
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
  /** Gaveta comercial: 🔥 A, 🟡 B, 🔵 C, ⚪ D. */
  nivel?: "A" | "B" | "C" | "D";
  /** ✅ Só quem passa em TODAS as travas de "pronto para prospecção". */
  prontosParaProspeccao?: boolean;
  /** 🛠 Encaixe forte: o sistema encosta em 4 ou mais processos. */
  potencialForte?: boolean;
  /** 🚫 Nunca recebeu mensagem nossa. */
  naoContatado?: boolean;
  /** 📍 Só quem está na praça ou na região do DDD. */
  somenteNaPraca?: boolean;
  /** 🔥 Só "quero vender" · 🟡 "vale abordar" · ⚪ "não prioritário". */
  decisao?: Classificacao;

  /**
   * A FILA comercial. É o filtro principal da tela nova.
   *
   *   whatsapp   pode entrar em campanha automática
   *   instagram  abordagem manual (com ou sem WhatsApp)
   *   ambos      as melhores oportunidades
   *   acionaveis qualquer canal + o que vender
   */
  fila?: "whatsapp" | "instagram" | "ambos" | "acionaveis";
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
  /** Gaveta comercial: A, B, C ou D. */
  nivel: NivelPrioridade;
  nivelEmoji: string;
  nivelPorque: string;
  /** Porte OFICIAL. `desconhecido` quase sempre — e isso é a resposta certa. */
  porte: Porte;
  porteRotulo: string;
  /** Palpite de tamanho por indício. NUNCA confundir com `porte`. */
  porteEstimado: PorteEstimado;
  porteEstimadoRotulo: string;
  /** As evidências que sustentam o palpite de porte. */
  evidenciasPorte: string[];
  /** Indícios de negócio pequeno. Hipótese, não afirmação de porte. */
  sinaisPequeno: string[];
  /** É rede/franquia/corporação, e por quê. */
  rede: boolean;
  motivosRede: string[];
  /** A auditoria CONFIRMA que não há site próprio? */
  semSiteConfirmado: boolean;
  /** Site não conferido — nem "tem" nem "não tem". */
  siteNaoVerificado: boolean;
  /** Prioridade comercial do RAMO (A/B/C), quando ele está na lista. */
  prioridadeNicho: "A" | "B" | "C" | null;
  /** Passa em todas as travas para entrar numa campanha hoje. */
  prontoParaProspeccao: boolean;
  /** Outro cadastro da base aparenta ser o mesmo lugar. */
  possivelDuplicata: boolean;
  /**
   * Os critérios que somaram ponto, com o valor — é a resposta a "por que
   * este lead está no topo?" sem ninguém precisar reler o código do score.
   */
  porQue: { criterio: string; pontos: number; base: string }[];
  /** 📞 telefone · 📱 possível celular · 🟢 WhatsApp confirmado · 🔎 sem contato */
  contato: EstadoContato;
  contatoRotulo: string;
  /** Entra na fila de enriquecimento? E com que prioridade? */
  precisaEnriquecer: boolean;
  enriquecimentoPrioridade: "alta" | "media" | "baixa" | null;
  enriquecimentoMotivo: string;
  /** A gaveta que este lead alcançaria SE tivesse celular. */
  qualidadePotencial: NivelPrioridade;
  /** De onde veio o telefone, quando veio de enriquecimento. */
  telefoneOrigem: string | null;
  /** 📍 na praça · 🛣 região do DDD · ✈ fora. Ver lib/territorio. */
  alcance: Alcance;
  alcanceRotulo: string;
  /**
   * 🔥/🟡/⚪ — a decisão de agenda. Ver lib/probabilidade.
   *
   * Chama-se `decisao` e não `classificacao` porque este tipo já tem um
   * `classificacao` (o rótulo de temperatura de `pontuar`). São coisas
   * diferentes e o nome precisa dizer isso.
   */
  decisao: Classificacao;
  decisaoRotulo: string;
  /** 0–100. Ordena DENTRO da classificação; nunca a define sozinho. */
  probabilidade: number;
  /** Por que está aqui — e o que falta saber. */
  positivos: Motivo[];
  negativos: Motivo[];
  /** Dor provável (hipótese) ou confirmada pelo cliente. Nunca as duas. */
  dor2: DorDoLead;

  // ───────── canais ─────────
  /** 📱 whatsapp · 📸 instagram · 🔥 ambos · ❌ sem-canal */
  canal: Canal;
  canalRotulo: string;
  /** O @ validado, quando existe perfil utilizável. */
  instagramUsername: string | null;
  instagramUrl: string | null;
  /** Status da abordagem MANUAL. Independente do funil de WhatsApp. */
  instagramStatus: string | null;
  /** Por que está fora da visão comercial, ou null se está dentro. */
  descarte: Descarte;
  /** Os três scores separados — ver `scores` em lib/pontuacao. */
  scoreComercial: number;
  scoreContatabilidade: number;
  scoreFinal: number;
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
    /** Tem telefone válido — dá para tentar falar. */
    contataveis: number;
    /** Contatável + encaixe de sistema + não é rede. */
    qualificados: number;
    /** Qualificado + passa na elegibilidade da fila + score mínimo. */
    prontosParaProspeccao: number;
    pequenos: number;
    comPotencialSistema: number;
    potencialForte: number;
    semSiteConfirmado: number;
    siteNaoVerificado: number;
    possiveisDuplicatas: number;
    comInstagram: number;
    naoContatados: number;
    /** Acionáveis por distância da operação. Ver lib/territorio. */
    naPraca: number;
    naRegiao: number;
    foraDaPraca: number;
    praca: string;
    prioridadeA: number;
    prioridadeB: number;
    prioridadeC: number;
    prioridadeD: number;
  };
  /**
   * POR QUE os leads caíram em D.
   *
   * "D — 840" sozinho parece base ruim. Aberto em causas, vira mapa de
   * trabalho: se a maior fatia é "sem telefone", o problema tem conserto (a
   * fila de enriquecimento); se fosse "rede", não teria.
   */
  /**
   * O PAINEL POR CANAL — a métrica principal, no lugar de "total de leads".
   *
   * Medido antes desta mudança: a tela anunciava 1.057 leads e 127 eram
   * abordáveis. Um número que erra por 8x não é indicador, é ruído; estes
   * contam o que dá para fazer hoje.
   */
  canais: {
    /** Tem canal real E existe o que vender. A métrica que importa. */
    acionaveis: number;
    /** 📱 Celular plausível — pode entrar em campanha. */
    whatsapp: number;
    /** 📸 Instagram utilizável — abordagem manual. */
    instagram: number;
    /** 🔥 Os dois. Melhores oportunidades. */
    ambos: number;
    /** ❌ Sem canal nenhum: fora da visão comercial. */
    semCanal: number;
    /** Total bruto da base — informação secundária, de propósito. */
    total: number;
    pequenosLocais: number;
    comSistemaAplicavel: number;
    /** Por que os leads ficaram fora da visão comercial. */
    descartes: { motivo: string; rotulo: string; quantidade: number }[];
  };
  motivosD: { motivo: string; rotulo: string; quantidade: number }[];
  /** O funil do enriquecimento — quem vale a pena caçar o telefone. */
  enriquecimento: {
    semTelefone: number;
    /** Passam em `precisaEnriquecer`: qualidade potencial A ou B. */
    precisamEnriquecer: number;
    prioridadeAlta: number;
    prioridadeMedia: number;
    prioridadeBaixa: number;
    /** Já ganharam telefone por enriquecimento. */
    encontrados: number;
    /** Com potencial A/B, mas sem telefone — o alvo. */
    potencialAsemTelefone: number;
    potencialBsemTelefone: number;
  };
};

/**
 * Nota mínima para entrar em "pronto para prospecção".
 *
 * 45 de 100 numa régua cujos positivos somam 120: é o piso que um negócio
 * pequeno com celular e encaixe de sistema ultrapassa sem esforço, e que um
 * cadastro solto no mapa não alcança. Existe para a fila não gastar as vagas
 * do teto diário com quem só tem nome e categoria.
 */
export const SCORE_MINIMO_PROSPECCAO = 45;

const LIMITE_LEADS = 200;

/** A auditoria CONFIRMOU ausência de site próprio? `nao-verificado` não conta. */
function semSiteConfirmado(lead: Lead): boolean {
  return SEM_SITE.includes(lead.statusSite);
}

/**
 * O que o filtro precisa saber e o lead sozinho não conta: se ele passa em
 * todas as travas de prospecção, se já foi abordado, e se é possível
 * duplicata. Tudo isso depende da base e do histórico, calculados uma vez em
 * `oportunidades()` e passados aqui.
 */
type ContextoFiltro = {
  pronto: (l: Lead) => boolean;
  jaContatado: (l: Lead) => boolean;
  ctx: (l: Lead) => ContextoLead;
};

function passaNosFiltros(lead: Lead, f: FiltroOportunidade, ajuda: ContextoFiltro): boolean {
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
  if (f.nivel && prioridadeComercial(lead, ajuda.ctx(lead)).nivel !== f.nivel) return false;

  if (f.fila) {
    const c = canalDoLead(lead);
    if (f.fila === "acionaveis" && !ehAcionavel(lead)) return false;
    if (f.fila === "ambos" && c !== "ambos") return false;
    // A fila do Instagram aceita quem também tem WhatsApp: a abordagem manual
    // é adicional, não exclusiva.
    if (f.fila === "instagram" && c !== "instagram" && c !== "ambos") return false;
    if (f.fila === "whatsapp" && c !== "whatsapp" && c !== "ambos") return false;
    // Nenhuma fila comercial aceita lead que não tem o que vender.
    if (f.fila !== "acionaveis" && motivoDeDescarte(lead)) return false;
  }
  if (f.prontosParaProspeccao && !ajuda.pronto(lead)) return false;
  if (f.naoContatado && ajuda.jaContatado(lead)) return false;
  if (f.somenteNaPraca && !ehAlcancavel(lead)) return false;
  if (f.decisao && probabilidadeComercial(lead, ajuda.ctx(lead)).classificacao !== f.decisao) {
    return false;
  }
  if (f.potencialForte) {
    const e = avaliarSistema(lead);
    if (!e.serve || e.modulos.length < 4) return false;
  }
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

  /**
   * Quem é possível duplicata de quem — calculado UMA vez para a base inteira.
   *
   * `oportunidade()` é função pura por lead e não tem como saber disso: exige
   * comparar cada cadastro com todos os outros. O painel tem a base na mão,
   * então calcula aqui e injeta o resultado no score (penalidade de -15).
   *
   * O primeiro de cada grupo NÃO é marcado: se dois cadastros são o mesmo
   * lugar, um deles é o bom. Penalizar os dois esconderia o lead de verdade.
   */
  const duplicados = new Set(
    deduplicar(
      [...base].sort((a, b) => Number(Boolean(b.telefone)) - Number(Boolean(a.telefone))),
    ).duplicados.map((d) => (d.item as Lead).id),
  );
  const ctxDe = (lead: Lead): ContextoLead => ({ possivelDuplicata: duplicados.has(lead.id) });

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
  const niveis = base.map((l) => prioridadeComercial(l, ctxDe(l)).nivel);

  /**
   * OS QUATRO NÚMEROS, e por que eles NÃO podem virar um só.
   *
   *   encontrados  quantos existem na base
   *   contataveis  têm telefone válido — dá para tentar falar
   *   qualificados + têm encaixe de sistema e não são rede: vale a conversa
   *   prontos      + passam na elegibilidade real da fila (opt-out, recontato,
   *                mensagem viva, duplicata) e batem o score mínimo
   *
   * Cada um é um subconjunto do anterior, e a distância entre eles é a
   * informação: "1.057 encontrados / 54 prontos" diz onde está o gargalo. Um
   * número só esconderia isso e faria a tela prometer um lote que a fila
   * recusa — que foi o defeito original deste painel.
   */
  const contatavel = (l: Lead) => Boolean(validarTelefone(telefoneDoLead(l)));
  const qualificado = (l: Lead) =>
    contatavel(l) && avaliarSistema(l).serve && !classificarPorte(l).rede;
  const pronto = (l: Lead) =>
    qualificado(l) && elegivel(l).pode && pontuar(l).total >= SCORE_MINIMO_PROSPECCAO;

  const totais = {
    leads: base.length,
    comWhatsapp: base.filter((l) => l.whatsapp).length,
    elegiveis: base.filter((l) => elegivel(l).pode).length,
    contataveis: base.filter(contatavel).length,
    qualificados: base.filter(qualificado).length,
    prontosParaProspeccao: base.filter(pronto).length,
    pequenos: base.filter(pareceNegocioLocal).length,
    comPotencialSistema: base.filter((l) => avaliarSistema(l).serve).length,
    /** Encaixe forte: o sistema encosta em 4+ processos do negócio. */
    potencialForte: base.filter((l) => {
      const e = avaliarSistema(l);
      return e.serve && e.modulos.length >= 4;
    }).length,
    semSiteConfirmado: base.filter(semSiteConfirmado).length,
    siteNaoVerificado: base.filter((l) => l.statusSite === "nao-verificado").length,
    possiveisDuplicatas: duplicados.size,
    comInstagram: base.filter((l) => l.instagram).length,
    /** Acionáveis DENTRO da praça — a métrica que a operação local usa. */
    naPraca: base.filter((l) => ehAcionavel(l) && alcanceDoLead(l) === "local").length,
    naRegiao: base.filter((l) => ehAcionavel(l) && alcanceDoLead(l) === "regional").length,
    foraDaPraca: base.filter((l) => ehAcionavel(l) && alcanceDoLead(l) === "fora").length,
    praca: `${PRACA.cidade}/${PRACA.uf}`,
    /** Nunca recebeu mensagem nossa — nem rascunho, nem enviada. */
    naoContatados: base.filter((l) => (porLead.get(l.id)?.length ?? 0) === 0).length,
    prioridadeA: niveis.filter((n) => n === "A").length,
    prioridadeB: niveis.filter((n) => n === "B").length,
    prioridadeC: niveis.filter((n) => n === "C").length,
    prioridadeD: niveis.filter((n) => n === "D").length,
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
  /**
   * A abertura do D em causas, na MESMA ordem que a gaveta usou para decidir.
   * Ver `motivoDaGaveta` — um diagnóstico fora de ordem apontaria a causa
   * errada e mandaria consertar o que não é o problema.
   */
  const motivosD = () => {
    const conta = new Map<string, number>();
    for (const l of base) {
      if (prioridadeComercial(l, ctxDe(l)).nivel !== "D") continue;
      const m = motivoDaGaveta(l, ctxDe(l));
      conta.set(m, (conta.get(m) ?? 0) + 1);
    }
    return [...conta.entries()]
      .map(([motivo, quantidade]) => ({
        motivo,
        rotulo: ROTULO_MOTIVO[motivo as MotivoGaveta],
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);
  };

  /**
   * O painel por canal. Conta a base INTEIRA, não o filtro — é o retrato de
   * com quem dá para falar hoje, e ele não muda quando a pessoa mexe num
   * filtro de nicho.
   */
  const resumoCanais = () => {
    const porCanal = base.map(canalDoLead);
    const descartes = new Map<string, number>();
    for (const l of base) {
      const d = motivoDeDescarte(l);
      if (d) descartes.set(d, (descartes.get(d) ?? 0) + 1);
    }
    return {
      acionaveis: base.filter(ehAcionavel).length,
      whatsapp: porCanal.filter((c) => c === "whatsapp" || c === "ambos").length,
      instagram: porCanal.filter((c) => c === "instagram" || c === "ambos").length,
      ambos: porCanal.filter((c) => c === "ambos").length,
      semCanal: porCanal.filter((c) => c === "sem-canal").length,
      total: base.length,
      pequenosLocais: base.filter((l) => ehAcionavel(l) && pareceNegocioLocal(l)).length,
      comSistemaAplicavel: base.filter((l) => ehAcionavel(l) && avaliarSistema(l).serve).length,
      descartes: [...descartes.entries()]
        .map(([motivo, quantidade]) => ({
          motivo,
          rotulo: ROTULO_DESCARTE[motivo as NonNullable<Descarte>],
          quantidade,
        }))
        .sort((a, b) => b.quantidade - a.quantidade),
    };
  };

  const resumoEnriquecimento = () => {
    const analises = base.map((l) => ({ l, e: precisaEnriquecer(l) }));
    const semTel = analises.filter(({ l }) => !validarTelefone(telefoneDoLead(l)));
    const naFila = analises.filter(({ e }) => e.precisa);
    return {
      semTelefone: semTel.length,
      precisamEnriquecer: naFila.length,
      prioridadeAlta: naFila.filter(({ e }) => e.prioridade === "alta").length,
      prioridadeMedia: naFila.filter(({ e }) => e.prioridade === "media").length,
      prioridadeBaixa: naFila.filter(({ e }) => e.prioridade === "baixa").length,
      encontrados: base.filter((l) => l.telefoneOrigem).length,
      potencialAsemTelefone: semTel.filter(({ e }) => e.qualidadePotencial === "A").length,
      potencialBsemTelefone: semTel.filter(({ e }) => e.qualidadePotencial === "B").length,
    };
  };

  /**
   * WhatsApp CONFIRMADO — só com prova, nunca por formato do número.
   *
   * A prova é uma destas duas: uma mensagem que realmente saiu (`enviadaEm`
   * preenchido — a Bridge recusa número sem conta, então o envio concluído é
   * evidência), ou uma resposta que chegou do lead.
   *
   * Celular NÃO entra. "Parece celular" é `possivel-celular` na tela, um
   * estado diferente e propositalmente mais fraco: prometer WhatsApp por causa
   * do nono dígito é a forma mais fácil de a tela mentir.
   */
  const confirmados = new Set<string>();
  for (const [leadId, msgs] of porLead) {
    if (msgs.some((m) => m.enviadaEm)) confirmados.add(leadId);
  }
  for (const c of await db
    .select({ leadId: conversas.leadId })
    .from(conversas)
    .where(eq(conversas.direcao, "recebida"))
    .groupBy(conversas.leadId)) {
    confirmados.add(c.leadId);
  }

  const ajuda: ContextoFiltro = {
    pronto,
    // "Já contatado" = tem QUALQUER mensagem no histórico, enviada ou não.
    jaContatado: (l) => (porLead.get(l.id)?.length ?? 0) > 0,
    ctx: ctxDe,
  };
  const doFiltro = base.filter((l) => passaNosFiltros(l, filtro, ajuda));
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
   * A ORDEM DE TRABALHO, e ela é uma decisão comercial, não estética.
   *
   *   1. classificação   🔥 antes de 🟡 antes de ⚪
   *   2. praça           dentro do grupo, quem está na cidade vem primeiro
   *   3. aderência       mais processos que o sistema organiza
   *   4. probabilidade   o número, só para desempatar o resto
   *
   * NÃO se ordena por quantidade de avaliações nem por ter telefone: volume de
   * dado não é qualidade comercial, e foi ordenando assim que o painel colocou
   * dentista de São Paulo acima de oficina de Uberlândia.
   */
  const ORDEM: Record<NivelPrioridade, number> = { A: 0, B: 1, C: 2, D: 3 };
  const PESO_ALCANCE: Record<Alcance, number> = { local: 0, regional: 1, fora: 2 };
  const comScore = aptos
    .map((lead) => ({
      lead,
      p: pontuar(lead),
      nivel: prioridadeComercial(lead, ctxDe(lead)),
      prob: probabilidadeComercial(lead, ctxDe(lead)),
    }))
    .filter(({ p }) => {
      if (filtro.prioridade === "alta") return p.total >= 70;
      if (filtro.prioridade === "media") return p.total >= 45;
      return true;
    })
    .sort(
      (a, b) =>
        ORDEM_CLASSIFICACAO[a.prob.classificacao] - ORDEM_CLASSIFICACAO[b.prob.classificacao] ||
        PESO_ALCANCE[alcanceDoLead(a.lead)] - PESO_ALCANCE[alcanceDoLead(b.lead)] ||
        avaliarSistema(b.lead).modulos.length - avaliarSistema(a.lead).modulos.length ||
        b.prob.pontos - a.prob.pontos ||
        ORDEM[a.nivel.nivel] - ORDEM[b.nivel.nivel],
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
    canais: resumoCanais(),
    motivosD: motivosD(),
    enriquecimento: resumoEnriquecimento(),
    leads: escolhidos.map(({ lead, p, nivel }) => {
      const encaixe = avaliarSistema(lead);
      const classe = classificarPorte(lead);
      const enriq = precisaEnriquecer(lead);
      const sc = scores(lead, ctxDe(lead));
      const prob = probabilidadeComercial(lead, ctxDe(lead));
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
        porteEstimado: classe.porteEstimado,
        porteEstimadoRotulo: ROTULO_PORTE_ESTIMADO[classe.porteEstimado],
        evidenciasPorte: classe.evidenciasPorte,
        sinaisPequeno: classe.sinais,
        rede: classe.rede,
        motivosRede: classe.motivosRede,
        semSiteConfirmado: semSiteConfirmado(lead),
        siteNaoVerificado: lead.statusSite === "nao-verificado",
        prioridadeNicho: nichoPrioritario(lead.categoria)?.prioridade ?? null,
        prontoParaProspeccao: pronto(lead),
        possivelDuplicata: duplicados.has(lead.id),
        // Só o que GANHOU ponto, e o quanto. Critério zerado é ruído na tela.
        porQue: p.oportunidade.criterios
          .filter((c) => c.ganhos !== 0)
          .map((c) => ({ criterio: c.rotulo, pontos: c.ganhos, base: c.base })),
        contato: estadoDoContato(lead, confirmados.has(lead.id)),
        contatoRotulo: ROTULO_CONTATO[estadoDoContato(lead, confirmados.has(lead.id))],
        precisaEnriquecer: enriq.precisa,
        enriquecimentoPrioridade: enriq.prioridade,
        enriquecimentoMotivo: enriq.motivo,
        qualidadePotencial: enriq.qualidadePotencial,
        telefoneOrigem: lead.telefoneOrigem,
        alcance: alcanceDoLead(lead),
        alcanceRotulo: ROTULO_ALCANCE[alcanceDoLead(lead)],
        decisao: prob.classificacao,
        decisaoRotulo: ROTULO_CLASSIFICACAO[prob.classificacao],
        probabilidade: prob.pontos,
        positivos: prob.positivos,
        negativos: prob.negativos,
        dor2: prob.dor,
        canal: canalDoLead(lead),
        canalRotulo: ROTULO_CANAL[canalDoLead(lead)],
        instagramUsername: instagramDoLead(lead)?.username ?? null,
        instagramUrl: instagramDoLead(lead)?.url ?? null,
        instagramStatus: lead.instagramStatus ?? null,
        descarte: motivoDeDescarte(lead),
        scoreComercial: sc.comercial,
        scoreContatabilidade: sc.contatabilidade,
        scoreFinal: sc.final,
      };
    }),
  };
}
