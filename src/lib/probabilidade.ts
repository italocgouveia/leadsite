import type { Lead } from "@/lib/db/schema";
import { canalDoLead, instagramDoLead, motivoDeDescarte } from "@/lib/canais";
import { classificarPorte, ehCategoriaDeGrandePorte } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { nichoPrioritario } from "@/lib/nichos-locais";
import { alcanceDoLead, PRACA } from "@/lib/territorio";
import type { ContextoLead } from "@/lib/pontuacao";

/**
 * "Vale a pena eu gastar meu tempo abordando este lead?"
 *
 * POR QUE UMA CAMADA A MAIS, E NÃO OUTRO SCORE
 *
 * `oportunidade()` responde "esta empresa tem potencial?" e `contactabilidade`
 * responde "consigo falar com ela?". As duas são medidas do LEAD. Esta aqui é
 * uma decisão de AGENDA: das 123 empresas abordáveis, em quais as próximas
 * duas horas rendem mais?
 *
 * A diferença prática está nas travas duras. Um score alto não coloca ninguém
 * em 🔥: sem encaixe de sistema não há o que vender, e rede não decide software
 * na loja — por mais sinais que acumulem. Score é gradiente; isto é gaveta.
 *
 * SOBRE DUPLA CONTAGEM: os pesos aqui NÃO são somados aos de `pontuacao.ts`.
 * São uma segunda leitura dos MESMOS sinais primitivos (canal, porte, sistema,
 * praça, atividade) com uma pergunta diferente. Os dois números aparecem lado
 * a lado na tela justamente para não se confundirem.
 *
 * Determinístico e sem IA, de propósito: a IA pode escrever o texto da
 * abordagem depois, mas quem é bom lead não pode depender de sorteio.
 */

export type Motivo = { texto: string; pontos: number };

export type Classificacao = "quero-vender" | "vale-abordar" | "nao-prioritario";

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  "quero-vender": "🔥 QUERO VENDER",
  "vale-abordar": "🟡 VALE ABORDAR",
  "nao-prioritario": "⚪ NÃO PRIORITÁRIO",
};

export type Probabilidade = {
  /** 0 a 100. Só ordena DENTRO da classificação, nunca a define sozinho. */
  pontos: number;
  classificacao: Classificacao;
  /** O que puxou para cima, com o peso — a explicação do ranking. */
  positivos: Motivo[];
  /** O que puxou para baixo, ou o que falta saber. Nunca fica escondido. */
  negativos: Motivo[];
  /** A dor: hipótese até o cliente confirmar. Ver `dorDoLead`. */
  dor: DorDoLead;
};

/**
 * A DOR: provável ou confirmada — nunca as duas coisas misturadas.
 *
 * Um ramo não prova um problema. "Oficina" não significa "tem problema com
 * ordem de serviço"; significa que negócios desse ramo costumam ter. A
 * diferença importa na frente do cliente: afirmar a dor de alguém que você
 * nunca conversou é o jeito mais rápido de a conversa acabar.
 *
 * `confirmada` só existe depois que a pessoa descreveu o processo dela — vem
 * de `memoriaComercial.dorConfirmada`, gravado pelo diagnóstico.
 */
export type DorDoLead =
  | { tipo: "confirmada"; texto: string }
  | { tipo: "provavel"; texto: string; sinais: string[] }
  | { tipo: "nenhuma" };

export function dorDoLead(lead: Lead): DorDoLead {
  const confirmada = lead.memoriaComercial?.dorConfirmada;
  if (confirmada) return { tipo: "confirmada", texto: confirmada };

  const encaixe = avaliarSistema(lead);
  if (!encaixe.serve) return { tipo: "nenhuma" };

  /**
   * Os sinais são observações sobre ESTE negócio, nunca sobre o ramo.
   *
   * "Oficina tem 6 processos" e "o ramo é recorrente" são estatística sobre o
   * setor — valem para toda oficina do Brasil e não observam nada sobre esta.
   * Contá-los aqui faria qualquer cadastro de oficina nascer com uma "dor
   * provável", que é precisamente a afirmação que não se pode fazer antes da
   * conversa. (Os dois continuam pontuando em `probabilidadeComercial`, onde
   * a pergunta é outra: aderência do ramo à solução.)
   *
   * O que entra: coisa que a própria empresa publicou.
   */
  const sinais: string[] = [];
  if (lead.horarios) sinais.push("horário fixo publicado");
  if ((lead.avaliacoes ?? 0) >= 25) sinais.push(`${lead.avaliacoes} avaliações — passa volume`);
  if (lead.whatsapp) sinais.push("atende por WhatsApp");
  if (lead.instagram) sinais.push("Instagram ativo");
  if (lead.website) sinais.push("site publicado");

  if (sinais.length < 2) return { tipo: "nenhuma" };
  return { tipo: "provavel", texto: encaixe.dor, sinais };
}

/**
 * PESOS. Explícitos, previsíveis e testáveis — cada um vira uma linha na tela.
 *
 * Os positivos somam 105 e o resultado é normalizado; os negativos são
 * subtraídos do bruto. Nenhum sinal aparece em duas linhas.
 */
const PESO = {
  praca: 15,
  regiao: 10,
  pequenoLocal: 15,
  sistemaAplicavel: 20,
  operacaoRecorrente: 10,
  processoEvidente: 10,
  whatsapp: 10,
  instagram: 5,
  presencaDigital: 5,
  atividadeRecente: 5,
} as const;

const PENALIDADE = {
  rede: 30,
  grandePorte: 25,
  semCanal: 20,
  semSistema: 20,
  inativo: 15,
  duplicado: 15,
  foraDaPraca: 10,
} as const;

const MAXIMO = Object.values(PESO).reduce((s, v) => s + v, 0) - PESO.regiao;

export function probabilidadeComercial(lead: Lead, ctx: ContextoLead = {}): Probabilidade {
  const positivos: Motivo[] = [];
  const negativos: Motivo[] = [];
  const mais = (texto: string, pontos: number) => positivos.push({ texto, pontos });
  const menos = (texto: string, pontos: number) => negativos.push({ texto, pontos: -pontos });

  const canal = canalDoLead(lead);
  const classe = classificarPorte(lead);
  const encaixe = avaliarSistema(lead);
  const nicho = nichoPrioritario(lead.categoria);
  const alcance = alcanceDoLead(lead);

  // ---------- 1. praça ----------
  if (alcance === "local") mais(`Em ${PRACA.cidade} — dá para visitar`, PESO.praca);
  else if (alcance === "regional") mais(`Região do DDD ${PRACA.ddd}`, PESO.regiao);
  else menos(`Fora da praça (${lead.cidade ?? "cidade desconhecida"})`, PENALIDADE.foraDaPraca);

  // ---------- 2. perfil de negócio ----------
  if (classe.rede) {
    menos(`Rede ou franquia: ${classe.motivosRede[0]}`, PENALIDADE.rede);
  } else if (ehCategoriaDeGrandePorte(lead.categoria)) {
    menos(`Ramo de grande porte (${lead.categoria})`, PENALIDADE.grandePorte);
  } else if (classe.porteEstimado === "pequeno") {
    mais("Provável pequeno/local", PESO.pequenoLocal);
  } else {
    /** Não é penalidade: é falta de dado, e a tela precisa dizer isso. */
    negativos.push({ texto: "Porte não confirmado", pontos: 0 });
  }

  // ---------- 3. aderência à solução ----------
  if (encaixe.serve) {
    mais(`Sistema aplicável: ${encaixe.sistema}`, PESO.sistemaAplicavel);
  } else {
    menos("Nenhuma solução da ICG Tech se encaixa no ramo", PENALIDADE.semSistema);
  }

  // ---------- 4. sinais de operação ----------
  if (nicho?.recorrente) mais("Operação recorrente — o cliente volta", PESO.operacaoRecorrente);
  if (encaixe.serve && encaixe.modulos.length >= 4) {
    mais(`Processo evidente: ${encaixe.modulos.slice(0, 4).join(", ")}`, PESO.processoEvidente);
  }

  // ---------- 5. canais ----------
  if (canal === "whatsapp" || canal === "ambos") mais("WhatsApp disponível", PESO.whatsapp);
  const ig = instagramDoLead(lead);
  if (ig) mais(`Instagram comercial (@${ig.username})`, PESO.instagram);
  if (canal === "sem-canal") menos("Sem WhatsApp e sem Instagram", PENALIDADE.semCanal);

  // ---------- 6. atividade ----------
  if (lead.website || lead.instagram) mais("Presença digital ativa", PESO.presencaDigital);
  if ((lead.avaliacoes ?? 0) >= 10 || lead.horarios) {
    mais("Sinais de operação em funcionamento", PESO.atividadeRecente);
  }

  const osm = lead.dadosOsm ?? {};
  if (Object.keys(osm).some((k) => /^(disused|abandoned|was|removed)/i.test(k))) {
    menos("Marcado como extinto no mapa", PENALIDADE.inativo);
  }
  if (ctx.possivelDuplicata) {
    menos("Possível duplicata de outro cadastro", PENALIDADE.duplicado);
  }

  // ---------- avisos que não pontuam, mas o vendedor precisa ver ----------
  if (canal !== "sem-canal" && !lead.telefone) {
    negativos.push({ texto: "Telefone ainda não confirmado", pontos: 0 });
  }
  if (lead.instagram && !ig) {
    negativos.push({ texto: "Link de Instagram não é um perfil utilizável", pontos: 0 });
  }

  const bruto =
    positivos.reduce((s, m) => s + m.pontos, 0) + negativos.reduce((s, m) => s + m.pontos, 0);
  const pontos = Math.max(0, Math.min(100, Math.round((bruto / MAXIMO) * 100)));

  /**
   * ═══ AS TRAVAS DURAS ═══
   *
   * Vêm DEPOIS do cálculo e mandam nele. É o que garante que canal melhore a
   * capacidade de contato sem criar oportunidade comercial: nenhuma soma de
   * pontos coloca em 🔥 uma empresa para a qual não há o que vender.
   */
  const desqualificado = motivoDeDescarte(lead);
  let classificacao: Classificacao;

  if (desqualificado || !encaixe.serve || classe.rede || ehCategoriaDeGrandePorte(lead.categoria)) {
    classificacao = "nao-prioritario";
  } else if (canal === "sem-canal") {
    // Bom negócio, sem porta de entrada. Vira alvo de enriquecimento, não de agenda.
    classificacao = "nao-prioritario";
  } else if (alcance !== "fora" && classe.porteEstimado === "pequeno" && pontos >= 60) {
    classificacao = "quero-vender";
  } else if (pontos >= 40) {
    classificacao = "vale-abordar";
  } else {
    classificacao = "nao-prioritario";
  }

  return { pontos, classificacao, positivos, negativos, dor: dorDoLead(lead) };
}

/** A ordem de trabalho: 🔥 primeiro, depois 🟡, depois ⚪. */
export const ORDEM_CLASSIFICACAO: Record<Classificacao, number> = {
  "quero-vender": 0,
  "vale-abordar": 1,
  "nao-prioritario": 2,
};
