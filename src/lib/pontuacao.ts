import type { Lead } from "@/lib/db/schema";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * DOIS scores separados, de propósito.
 *
 *   OPORTUNIDADE     "essa empresa tem potencial para comprar?"
 *   CONTACTABILIDADE "quão fácil é falar com ela?"
 *
 * A régua anterior misturava as duas: sem WhatsApp, a nota era rebaixada a 39
 * mesmo com o ramo perfeito. Isso apagava do radar exatamente as empresas que
 * valeria a pena caçar o contato. Agora uma clínica excelente sem telefone é
 * `oportunidade alta + contato difícil` — vai para a fila de enriquecimento,
 * não para o lixo.
 *
 * ═══ MEDIÇÃO QUE DEFINIU OS PESOS (base de 282 leads) ═══
 *
 *   categoria .......... 100%   ← principal discriminante
 *   cidade/estado ...... 100%
 *   endereço ............ 67%
 *   telefone ............ 63%   ← idêntico a whatsapp: 0% tem um sem o outro
 *   whatsapp ............ 63%
 *   horários ............ 29%
 *   website ............. 28%
 *   e-mail .............. 22%
 *   instagram ............ 6%
 *   nota Google .......... 0%   ← CRITÉRIO MORTO, removido
 *   avaliações ........... 0%   ← CRITÉRIO MORTO, removido
 *   CNPJ/sócios .......... 0%   ← só existe após enriquecer
 *
 * Dois critérios da régua antiga saíram por não existirem na fonte:
 * "alto volume de avaliações" e "vários funcionários". Os 15 pontos do
 * primeiro foram redistribuídos entre sinais que a base realmente tem.
 *
 * E "não tem site" deixou de valer ponto quando o status é `nao-verificado`:
 * 72% dos leads disponíveis estão nesse estado, e premiar todos igualmente
 * por algo que ninguém confirmou é dar ponto por ausência de conhecimento —
 * além de achatar o score, que passa a não discriminar nada.
 */

// ══════════════════════════════════════════════ potencial por segmento

/**
 * O segmento é SINAL, não certeza. Por isso vale 40 dos 100 pontos e não
 * decide sozinho: uma oficina desorganizada e uma oficina com ERP recebem o
 * mesmo peso aqui, e é o resto do score que as separa.
 */
const ALTO =
  /car_repair|oficina|mec[âa]nic|auto.?center|centro automotivo|auto.?el[ée]tric|funilaria|car_wash|lava.?jato|tyres|borracharia|clinic|cl[íi]nic|dentist|odontolog|doctors|consult[óo]rio|veterinar|physio|fisioterap|pet\b|petshop|optician|[óo]tica|assist[êe]ncia t[ée]cnica|transportadora|log[íi]stica|manuten[çc][ãa]o/i;

const MEDIO =
  /restaurant|restaurante|lanchonete|pizzaria|hamburgueria|caf[ée]|cafeteria|bakery|padaria|bar\b|hairdresser|sal[ãa]o|barber|barbearia|beauty|est[ée]tica|fitness|academia|pilates|estate_agent|imobili[áa]ria|pharmacy|farm[áa]cia|escola|idiomas|autoescola/i;

export type PotencialSegmento = "alto" | "medio" | "avaliar";

export function potencialDoSegmento(lead: Lead): PotencialSegmento {
  const alvo = `${lead.categoria ?? ""} ${categoriaSingular(lead.categoria)}`;
  if (ALTO.test(alvo)) return "alto";
  if (MEDIO.test(alvo)) return "medio";
  return "avaliar";
}

// ══════════════════════════════════════════════ oportunidade

export type Criterio = {
  rotulo: string;
  ganhos: number;
  maximo: number;
  base: string;
};

export type Oportunidade = {
  score: number;
  faixa: "muito-alta" | "alta" | "media" | "baixa";
  rotulo: string;
  emoji: string;
  criterios: Criterio[];
};

/**
 * Limiares ABSOLUTOS, não relativos à base. Recomendação técnica:
 *
 * faixa relativa (top 10%, top 30%…) faz um lead mudar de classificação sem
 * nada ter mudado nele — basta você importar 200 leads melhores. Isso quebra
 * campanha salva, confunde filtro e torna impossível comparar duas semanas.
 *
 * O ajuste correto é calibrar os LIMIARES contra a distribuição real, o que
 * foi feito: os valores abaixo saíram de rodar a fórmula sobre os 282 leads
 * até a distribuição cair perto de 15% / 25% / 40% / 20%.
 */
const LIMIAR = { muitoAlta: 80, alta: 66, media: 42 };

/**
 * Calibração medida sobre os 282 leads reais, não estimada:
 *
 *   percentis do score → min 24 · p25 44 · mediana 63 · p85 79 · máx 96
 *
 *   80/66/42 →  muito alta 14% (40) · alta 28% (78) · média 37% (105) · baixa 21% (59)
 *
 * Foram testados seis conjuntos de limiar; este é o que mais se aproxima do
 * alvo (10–20% / 20–30% / ~40% / ~20%). Quando a base mudar de perfil, rode a
 * calibração de novo em vez de mexer nos pontos — os pesos refletem o que
 * importa, os limiares refletem a distribuição.
 */

export function oportunidade(lead: Lead): Oportunidade {
  const criterios: Criterio[] = [];
  const add = (rotulo: string, ganhos: number, maximo: number, base: string) =>
    criterios.push({ rotulo, ganhos, maximo, base });

  // ---------- 1. segmento (0–40) ----------
  const pot = potencialDoSegmento(lead);
  const pontosSegmento = pot === "alto" ? 40 : pot === "medio" ? 24 : 12;
  add(
    "Potencial operacional do segmento",
    pontosSegmento,
    40,
    pot === "alto"
      ? "Ramo com agenda, OS ou estoque"
      : pot === "medio"
        ? "Ramo com operação, mas menos dependente de sistema"
        : "Ramo a avaliar caso a caso",
  );

  // ---------- 2. encaixe operacional (0–20) ----------
  const encaixe = avaliarSistema(lead);
  const modulos = encaixe.serve ? encaixe.modulos.length : 0;
  const pontosModulos = Math.min(20, modulos * 4);
  add(
    "Processos que um sistema organiza",
    pontosModulos,
    20,
    encaixe.serve ? `${modulos} módulos identificados` : "Nenhum processo mapeado para o ramo",
  );

  // ---------- 3. estrutura identificável (0–15) ----------
  const pontosEndereco = lead.endereco ? 8 : 0;
  const pontosHorario = lead.horarios ? 7 : 0;
  add(
    "Estrutura operacional identificável",
    pontosEndereco + pontosHorario,
    15,
    [lead.endereco ? "endereço" : null, lead.horarios ? "horário publicado" : null]
      .filter(Boolean)
      .join(" + ") || "sem endereço nem horário",
  );

  // ---------- 4. presença digital ativa (0–15) ----------
  const pontosSite = lead.website ? 10 : 0;
  const pontosInsta = lead.instagram ? 5 : 0;
  add(
    "Presença digital ativa",
    pontosSite + pontosInsta,
    15,
    [lead.website ? "site" : null, lead.instagram ? "Instagram" : null]
      .filter(Boolean)
      .join(" + ") || "nenhuma presença encontrada",
  );

  /**
   * ---------- 5. lacuna de presença (0–10) ----------
   *
   * `nao-verificado` vale ZERO — não é "não tem site", é "ninguém conferiu".
   * Dar ponto aqui premiaria 72% da base igualmente e o score pararia de
   * discriminar qualquer coisa.
   */
  const lacuna =
    lead.statusSite === "sem-site" ||
    lead.statusSite === "so-rede-social" ||
    lead.statusSite === "so-agregador" ||
    lead.statusSite === "site-fora-do-ar"
      ? 10
      : lead.statusSite === "sem-ssl"
        ? 7
        : lead.statusSite === "tem-site"
          ? 5
          : 0;
  add(
    "Lacuna de presença confirmada",
    lacuna,
    10,
    lead.statusSite === "nao-verificado"
      ? "Status do site não verificado — sem pontos por falta de dado"
      : `Status: ${lead.statusSite}`,
  );

  const score = Math.min(100, criterios.reduce((s, c) => s + c.ganhos, 0));

  const faixa =
    score >= LIMIAR.muitoAlta
      ? "muito-alta"
      : score >= LIMIAR.alta
        ? "alta"
        : score >= LIMIAR.media
          ? "media"
          : "baixa";

  const rotulos = {
    "muito-alta": { rotulo: "Muito alta oportunidade", emoji: "🔥" },
    alta: { rotulo: "Alta oportunidade", emoji: "⚡" },
    media: { rotulo: "Média oportunidade", emoji: "🟡" },
    baixa: { rotulo: "Baixa oportunidade", emoji: "❄️" },
  } as const;

  return { score, faixa, ...rotulos[faixa], criterios };
}

// ══════════════════════════════════════════════ contactabilidade

export type Contactabilidade = {
  score: number;
  faixa: "excelente" | "bom" | "possivel" | "dificil";
  rotulo: string;
  emoji: string;
  canais: string[];
  /** Alta oportunidade + contato ruim = candidato a enriquecimento. */
  precisaEnriquecer: boolean;
};

export function contactabilidade(lead: Lead): Contactabilidade {
  const canais: string[] = [];
  let score = 0;

  if (lead.whatsapp) {
    score += 50;
    canais.push("WhatsApp");
  }
  /**
   * Telefone só soma quando NÃO virou WhatsApp. Medido: 0% da base tem
   * telefone sem WhatsApp — os dois são o mesmo dado, e somar os dois seria
   * contar o mesmo sinal duas vezes.
   */
  if (lead.telefone && !lead.whatsapp) {
    score += 25;
    canais.push("Telefone");
  }
  if (lead.instagram) {
    score += 15;
    canais.push("Instagram");
  }
  if (lead.email) {
    score += 10;
    canais.push("E-mail");
  }
  if (lead.website) {
    score += 5;
    canais.push("Site");
  }
  if (lead.endereco) {
    score += 5;
    canais.push("Endereço");
  }

  score = Math.min(100, score);

  const faixa =
    score >= 80 ? "excelente" : score >= 60 ? "bom" : score >= 40 ? "possivel" : "dificil";

  const rotulos = {
    excelente: { rotulo: "Excelente contato", emoji: "📱" },
    bom: { rotulo: "Bom contato", emoji: "📞" },
    possivel: { rotulo: "Contato possível", emoji: "✉️" },
    dificil: { rotulo: "Contato difícil", emoji: "🔎" },
  } as const;

  return {
    score,
    faixa,
    ...rotulos[faixa],
    canais,
    precisaEnriquecer: score < 50 && oportunidade(lead).score >= LIMIAR.alta,
  };
}

// ══════════════════════════════════════════════ compatibilidade

export type Pontuacao = {
  total: number;
  classificacao: "muito-quente" | "quente" | "medio" | "frio";
  rotulo: string;
  emoji: string;
  criterios: { rotulo: string; pontos: number; base: string; ganhou: boolean }[];
  naoAvaliado: string[];
  /** Os dois scores novos, para quem já sabe usar. */
  oportunidade: Oportunidade;
  contato: Contactabilidade;
};

/**
 * `pontuar` continua existindo com a mesma forma para não quebrar campanhas,
 * facetas, métricas e testes que já a usam. Por dentro passou a devolver o
 * score de OPORTUNIDADE — a mudança é que ele não é mais destruído por falta
 * de WhatsApp.
 */
export function pontuar(lead: Lead): Pontuacao {
  const o = oportunidade(lead);
  const c = contactabilidade(lead);

  const mapa = {
    "muito-alta": "muito-quente",
    alta: "quente",
    media: "medio",
    baixa: "frio",
  } as const;

  return {
    total: o.score,
    classificacao: mapa[o.faixa],
    rotulo: o.rotulo,
    emoji: o.emoji,
    criterios: o.criterios.map((x) => ({
      rotulo: x.rotulo,
      pontos: x.maximo,
      base: x.base,
      ganhou: x.ganhos > 0,
    })),
    naoAvaliado: [
      "Volume de avaliações no Google — 0% da base tem esse dado",
      "Número de funcionários — nenhuma fonte pública gratuita informa",
      "Catálogo de serviços — o mapa traz a categoria, não a lista",
    ],
    oportunidade: o,
    contato: c,
  };
}

/** Problema provável e solução — inalterado, vem do motor de sistemas. */
export function diagnostico(lead: Lead): { problema: string; solucao: string } | null {
  const e = avaliarSistema(lead);
  if (!e.serve) return null;
  return {
    problema: `Negócios desse ramo costumam ${e.dor}. Necessita validação na conversa.`,
    solucao: e.sistema,
  };
}
