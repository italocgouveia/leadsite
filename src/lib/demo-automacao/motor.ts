/**
 * 🧪 O MOTOR DA DEMONSTRAÇÃO — e o muro que o separa da operação real.
 *
 * O QUE ESTE ARQUIVO NÃO IMPORTA, DE PROPÓSITO
 *
 * Nada de `@/lib/db`, `@/lib/fila`, `@/lib/bridge`, `@/lib/providers`. Nem
 * tipo. Este módulo não conhece a existência de lead, campanha, mensagem ou
 * worker. Ele não tem COMO atingir a operação real porque não tem por onde:
 * a única coisa que ele sabe fazer é transformar um estado em memória em
 * outro estado em memória.
 *
 * Isso é verificado por teste (`test:demo`), que lê este arquivo e reprova se
 * qualquer um desses imports aparecer.
 *
 * POR QUE NÃO USA IA DE VERDADE
 *
 * A demonstração precisa funcionar na frente do cliente, sem chave, sem rede
 * e sem latência. Respostas prontas por intenção fazem isso; um modelo faz
 * isso às vezes. O motor real, quando existir, entra por trás desta mesma
 * interface (`AutomationProvider`) — o que a tela vê não muda.
 *
 * TUDO AQUI É FICTÍCIO, e é dito na tela em todas as páginas. Nomes são
 * "Cliente 001" até "Cliente 100"; telefones começam com 00, que não é DDD
 * de lugar nenhum.
 */

export type Intencao =
  | "preco"
  | "horario"
  | "agendar"
  | "localizacao"
  | "servicos"
  | "vou-pensar"
  | "humano"
  | "indefinida";

export type Etapa = "novo" | "em-conversa" | "interessado" | "agendado" | "humano" | "encerrado";

export type Autor = "cliente" | "ia" | "humano" | "sistema";

export type Mensagem = {
  id: string;
  autor: Autor;
  texto: string;
  /** ISO. Fictício também — a demonstração tem seu próprio relógio. */
  em: string;
};

export type Contato = {
  id: string;
  nome: string;
  /** Sempre "(00) 9…" — DDD 00 não existe, e é a marca de que é fictício. */
  telefone: string;
  intencao: Intencao;
  etapa: Etapa;
  interesse: "alto" | "medio" | "baixo" | "indefinido";
  atendidoPelaIA: boolean;
  precisaHumano: boolean;
  atendimentoHumano: boolean;
  agendamento: string | null;
  foraDoHorario: boolean;
  mensagens: Mensagem[];
  ultimaAtividade: string;
};

export type EstadoDemo = {
  iaAtiva: boolean;
  rodando: boolean;
  contatos: Contato[];
  /** Quantas vezes a simulação já rodou — para o dashboard mostrar evolução. */
  ciclos: number;
};

export const ROTULO_INTENCAO: Record<Intencao, string> = {
  preco: "💰 Orçamento",
  horario: "🕐 Horário",
  agendar: "📅 Agendamento",
  localizacao: "📍 Localização",
  servicos: "🛠 Serviços",
  "vou-pensar": "🤔 Vai pensar",
  humano: "👤 Pediu humano",
  indefinida: "❔ Indefinida",
};

export const ROTULO_ETAPA: Record<Etapa, string> = {
  novo: "Novo",
  "em-conversa": "Em conversa",
  interessado: "🔥 Interessado",
  agendado: "📅 Agendado",
  humano: "👤 Humano",
  encerrado: "Encerrado",
};

/* ═══════════════════════ gerador determinístico ═══════════════════════ */

/**
 * Um gerador de números previsível. Os 100 contatos precisam ser os MESMOS a
 * cada carregamento — senão a demonstração muda no meio da apresentação e o
 * cliente vê um "Cliente 047" virar outra pessoa.
 */
function semente(n: number) {
  let s = n;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * A distribuição pedida pela operação. Soma 100.
 *
 *   35 perguntando preço · 20 horário · 15 agendar · 10 localização
 *   8 serviços · 6 vão pensar · 4 pedindo humano · 2 sem classificação
 */
const DISTRIBUICAO: [Intencao, number][] = [
  ["preco", 35],
  ["horario", 20],
  ["agendar", 15],
  ["localizacao", 10],
  ["servicos", 8],
  ["vou-pensar", 6],
  ["humano", 4],
  ["indefinida", 2],
];

const ABERTURAS: Record<Intencao, string[]> = {
  preco: ["Oi, queria saber quanto custa.", "Boa tarde! Qual o valor?", "Vocês passam orçamento por aqui?"],
  horario: ["Vocês atendem hoje?", "Que horas abre?", "Funciona no sábado?"],
  agendar: ["Queria marcar um horário.", "Tem vaga essa semana?", "Como faço para agendar?"],
  localizacao: ["Onde fica?", "Qual o endereço de vocês?", "É perto do centro?"],
  servicos: ["Vocês fazem esse serviço?", "Gostaria de saber mais.", "O que vocês oferecem?"],
  "vou-pensar": ["Vou pensar e te retorno.", "Depois eu vejo, obrigado.", "Deixa eu ver com meu sócio."],
  humano: ["Quero falar com uma pessoa.", "Tem alguém aí?", "Pode me passar para um atendente?"],
  indefinida: ["Oi", "??"],
};

/**
 * As respostas da IA de demonstração, por intenção.
 *
 * São genéricas de propósito: a demonstração não conhece o negócio do cliente
 * que está assistindo, e uma resposta que citasse "nosso corte masculino"
 * quebraria a ilusão na primeira clínica. O que se demonstra é o MECANISMO —
 * entende, responde, classifica, encaminha — não o texto.
 */
export const RESPOSTAS_IA: Record<Intencao, string[]> = {
  preco: [
    "Claro! Posso te ajudar com isso. Você procura esse serviço para você ou para sua empresa?",
    "Com certeza. Para te passar o valor certo, me conta rapidinho o que você precisa?",
  ],
  horario: [
    "Atendemos de segunda a sexta, das 8h às 18h, e sábado até 12h. Quer que eu reserve um horário?",
    "Hoje estamos abertos até as 18h. Posso te encaixar ainda hoje?",
  ],
  agendar: [
    "Perfeito! Tenho horários amanhã de manhã e quinta à tarde. Qual fica melhor?",
    "Vamos marcar. Me diz o melhor dia e período para você.",
  ],
  localizacao: [
    "Ficamos na região central, com estacionamento na porta. Quer que eu te mande a localização?",
    "Estamos bem no centro. Te mando o mapa por aqui mesmo?",
  ],
  servicos: [
    "Sim! Trabalhamos com isso. Me conta um pouco do que você precisa para eu te orientar melhor.",
    "Fazemos, sim. Quer que eu te explique como funciona?",
  ],
  "vou-pensar": [
    "Sem problema! Fico à disposição. Se quiser, te mando um resumo por aqui para facilitar.",
    "Tranquilo. Qualquer dúvida é só chamar — estou por aqui.",
  ],
  humano: [
    "Claro! Vou te passar para um atendente agora. Só um instante.",
    "Entendi. Um atendente vai assumir a conversa em instantes.",
  ],
  indefinida: [
    "Oi! Tudo bem? Como posso te ajudar hoje?",
    "Olá! Me conta o que você precisa e eu te ajudo.",
  ],
};

const FALLBACK = "Vou encaminhar sua solicitação para um atendente.";

function relogio(base: Date, minutosAtras: number): string {
  return new Date(base.getTime() - minutosAtras * 60_000).toISOString();
}

/** Os 100 contatos, sempre iguais. */
export function gerarContatos(): Contato[] {
  const rnd = semente(2026);
  const agora = new Date();
  const contatos: Contato[] = [];
  let n = 0;

  for (const [intencao, quantos] of DISTRIBUICAO) {
    for (let i = 0; i < quantos; i++) {
      n++;
      const id = String(n).padStart(3, "0");
      const aberturas = ABERTURAS[intencao];
      const abertura = aberturas[Math.floor(rnd() * aberturas.length)];
      const minutosAtras = Math.floor(rnd() * 240) + 2;
      const foraDoHorario = n % 33 === 0;

      /** Os primeiros 23 já têm conversa aberta — o resto está "monitorado". */
      const emConversa = n <= 23;
      const mensagens: Mensagem[] = emConversa
        ? [
            { id: `${id}-1`, autor: "cliente", texto: abertura, em: relogio(agora, minutosAtras) },
            {
              id: `${id}-2`,
              autor: "ia",
              texto: RESPOSTAS_IA[intencao][0],
              em: relogio(agora, minutosAtras - 1),
            },
          ]
        : [];

      const etapa: Etapa = !emConversa
        ? "novo"
        : intencao === "humano"
          ? "humano"
          : intencao === "agendar" && n % 2 === 0
            ? "agendado"
            : intencao === "preco" && n % 3 === 0
              ? "interessado"
              : "em-conversa";

      contatos.push({
        id,
        nome: `Cliente ${id}`,
        telefone: `(00) 9${String(1000 + n).slice(-4)}-${String(n * 37).padStart(4, "0").slice(-4)}`,
        intencao,
        etapa,
        interesse:
          intencao === "preco" || intencao === "agendar"
            ? "alto"
            : intencao === "servicos" || intencao === "horario"
              ? "medio"
              : intencao === "indefinida"
                ? "indefinido"
                : "baixo",
        atendidoPelaIA: emConversa && intencao !== "humano",
        precisaHumano: intencao === "humano",
        atendimentoHumano: false,
        agendamento: etapa === "agendado" ? "amanhã, 10:00" : null,
        foraDoHorario,
        mensagens,
        ultimaAtividade: mensagens.at(-1)?.em ?? relogio(agora, minutosAtras),
      });
    }
  }
  return contatos;
}

export function estadoInicial(): EstadoDemo {
  return { iaAtiva: true, rodando: false, contatos: gerarContatos(), ciclos: 0 };
}

/* ═══════════════════════ a interface do provedor ═══════════════════════ */

/**
 * O contrato que um provedor de automação cumpre.
 *
 * `DemoAutomationProvider` é o único que existe hoje. Um futuro
 * `WhatsAppAutomationProvider` cumpriria o mesmo contrato ligando-se ao
 * classificador e à Bridge reais — e a tela não saberia a diferença. É
 * assim que a demonstração vira produto sem reescrever a interface.
 */
export interface AutomationProvider {
  classificar(texto: string): Intencao;
  responder(intencao: Intencao, ctx: { rnd: () => number }): string;
}

export const DemoAutomationProvider: AutomationProvider = {
  classificar(texto) {
    const t = texto.toLowerCase();
    if (/pessoa|atendente|humano|alguém|alguem/.test(t)) return "humano";
    if (/quanto|valor|preço|preco|orçamento|orcamento|custa/.test(t)) return "preco";
    if (/marcar|agendar|vaga|horário livre|disponibilidade/.test(t)) return "agendar";
    if (/hora|abre|fecha|atende|sábado|sabado|hoje|funciona/.test(t)) return "horario";
    if (/onde|endereço|endereco|fica|perto|localiza/.test(t)) return "localizacao";
    if (/pensar|depois|retorno|sócio|socio/.test(t)) return "vou-pensar";
    if (/fazem|serviço|servico|oferece|saber mais|trabalham/.test(t)) return "servicos";
    return "indefinida";
  },
  responder(intencao, { rnd }) {
    const opcoes = RESPOSTAS_IA[intencao];
    return opcoes[Math.floor(rnd() * opcoes.length)] ?? FALLBACK;
  },
};

/* ═══════════════════════ as transições de estado ═══════════════════════ */

const NOVAS_MENSAGENS = [
  "Quanto custa?",
  "Vocês atendem hoje?",
  "Queria marcar um horário.",
  "Tem disponibilidade?",
  "Gostaria de saber mais.",
  "Vocês fazem esse serviço?",
  "Onde fica?",
  "Vou pensar e te aviso.",
];

/**
 * Uma mensagem nova chega. Escolhe um contato, apensa a fala do cliente e
 * classifica. A resposta da IA vem em `responderIA`, separada, para a tela
 * poder mostrar "digitando…" no meio.
 *
 * Retorna o id do contato tocado, ou null se a IA está pausada ou não há
 * ninguém disponível — e nesse caso nada muda, o que é o comportamento
 * correto de um sistema pausado.
 */
export function simularNovaMensagem(
  estado: EstadoDemo,
  rnd: () => number = Math.random,
): { estado: EstadoDemo; contatoId: string | null } {
  const candidatos = estado.contatos.filter((c) => !c.atendimentoHumano && c.etapa !== "encerrado");
  if (!candidatos.length) return { estado, contatoId: null };

  const alvo = candidatos[Math.floor(rnd() * candidatos.length)];
  const texto = NOVAS_MENSAGENS[Math.floor(rnd() * NOVAS_MENSAGENS.length)];
  const intencao = DemoAutomationProvider.classificar(texto);
  const em = new Date().toISOString();

  const contatos = estado.contatos.map((c) =>
    c.id !== alvo.id
      ? c
      : {
          ...c,
          intencao,
          etapa: c.etapa === "novo" ? "em-conversa" : c.etapa,
          precisaHumano: intencao === "humano" || c.precisaHumano,
          mensagens: [...c.mensagens, { id: `${c.id}-${c.mensagens.length + 1}`, autor: "cliente" as const, texto, em }],
          ultimaAtividade: em,
        },
  );
  return { estado: { ...estado, contatos, ciclos: estado.ciclos + 1 }, contatoId: alvo.id };
}

/** A IA responde ao último cliente daquele contato, se puder. */
export function responderIA(estado: EstadoDemo, contatoId: string, rnd: () => number = Math.random): EstadoDemo {
  if (!estado.iaAtiva) return estado;
  const em = new Date().toISOString();

  const contatos = estado.contatos.map((c) => {
    if (c.id !== contatoId || c.atendimentoHumano) return c;
    const ultima = c.mensagens.at(-1);
    if (!ultima || ultima.autor !== "cliente") return c;

    const texto = DemoAutomationProvider.responder(c.intencao, { rnd });
    const etapa: Etapa =
      c.intencao === "humano"
        ? "humano"
        : c.intencao === "agendar"
          ? "agendado"
          : c.intencao === "preco"
            ? "interessado"
            : c.etapa === "novo"
              ? "em-conversa"
              : c.etapa;

    return {
      ...c,
      etapa,
      atendidoPelaIA: c.intencao !== "humano",
      interesse: c.intencao === "preco" || c.intencao === "agendar" ? "alto" : c.interesse,
      agendamento: etapa === "agendado" ? (c.agendamento ?? "amanhã, 10:00") : c.agendamento,
      mensagens: [...c.mensagens, { id: `${c.id}-${c.mensagens.length + 1}`, autor: "ia" as const, texto, em }],
      ultimaAtividade: em,
    };
  });
  return { ...estado, contatos };
}

/**
 * Uma pessoa assume a conversa. A IA para NAQUELE contato — e só nele. É a
 * mesma semântica do `atendimentoHumano` do CRM real: a automação não
 * responde onde um humano está falando.
 */
export function assumirAtendimento(estado: EstadoDemo, contatoId: string): EstadoDemo {
  const em = new Date().toISOString();
  return {
    ...estado,
    contatos: estado.contatos.map((c) =>
      c.id !== contatoId
        ? c
        : {
            ...c,
            atendimentoHumano: true,
            atendidoPelaIA: false,
            etapa: "humano",
            mensagens: [
              ...c.mensagens,
              {
                id: `${c.id}-${c.mensagens.length + 1}`,
                autor: "sistema" as const,
                texto: "IA pausada nesta conversa. Atendimento humano assumiu.",
                em,
              },
            ],
            ultimaAtividade: em,
          },
    ),
  };
}

export function devolverParaIA(estado: EstadoDemo, contatoId: string): EstadoDemo {
  return {
    ...estado,
    contatos: estado.contatos.map((c) =>
      c.id !== contatoId ? c : { ...c, atendimentoHumano: false, atendidoPelaIA: true, etapa: "em-conversa" },
    ),
  };
}

/* ═══════════════════════ os números do painel ═══════════════════════ */

export function indicadores(estado: EstadoDemo) {
  const c = estado.contatos;
  const emConversa = c.filter((x) => x.mensagens.length > 0 && x.etapa !== "encerrado");
  const respondidasIA = c.filter((x) => x.mensagens.some((m) => m.autor === "ia"));
  return {
    monitorados: c.length,
    emConversa: emConversa.length,
    respondidasPelaIA: respondidasIA.length,
    aguardandoHumano: c.filter((x) => x.precisaHumano && !x.atendimentoHumano).length,
    humano: c.filter((x) => x.atendimentoHumano).length,
    interessados: c.filter((x) => x.etapa === "interessado" || x.interesse === "alto").length,
    agendamentos: c.filter((x) => x.etapa === "agendado").length,
    foraDoHorario: c.filter((x) => x.foraDoHorario).length,
    /** Fixo, porque é demonstração: o motor local responde em ~1s. */
    tempoMedio: "< 1 min",
    ciclos: estado.ciclos,
  };
}
