import type { Lead } from "@/lib/db/schema";
import { avaliarSistema } from "@/lib/sistemas";
import { categoriaSingular } from "@/lib/categoria-nome";
import { classificarPorte, ehCategoriaDeGrandePorte } from "@/lib/porte";
import { SEM_SITE } from "@/lib/places/audit";
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
 * ═══ REVISÃO PARA VENDA DE SISTEMA (a régua atual) ═══
 *
 * A revisão anterior tirou o site do topo. Esta muda a PERGUNTA: em vez de
 * "quem tem lacuna digital?", a régua responde "se eu falar com o dono desta
 * empresa, existe solução da ICG Tech que faz sentido oferecer?".
 *
 * Consequências que valem registrar, porque invertem comportamentos antigos:
 *
 *  - "não tem site" caiu para 5 pontos de 120. Continua contando, como sinal
 *    secundário; deixou de ser argumento capaz de levar alguém ao topo.
 *  - "ramo com sistema aplicável" virou o maior peso (25) e vale ZERO sem
 *    encaixe — nicho prioritário sem processo mapeado não pontua.
 *  - ramo de grande porte (banco, hospital, universidade, órgão público) leva
 *    -30 além dos -40 de rede, porque não compra como uma oficina compra.
 *
 * PESOS (positivos somam 120, resultado cortado em 100):
 *
 *   +25 ramo com sistema claramente aplicável
 *   +20 WhatsApp ou celular disponível
 *   +15 negócio local independente
 *   +15 sinais de operação recorrente
 *   +10 Instagram ativo
 *   +10 volume de avaliações
 *   +10 nota boa
 *   +10 processo que pode ser organizado
 *   +5  não possui site próprio
 *
 *   -40 franquia ou rede          -20 sem telefone
 *   -30 ramo de grande porte      -15 inativa      -15 possível duplicata
 *   -10 nenhum sinal de operação comercial
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
  /**
   * Identificador ESTÁVEL do critério.
   *
   * Existe porque o rótulo é texto de tela e muda: renomear "Contato
   * utilizável" para "WhatsApp ou celular disponível" quebrou em silêncio o
   * `qualidadeDoNegocio`, que filtrava por `rotulo.startsWith("Contato")` e
   * passou a somar de volta justamente o eixo que devia excluir. Quem precisa
   * de um critério específico casa por `id`, nunca por texto.
   */
  id: string;
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
 * Sobre a base nova de Uberlândia eles ficam bem mais apertados, e a explicação
 * NÃO é que os leads sejam piores: é que o OpenStreetMap quase não publica
 * telefone na cidade (medido: 171 números em 4.280 estabelecimentos mapeados).
 * Sem telefone o lead perde os 20 pontos de contato E ainda leva -20 de
 * penalidade — uma diferença de 40 pontos, que é o desenho certo para uma
 * régua de prospecção: não adianta ser bom negócio se não há como falar com
 * ele hoje.
 *
 * Mexer nos limiares agora só maquiaria isso: renomearia de "média" para
 * "alta" um lead com quem não há como falar. O número baixo é informação
 * verdadeira sobre a fonte, e o caminho para melhorá-lo é enriquecer contato
 * (ver `precisaEnriquecer`), não afrouxar a régua.
 *
 * Recalibrar quando a base tiver telefone de verdade — os pesos refletem o que
 * importa, os limiares refletem a distribuição.
 */

/**
 * O que só a BASE sabe sobre este lead, e a função pura não tem como saber.
 *
 * Duplicidade é a única coisa aqui: descobrir que dois cadastros são o mesmo
 * lugar exige comparar com todos os outros, e carregar a base inteira dentro
 * de uma função de score a tornaria impossível de testar e lenta de chamar.
 * Quem tem esse contexto (o painel) calcula uma vez e passa o resultado.
 */
export type ContextoLead = {
  possivelDuplicata?: boolean;
};

export function oportunidade(lead: Lead, ctx: ContextoLead = {}): Oportunidade {
  const criterios: Criterio[] = [];
  const add = (id: string, rotulo: string, ganhos: number, maximo: number, base: string) =>
    criterios.push({ id, rotulo, ganhos, maximo, base });

  const classe = classificarPorte(lead);
  const nicho = nichoPrioritario(lead.categoria);
  const encaixe = avaliarSistema(lead);
  const tel = validarTelefone(telefoneDoLead(lead));
  const modulos = encaixe.serve ? encaixe.modulos.length : 0;

  /**
   * ---------- 1. o ramo tem sistema aplicável (0–25) ----------
   *
   * O critério de maior peso, e a mudança de eixo desta régua: a pergunta
   * principal deixou de ser "falta site?" e passou a ser "existe solução da
   * ICG Tech que faz sentido oferecer a esta empresa?".
   *
   * Vale zero sem encaixe. Um ramo prioritário sem processo mapeado não
   * pontua, porque prioridade de nicho sem sistema para vender é lista de
   * empresas, não lista de oportunidades.
   */
  const pot = potencialDoSegmento(lead);
  const pontosNicho = !encaixe.serve
    ? 0
    : nicho?.prioridade === "A"
      ? 25
      : nicho?.prioridade === "B"
        ? 18
        : nicho
          ? 12
          : pot === "alto"
            ? 12
            : pot === "medio"
              ? 8
              : 5;
  add(
    "nicho",
    "Ramo com sistema claramente aplicável",
    pontosNicho,
    25,
    !encaixe.serve
      ? "Nenhum processo mapeado para o ramo"
      : nicho
        ? `${nicho.rotulo} — prioridade ${nicho.prioridade}: ${encaixe.sistema}`
        : `Fora da lista de nichos, mas com encaixe: ${encaixe.sistema}`,
  );

  /**
   * ---------- 2. contato utilizável (0–20) ----------
   *
   * Celular vale mais que fixo porque é o número que atende no WhatsApp — mas
   * formato NÃO prova conta, e nada aqui afirma que o lead tem WhatsApp. É
   * pontuação de probabilidade de alcance, e a prova continua sendo o envio.
   */
  add(
    "contato",
    "WhatsApp ou celular disponível",
    tel ? (tel.tipo === "celular" ? 20 : 10) : 0,
    20,
    tel
      ? tel.tipo === "celular"
        ? "celular — provável WhatsApp, a confirmar no envio"
        : "telefone fixo — pode ter WhatsApp Business"
      : "sem telefone",
  );

  /**
   * ---------- 3. negócio local independente (0–15) ----------
   *
   * São INDÍCIOS, e o rótulo diz isso. O porte declarado continua
   * `desconhecido` (ver lib/porte.ts) — o que se pontua aqui é comportamento
   * observável de negócio independente, não um dado oficial que ninguém apurou.
   */
  add(
    "porte",
    "Negócio local independente",
    classe.rede ? 0 : classe.porteEstimado === "pequeno" ? 15 : classe.sinais.length >= 2 ? 8 : 0,
    15,
    classe.rede
      ? "Rede identificada — não é negócio independente"
      : (classe.sinais.join(", ") || "nenhum sinal identificável"),
  );

  /**
   * ---------- 4. operação recorrente (0–15) ----------
   *
   * O cliente que volta sozinho é o que faz o sistema se pagar: é a base de
   * clientes que já existe e que ninguém consegue chamar de volta hoje. Vale
   * quase tanto quanto o contato porque é o argumento de venda mais forte que
   * se pode ter antes de falar com o dono.
   */
  const temRetorno = encaixe.modulos.includes("retorno") || encaixe.modulos.includes("agendamento");
  add(
    "recorrencia",
    "Sinais de operação recorrente",
    nicho?.recorrente ? 15 : temRetorno ? 10 : 0,
    15,
    nicho?.recorrente
      ? `${nicho.rotulo} — o cliente volta sozinho`
      : temRetorno
        ? "operação com agenda ou retorno"
        : "sem recorrência evidente no ramo",
  );

  // ---------- 5. Instagram ativo (0–10) ----------
  add(
    "instagram",
    "Instagram ativo",
    lead.instagram ? 10 : 0,
    10,
    lead.instagram ? "perfil no Instagram" : "sem Instagram",
  );

  // ---------- 6. volume de avaliações (0–10) ----------
  const av = lead.avaliacoes ?? 0;
  add(
    "avaliacoes",
    "Volume de avaliações",
    av >= 100 ? 10 : av >= 40 ? 7 : av >= 10 ? 4 : av > 0 ? 2 : 0,
    10,
    av > 0 ? `${av} avaliações` : "sem avaliações na fonte",
  );

  // ---------- 7. nota boa (0–10) ----------
  const nota = lead.nota ?? 0;
  add(
    "nota",
    "Nota boa",
    nota >= 4.5 ? 10 : nota >= 4 ? 6 : nota >= 3.5 ? 3 : 0,
    10,
    nota > 0 ? `nota ${nota}` : "sem nota na fonte",
  );

  /**
   * ---------- 8. processo organizável (0–10) ----------
   *
   * Diferente do critério 1: lá se pergunta se o RAMO tem sistema; aqui,
   * quantos processos deste lead o sistema encostaria. Uma oficina com seis
   * módulos (OS, orçamento, histórico, estoque, clientes, financeiro) tem mais
   * superfície de venda do que um ramo com dois.
   */
  add(
    "processo",
    "Processo que pode ser organizado",
    modulos >= 5 ? 10 : modulos >= 3 ? 6 : modulos >= 1 ? 3 : 0,
    10,
    encaixe.serve ? `${modulos} módulos: ${encaixe.modulos.slice(0, 4).join(", ")}` : "nenhum",
  );

  /**
   * ---------- 9. não possui site (0–5) ----------
   *
   * SINAL SECUNDÁRIO, e o peso diz isso: 5 pontos de 120, contra 25 do
   * potencial de sistema. Foi rebaixado de propósito — "não tem site" virou
   * argumento sozinho e empurrava para o topo empresa sem telefone e sem
   * processo nenhum.
   *
   * Instagram, Linktree, iFood e wa.me NÃO são site — quem decide isso é
   * `lib/places/audit.ts`. E `nao-verificado` vale ZERO: não é "não tem site",
   * é "ninguém conferiu", e no OpenStreetMap a ausência da tag `website`
   * significa exatamente isso.
   */
  add(
    "sem-site",
    "Não possui site próprio",
    SEM_SITE.includes(lead.statusSite) ? 5 : lead.statusSite === "sem-ssl" ? 3 : 0,
    5,
    lead.statusSite === "nao-verificado"
      ? "site não conferido — sem pontos por falta de dado"
      : `Status: ${lead.statusSite}`,
  );

  /**
   * ---------- penalidades ----------
   *
   * Franquia não decide software na loja, e ramo de grande porte não compra
   * como uma oficina compra. As duas se somam quando é o caso — um banco é as
   * duas coisas — e é isso que garante que ele nunca chegue perto do topo por
   * ter nota alta e mil avaliações.
   */
  let penalidade = 0;
  const penalizar = (id: string, rotulo: string, pontos: number, base: string) => {
    penalidade += pontos;
    add(id, rotulo, -pontos, 0, base);
  };

  if (classe.rede) penalizar("rede", "Franquia ou rede", 40, classe.motivosRede.join("; "));
  if (ehCategoriaDeGrandePorte(lead.categoria)) {
    penalizar("grande-porte", "Ramo de grande porte", 30, `categoria ${lead.categoria}`);
  }
  if (!tel) {
    penalizar(
      "sem-telefone",
      "Sem telefone",
      20,
      lead.telefone ? "número cadastrado não é telefone brasileiro válido" : "nenhum número",
    );
  }

  /**
   * "Inativa" exige EVIDÊNCIA de que fechou — as tags que o mapa usa para
   * marcar estabelecimento extinto. Deduzir inatividade da falta de dados
   * puniria a base inteira, porque no OpenStreetMap faltar dado é o normal.
   */
  const osm = lead.dadosOsm ?? {};
  const fechado = Object.keys(osm).some((k) => /^(disused|abandoned|was|removed)/i.test(k));
  if (fechado) penalizar("inativa", "Empresa aparentemente inativa", 15, "marcada como extinta no mapa");

  if (ctx.possivelDuplicata) {
    penalizar("duplicata", "Possível duplicata", 15, "outro cadastro na base aparenta ser o mesmo lugar");
  }

  /**
   * Nenhum sinal de operação comercial: um nome solto no mapa. Sem endereço,
   * sem horário, sem avaliação, sem Instagram e sem site não há como afirmar
   * que existe negócio funcionando ali.
   */
  const semOperacao =
    !lead.endereco && !lead.horarios && av === 0 && !lead.instagram && !lead.website;
  if (semOperacao) {
    penalizar("sem-operacao", "Nenhum sinal de operação comercial", 10, "só o nome no mapa");
  }

  /**
   * Os positivos somam 120 e o resultado é cortado em 100. É deliberado: um
   * lead precisa de ~83% dos sinais para cravar 100, então o topo da lista
   * significa alguma coisa em vez de empatar dez empresas em nota máxima.
   */
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

/**
 * Os critérios que formam o eixo de CONTATO. Ficam fora do score comercial.
 *
 * Casado por `id`, nunca por rótulo: renomear o critério de contato já quebrou
 * este filtro uma vez em silêncio, e o sintoma foi a fila de enriquecimento
 * esvaziar sozinha.
 */
const EIXO_CONTATO = new Set(["contato", "sem-telefone"]);

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
  const criterios = oportunidade(lead).criterios.filter((c) => !EIXO_CONTATO.has(c.id));
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

// ══════════════════════════════════════════ qualidade A / B / C / D

export type NivelPrioridade = "A" | "B" | "C" | "D";

export type PrioridadeComercial = {
  nivel: NivelPrioridade;
  emoji: string;
  rotulo: string;
  /** Por que caiu nesse nível — em português, para a tela explicar. */
  porque: string;
};

const ROTULOS: Record<NivelPrioridade, { emoji: string; rotulo: string }> = {
  A: { emoji: "🔥", rotulo: "Excelente oportunidade" },
  B: { emoji: "🟡", rotulo: "Boa oportunidade" },
  C: { emoji: "🔵", rotulo: "Oportunidade baixa" },
  D: { emoji: "⚪", rotulo: "Não recomendado" },
};

/**
 * A gaveta em que o lead cai. Complementa o score, não repete: o score ordena
 * DENTRO da gaveta, a gaveta diz se vale a ligação hoje.
 *
 * A régua combina FATO e NOTA, nessa ordem — primeiro os desqualificadores,
 * que nenhuma pontuação alta derruba, e só depois o score. Um lead com 78 e
 * sem telefone não é "quase A": não dá para falar com ele hoje.
 *
 * REGRA QUE NÃO PODE SER QUEBRADA: "sem site" nunca coloca ninguém em A
 * sozinho. Chegar em A exige encaixe de sistema, celular e sinais de negócio
 * local — ausência de site não substitui nenhum dos três.
 */
export function prioridadeComercial(lead: Lead, ctx: ContextoLead = {}): PrioridadeComercial {
  const classe = classificarPorte(lead);
  const encaixe = avaliarSistema(lead);
  const tel = validarTelefone(telefoneDoLead(lead));
  const score = oportunidade(lead, ctx).score;
  const nicho = nichoPrioritario(lead.categoria);

  const gaveta = (nivel: NivelPrioridade, porque: string): PrioridadeComercial => ({
    nivel,
    ...ROTULOS[nivel],
    porque,
  });

  // ---------- D: não recomendado. Fatos que nenhuma nota reverte ----------
  /**
   * Histórico primeiro, antes de qualquer sinal comercial.
   *
   * Quem pediu para não ser contatado, quem já disse que não tem interesse e
   * quem já tem sistema NÃO são "oportunidade baixa" — são porta fechada, e
   * exibir isso como oportunidade faz alguém gastar uma vaga do teto diário
   * para ouvir o mesmo não de novo.
   *
   * Note que "mensagem-enviada" e "respondeu" NÃO caem aqui: são negócio em
   * andamento, e continuam sendo boa oportunidade — só não para uma campanha
   * NOVA, o que é decidido pela elegibilidade, não por esta gaveta.
   */
  const ENCERRADOS = ["sem-interesse", "ja-tem-sistema", "opt-out", "contato-invalido"];
  if (lead.naoContatar) return gaveta("D", "Pediu para não ser contatado");
  if (ENCERRADOS.includes(lead.etapa)) return gaveta("D", `Já encerrado: ${lead.etapa}`);

  if (classe.rede) return gaveta("D", `Rede ou franquia: ${classe.motivosRede[0]}`);
  if (ehCategoriaDeGrandePorte(lead.categoria)) {
    return gaveta("D", `Ramo de grande porte (${lead.categoria}) — não compra como PME`);
  }
  if (!tel && !lead.instagram) return gaveta("D", "Sem nenhum canal de contato");
  if (!encaixe.serve) {
    return gaveta("D", "Nenhuma solução da ICG Tech se encaixa neste ramo");
  }

  /**
   * ---------- A: excelente ----------
   *
   * As quatro condições juntas descrevem a venda mais provável que existe:
   * negócio pequeno, com processo que o sistema organiza, num ramo que a ICG
   * Tech sabe atender, e com celular para chamar hoje.
   */
  if (
    classe.porteEstimado === "pequeno" &&
    tel?.tipo === "celular" &&
    nicho?.prioridade !== "C" &&
    score >= 70
  ) {
    return gaveta("A", `${encaixe.sistema} · negócio local com celular · score ${score}`);
  }

  // ---------- B: boa ----------
  if (tel && score >= 50) {
    return gaveta(
      "B",
      classe.porteEstimado === "pequeno"
        ? `${encaixe.sistema} · falta volume de sinais para A`
        : `${encaixe.sistema} · poucos indícios de porte pequeno`,
    );
  }

  // ---------- C: baixa ----------
  return gaveta(
    "C",
    !tel
      ? "Só dá para chegar pelo Instagram — precisa enriquecer o contato"
      : `Encaixe existe, mas os sinais comerciais são fracos (score ${score})`,
  );
}

// ══════════════════════════ os três scores, separados ══════════════════

export type Scores = {
  /** Vale a pena vender para esta empresa? Não olha canal nenhum. 0–100. */
  comercial: number;
  /** Quão fácil é chegar nela? Só canal. 0–100. */
  contatabilidade: number;
  /** O de ordenar a lista. NUNCA passa do comercial. 0–100. */
  final: number;
  /** Os critérios que somaram ou tiraram ponto, para a tela explicar. */
  motivos: { criterio: string; pontos: number }[];
};

/**
 * Os três números que o painel mostra, e por que são três.
 *
 * "Score 95" sozinho não diz se a empresa é boa ou se é só fácil de achar. Uma
 * loja de conveniência com WhatsApp, Instagram e mil avaliações é fácil de
 * abordar e não tem o que comprar; uma oficina com processo manual inteiro e
 * só um Instagram é o contrário. Somar os dois num número apaga a diferença
 * exatamente onde ela importa.
 *
 * A REGRA QUE NÃO PODE SER QUEBRADA: `final` nunca é maior que `comercial`.
 * A contatabilidade só MODULA — chega no máximo a confirmar o potencial
 * comercial, nunca a criar potencial que não existe. Um lead comercialmente
 * ruim continua ruim por mais canais que tenha.
 */
export function scores(lead: Lead, ctx: ContextoLead = {}): Scores {
  const o = oportunidade(lead, ctx);

  /**
   * O comercial reaproveita os critérios do score de oportunidade menos o eixo
   * de contato, e é reescalado de 0–80 para 0–100 — senão um lead comercial
   * perfeito nunca passaria de 80 e a régua ficaria comprimida.
   */
  const bruto = o.criterios
    .filter((c) => !EIXO_CONTATO.has(c.id))
    .reduce((s, c) => s + c.ganhos, 0);
  const comercial = Math.max(0, Math.min(100, Math.round((bruto / 80) * 100)));

  const contatabilidade = contactabilidade(lead).score;

  /**
   * O piso de 0,6 existe para a contatabilidade pesar sem dominar: um negócio
   * excelente sem canal nenhum ainda pontua 60% do seu valor comercial (ele
   * vale enriquecimento), e um com todos os canais chega a 100% dele — nunca
   * mais que isso.
   */
  const final = Math.round(comercial * (0.6 + 0.4 * (contatabilidade / 100)));

  return {
    comercial,
    contatabilidade,
    final: Math.max(0, Math.min(comercial, final)),
    motivos: o.criterios
      .filter((c) => c.ganhos !== 0)
      .map((c) => ({ criterio: c.rotulo, pontos: c.ganhos })),
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
