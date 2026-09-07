import type { Lead } from "@/lib/db/schema";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import { classificarPorte } from "@/lib/porte";
import { nichoPrioritario } from "@/lib/nichos-locais";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";

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
 *   nota Google .......... 0%   ← só existe quando a fonte é o Places
 *   avaliações ........... 0%   ← idem
 *   CNPJ/sócios .......... 0%   ← só existe após enriquecer
 *
 * E "não tem site" não vale ponto quando o status é `nao-verificado`:
 * a maioria dos leads vindos do OpenStreetMap está nesse estado, e premiar
 * todos igualmente por algo que ninguém confirmou é dar ponto por ausência de
 * conhecimento — além de achatar o score, que passa a não discriminar nada.
 *
 * ═══ REVISÃO PARA PROSPECÇÃO LOCAL ═══
 *
 * A régua acima classificava bem "quem precisa de site". O alvo mudou: o
 * produto é SISTEMA, e o cliente é o negócio de bairro de Uberlândia. Duas
 * coisas estavam ativamente contra esse alvo:
 *
 *  1. TER SITE DAVA PONTO. "Presença digital ativa" somava 10 por ter site e
 *     a "lacuna" devolvia só 5 a quem não tinha — saldo de +5 para quem tem
 *     site. O score empurrava para o topo exatamente quem menos precisa da
 *     conversa. Hoje site custa pontos (critério 5) e a presença ativa que
 *     conta é Instagram e movimento (critério 6).
 *
 *  2. PORTE NÃO EXISTIA. Franquia e rede pontuavam como padaria de esquina.
 *     Hoje `lib/porte.ts` identifica rede por evidência (tag `brand` no mapa,
 *     marca nacional no nome) e ela leva -40.
 *
 * Os pesos positivos somam exatamente 100: ramo 20 · sistema 18 · sinais de
 * pequeno 20 · contato 20 · sem site 12 · atividade 10.
 */

// ══════════════════════════════════════════════ potencial por segmento

/**
 * O segmento é SINAL, não certeza. Por isso vale 20 dos 100 pontos e não
 * decide sozinho: uma oficina desorganizada e uma oficina com ERP recebem o
 * mesmo peso aqui, e é o resto do score que as separa.
 *
 * Continua existindo ao lado de `nichos-locais.ts` porque responde a outra
 * pergunta: aquele arquivo diz "está na minha lista de alvos", este diz "o
 * ramo tem operação para organizar". Um lead fora da lista de Uberlândia ainda
 * pode ter operação — é o que este regex captura.
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
 * CALIBRAÇÃO — e por que ela está deliberadamente desatualizada.
 *
 * Os limiares 80/66/42 foram calibrados sobre a base antiga (282 pousadas e
 * chalés), onde davam 14% / 28% / 37% / 21%.
 *
 * Sobre a base nova de Uberlândia eles dão 4% / 9% / 52% / 35% — muito mais
 * apertados. E a explicação NÃO é que os leads sejam piores: é que o
 * OpenStreetMap quase não publica telefone na cidade (medido: 171 números em
 * 4.280 estabelecimentos mapeados). Sem telefone, o lead perde os 20 pontos de
 * contato; sem tag de site, perde os 12 de "sem site próprio" porque
 * `nao-verificado` não pontua. O teto real de quem não tem contato é 68.
 *
 * Mexer nos limiares agora só maquiaria isso: renomearia de "média" para
 * "alta" um lead com quem não há como falar. O número baixo é informação
 * verdadeira sobre a fonte, e o caminho para melhorá-lo é enriquecer contato
 * (ver `precisaEnriquecer`), não afrouxar a régua.
 *
 * Recalibrar quando a base tiver telefone de verdade — os pesos refletem o que
 * importa, os limiares refletem a distribuição.
 */

export function oportunidade(lead: Lead): Oportunidade {
  const criterios: Criterio[] = [];
  const add = (rotulo: string, ganhos: number, maximo: number, base: string) =>
    criterios.push({ rotulo, ganhos, maximo, base });

  const classe = classificarPorte(lead);
  const nicho = nichoPrioritario(lead.categoria);

  // ---------- 1. ramo prioritário (0–20) ----------
  const pot = potencialDoSegmento(lead);
  const pontosNicho = nicho
    ? nicho.recorrente
      ? 20
      : 15
    : pot === "alto"
      ? 12
      : pot === "medio"
        ? 8
        : 3;
  add(
    "Ramo prioritário para sistema",
    pontosNicho,
    20,
    nicho
      ? nicho.recorrente
        ? `${nicho.rotulo} — serviço recorrente, o cliente volta sozinho`
        : `${nicho.rotulo} — ramo prioritário`
      : pot === "alto"
        ? "Ramo com agenda, OS ou estoque"
        : pot === "medio"
          ? "Ramo com operação, mas menos dependente de sistema"
          : "Fora da lista de nichos prioritários",
  );

  // ---------- 2. potencial de sistema (0–18) ----------
  const encaixe = avaliarSistema(lead);
  const modulos = encaixe.serve ? encaixe.modulos.length : 0;
  add(
    "Processos que um sistema organiza",
    Math.min(18, modulos * 3),
    18,
    encaixe.serve ? `${modulos} módulos identificados` : "Nenhum processo mapeado para o ramo",
  );

  /**
   * ---------- 3. sinais de pequeno negócio (0–20) ----------
   *
   * São INDÍCIOS, e o rótulo diz isso. O porte declarado continua
   * `desconhecido` (ver lib/porte.ts) — o que se pontua aqui é comportamento
   * observável de negócio independente, não um dado oficial que ninguém apurou.
   */
  add(
    "Sinais de negócio pequeno e independente",
    Math.min(20, classe.sinais.length * 4),
    20,
    classe.rede
      ? "Rede identificada — não é negócio independente"
      : (classe.sinais.join(", ") || "nenhum sinal identificável"),
  );

  /**
   * ---------- 4. contato utilizável (0–20) ----------
   *
   * Celular vale mais que fixo porque é o número que atende no WhatsApp — mas
   * formato NÃO prova conta, e nada aqui afirma que o lead tem WhatsApp. É
   * pontuação de probabilidade de alcance, e a prova continua sendo o envio.
   */
  const tel = validarTelefone(telefoneDoLead(lead));
  const pontosContato = tel
    ? tel.tipo === "celular"
      ? 20
      : 12
    : lead.instagram || lead.email
      ? 4
      : 0;
  add(
    "Contato utilizável",
    pontosContato,
    20,
    tel
      ? tel.tipo === "celular"
        ? "celular — provável WhatsApp, a confirmar no envio"
        : "telefone fixo — pode ter WhatsApp Business"
      : lead.instagram || lead.email
        ? "sem telefone; só Instagram ou e-mail"
        : "nenhum canal de contato",
  );

  /**
   * ---------- 5. ausência de site próprio (0–12) ----------
   *
   * Instagram, Linktree, iFood e wa.me NÃO são site — quem decide isso é
   * `lib/places/audit.ts`, e por isso `so-rede-social` e `so-agregador`
   * pontuam igual a `sem-site`.
   *
   * `nao-verificado` vale ZERO. Não é "não tem site", é "ninguém conferiu" —
   * e no OpenStreetMap a ausência da tag `website` significa exatamente isso.
   * Dar ponto aqui transformaria falta de dado em qualidade do lead.
   *
   * Ter site custa pontos, mas NÃO zera: uma oficina com site e sem controle
   * de ordem de serviço continua excelente lead, e é o critério 2 que a segura
   * no topo.
   */
  const lacuna =
    lead.statusSite === "sem-site" ||
    lead.statusSite === "so-rede-social" ||
    lead.statusSite === "so-agregador" ||
    lead.statusSite === "site-fora-do-ar"
      ? 12
      : lead.statusSite === "sem-ssl"
        ? 9
        : lead.statusSite === "tem-site"
          ? 3
          : 0;
  add(
    "Sem site próprio",
    lacuna,
    12,
    lead.statusSite === "nao-verificado"
      ? "Status do site não verificado — sem pontos por falta de dado"
      : `Status: ${lead.statusSite}`,
  );

  // ---------- 6. atividade comercial (0–10) ----------
  const av = lead.avaliacoes ?? 0;
  const pontosAvaliacoes = av >= 100 ? 4 : av >= 40 ? 3 : av >= 10 ? 2 : av > 0 ? 1 : 0;
  const pontosNota = (lead.nota ?? 0) >= 4.5 ? 2 : (lead.nota ?? 0) >= 4 ? 1 : 0;
  const pontosInsta = lead.instagram ? 2 : 0;
  const pontosEstrutura = (lead.endereco ? 1 : 0) + (lead.horarios ? 1 : 0);
  add(
    "Atividade comercial",
    pontosAvaliacoes + pontosNota + pontosInsta + pontosEstrutura,
    10,
    [
      av > 0 ? `${av} avaliações` : null,
      lead.nota ? `nota ${lead.nota}` : null,
      lead.instagram ? "Instagram" : null,
      lead.endereco ? "endereço" : null,
      lead.horarios ? "horário publicado" : null,
    ]
      .filter(Boolean)
      .join(", ") || "sem sinais de atividade",
  );

  /**
   * ---------- penalidades ----------
   *
   * Rede é o único abatimento pesado, e é deliberado: uma franquia não decide
   * software na loja, então mesmo pontuando bem em ramo e operação ela não
   * deve aparecer perto do topo. Volume de avaliações NÃO penaliza — negócio
   * de bairro com 500 avaliações é comum, e é ótimo lead.
   */
  let penalidade = 0;
  if (classe.rede) {
    penalidade += 40;
    add("Rede, franquia ou corporação", -40, 0, classe.motivosRede.join("; "));
  }
  if (lead.telefone && !tel) {
    penalidade += 10;
    add("Telefone inválido", -10, 0, "número cadastrado não é telefone brasileiro válido");
  }

  const bruto = criterios.reduce((s, c) => s + Math.max(0, c.ganhos), 0) - penalidade;
  const score = Math.max(0, Math.min(100, bruto));

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
    /**
     * "Negócio ótimo, contato ruim" — vale caçar o telefone.
     *
     * A comparação IGNORA o critério de contato do score de oportunidade, e
     * isso é o ponto: desde que contato passou a valer 20 pontos lá, um lead
     * sem telefone perde nota nos dois eixos ao mesmo tempo, e a fila de
     * enriquecimento esvaziava sozinha — exatamente os leads que ela deveria
     * pescar deixavam de cruzar o limiar.
     *
     * Os 80 pontos restantes (ramo, sistema, porte, site, atividade) medem o
     * NEGÓCIO. 50 deles é o equivalente ao corte de "alta" nessa escala menor.
     */
    precisaEnriquecer: score < 50 && qualidadeDoNegocio(lead) >= 50,
  };
}

/**
 * O score de oportunidade SEM o critério de contato. Máximo 80.
 * Responde "esta empresa vale a pena?" sem misturar "consigo falar com ela?".
 */
export function qualidadeDoNegocio(lead: Lead): number {
  const criterios = oportunidade(lead).criterios.filter((c) => !c.rotulo.startsWith("Contato"));
  // As penalidades (ganhos negativos) continuam contando: uma franquia não
  // vira bom negócio só por sair a coluna de contato da conta.
  const total = criterios.reduce((s, c) => s + c.ganhos, 0);
  return Math.max(0, Math.min(80, total));
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

// ══════════════════════════════════════════════ prioridade A / B / C

export type NivelPrioridade = "A" | "B" | "C";

export type PrioridadeComercial = {
  nivel: NivelPrioridade;
  emoji: string;
  rotulo: string;
  /** Por que caiu nesse nível — em português, para a tela explicar. */
  porque: string;
};

/**
 * A gaveta em que o lead cai. Complementa o score, não repete: o score ordena
 * DENTRO da gaveta, a gaveta diz se vale a ligação hoje.
 *
 * A régua é de fatos, não de nota. Um lead com score 78 e sem telefone não é
 * "quase A" — é C, porque não dá para falar com ele hoje. Misturar as duas
 * coisas foi o que fazia a tela prometer um lote que a fila recusava.
 */
export function prioridadeComercial(lead: Lead): PrioridadeComercial {
  const classe = classificarPorte(lead);
  const encaixe = avaliarSistema(lead);
  const tel = validarTelefone(telefoneDoLead(lead));
  const pequeno = !classe.rede && classe.sinais.length >= 2;

  if (classe.rede) {
    return {
      nivel: "C",
      emoji: "🔵",
      rotulo: "Prioridade C",
      porque: `Rede ou corporação: ${classe.motivosRede[0]}`,
    };
  }

  /**
   * A exige as três coisas juntas: é pequeno, dá para falar com ele, e existe
   * sistema para vender. "Sem site" NÃO entra como requisito — uma oficina com
   * site e sem ordem de serviço é tão boa quanto uma sem site, e exigir a
   * ausência de site cortaria metade dos melhores leads (ver §4 do plano).
   */
  if (pequeno && tel?.tipo === "celular" && encaixe.serve) {
    return {
      nivel: "A",
      emoji: "🔥",
      rotulo: "Prioridade A",
      porque: `Pequeno, celular para WhatsApp e ${encaixe.sistema.toLowerCase()}`,
    };
  }

  if (pequeno && (tel || lead.instagram)) {
    return {
      nivel: "B",
      emoji: "🟡",
      rotulo: "Prioridade B",
      porque: tel
        ? "Pequeno e com telefone, mas sem encaixe claro de sistema"
        : "Pequeno, mas só dá para chegar pelo Instagram",
    };
  }

  return {
    nivel: "C",
    emoji: "🔵",
    rotulo: "Prioridade C",
    porque: !tel && !lead.instagram ? "Sem canal de contato" : "Poucos sinais de negócio local",
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
