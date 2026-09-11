import {
  CENARIOS,
  proximaAcao,
  type Cenario,
  type Etapa,
  type Intencao,
  type Perfil,
  type Rodada,
} from "@/lib/demo-automacao/cenarios";

export { ROTULO_INTENCAO, ROTULO_ETAPA, ROTULO_PERFIL, type Intencao, type Etapa, type Perfil } from "@/lib/demo-automacao/cenarios";

/**
 * O LIMITE ABSOLUTO DA DEMONSTRAÇÃO.
 *
 * Dez contatos, nunca mais que isso. Cem contatos custavam cem cópias de
 * estado a cada tique, cem linhas re-renderizadas e uma tabela que ninguém
 * lia até o fim — e o conceito se demonstra igual com dez. O motor nasce com
 * exatamente este número (`gerarContatos` reprova se não bater), a simulação
 * só transforma contatos que já existem, e o contexto de tela descarta
 * qualquer estado salvo que não tenha este tamanho.
 */
export const DEMO_CONTACT_LIMIT = 10;

/**
 * 🧪 O MOTOR DA DEMONSTRAÇÃO — e o muro que o separa da operação real.
 *
 * O QUE ESTE ARQUIVO NÃO IMPORTA, DE PROPÓSITO
 *
 * Nem banco, nem fila, nem Bridge, nem provedor, nem classificador real. Nem
 * tipo. Este módulo não conhece a existência de lead, campanha, mensagem ou
 * worker. Ele não tem COMO atingir a operação real porque não tem por onde:
 * a única coisa que ele sabe fazer é transformar um estado em memória em
 * outro estado em memória.
 *
 * Isso é verificado por teste (`test:automation-demo`), que lê este arquivo
 * — só as linhas de import — e reprova se qualquer uma dessas portas
 * aparecer.
 *
 * POR QUE NÃO USA IA DE VERDADE
 *
 * A demonstração precisa funcionar na frente do cliente, sem chave, sem rede
 * e sem latência. Roteiros por cenário fazem isso sempre; um modelo faz isso
 * às vezes. O motor real, quando existir, entra por trás desta mesma
 * interface (`AutomationDemoProvider`) — o que a tela vê não muda.
 *
 * TUDO AQUI É FICTÍCIO, e é dito na tela em todas as páginas. Nomes são
 * "Cliente 001" até "Cliente 010"; telefones começam com DDD 00, que não
 * existe em lugar nenhum do Brasil.
 */

export type Autor = "cliente" | "ia" | "humano" | "sistema";

export type Mensagem = { id: string; autor: Autor; texto: string; em: string };

export type Contato = {
  id: string;
  nome: string;
  /** Sempre "(00) 9…" — DDD 00 não existe, e é a marca de que é fictício. */
  telefone: string;
  perfil: Perfil;
  cenarioId: string;
  /** Quantas rodadas do roteiro já aconteceram. */
  rodada: number;
  /** A rodada em que o cliente falou e a IA ainda não respondeu. */
  aguardandoIA: boolean;
  intencao: Intencao;
  interesse: Rodada["interesse"];
  etapa: Etapa;
  confianca: number;
  motivo: string;
  atendimentoHumano: boolean;
  foraDoHorario: boolean;
  mensagens: Mensagem[];
  ultimaAtividade: string;
};

export type EstadoDemo = {
  iaAtiva: boolean;
  rodando: boolean;
  contatos: Contato[];
  ciclos: number;
};

/* ═══════════════════════ os dez contatos ═══════════════════════ */

/**
 * Previsível de propósito: os dez contatos são OS MESMOS a cada carregamento.
 * Uma demonstração cujo "Cliente 007" vira outra pessoa no meio da
 * apresentação é uma demonstração que o cliente não confia.
 */
function semente(n: number) {
  let s = n;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const cenarioPorId = new Map(CENARIOS.map((c) => [c.id, c]));

/**
 * OS DEZ, cada um numa situação diferente e com o próprio roteiro.
 *
 * [situação, roteiro, ponto de partida]. O ponto de partida é quantas rodadas
 * já aconteceram quando a tela abre — ou "aguardando": o cliente falou e a IA
 * ainda não respondeu, que é o que dá à simulação algo para responder no
 * primeiro segundo. Rodada 0 é monitorado sem conversa ainda.
 *
 * Os roteiros da apresentação ("Oi, queria saber o valor." e "Quero falar
 * com alguém.") ficam no Cliente 001 e no 007, como combinado. Os demais
 * cenários do catálogo continuam existindo — nada foi apagado — e ficam
 * disponíveis para quem quiser trocar um roteiro aqui.
 */
const OS_DEZ: [string, string, number | "aguardando"][] = [
  ["interessado em preço", "apr-valor", 1],
  ["pronto para contratar", "var-contratar", 1],
  ["quer agendar", "ag-sexta", 1],
  ["com dúvida", "var-explicar", 1],
  ["pesquisando", "var-pesquisando", 0],
  ["recorrente", "rec-denovo", 2],
  ["pediu atendimento humano", "apr-humano", "aguardando"],
  ["sem interesse", "var-outra-empresa", 1],
  ["pede retorno depois", "var-amanha", "aguardando"],
  ["altamente interessado", "var-interesse", 2],
];

function relogio(base: Date, minutosAtras: number): string {
  return new Date(base.getTime() - minutosAtras * 60_000).toISOString();
}

/** Aplica N rodadas do roteiro a um contato recém-criado. */
function jogarRodadas(c: Contato, cenario: Cenario, quantas: number, rnd: () => number, agora: Date): Contato {
  let atual = c;
  let minutos = Math.floor(rnd() * 180) + 5;
  for (let i = 0; i < quantas && i < cenario.rodadas.length; i++) {
    const rod = cenario.rodadas[i];
    const emCliente = relogio(agora, minutos);
    const emIA = relogio(agora, Math.max(0, minutos - 1));
    minutos = Math.max(1, minutos - Math.floor(rnd() * 12) - 2);
    atual = {
      ...atual,
      rodada: i + 1,
      aguardandoIA: false,
      intencao: rod.intencao,
      interesse: rod.interesse,
      etapa: rod.etapa,
      confianca: rod.confianca,
      motivo: rod.motivo,
      atendimentoHumano: rod.etapa === "humano" ? true : atual.atendimentoHumano,
      mensagens: [
        ...atual.mensagens,
        { id: `${c.id}-${i * 2 + 1}`, autor: "cliente", texto: rod.cliente, em: emCliente },
        { id: `${c.id}-${i * 2 + 2}`, autor: "ia", texto: rod.ia, em: emIA },
      ],
      ultimaAtividade: emIA,
    };
  }
  return atual;
}

function contatoBase(n: number, cenario: Cenario, agora: Date, rnd: () => number): Contato {
  const id = String(n).padStart(3, "0");
  return {
    id,
    nome: `Cliente ${id}`,
    telefone: `(00) 9${String(1000 + n).slice(-4)}-${String(n * 37).padStart(4, "0").slice(-4)}`,
    perfil: cenario.perfil,
    cenarioId: cenario.id,
    rodada: 0,
    aguardandoIA: false,
    intencao: "indefinida",
    interesse: "indefinido",
    etapa: "novo",
    confianca: 0,
    motivo: "Ainda não há mensagem para classificar.",
    atendimentoHumano: false,
    foraDoHorario: false,
    mensagens: [],
    ultimaAtividade: relogio(agora, Math.floor(rnd() * 600) + 30),
  };
}

export function gerarContatos(): Contato[] {
  const rnd = semente(2026);
  const agora = new Date();
  const contatos: Contato[] = [];

  OS_DEZ.slice(0, DEMO_CONTACT_LIMIT).forEach(([, cenarioId, partida], i) => {
    const cenario = cenarioPorId.get(cenarioId);
    if (!cenario) throw new Error(`demo: roteiro "${cenarioId}" não existe`);
    const base = contatoBase(i + 1, cenario, agora, rnd);

    if (partida === 0) {
      contatos.push(base);
      return;
    }

    if (partida === "aguardando") {
      const rod = cenario.rodadas[0];
      const em = relogio(agora, Math.floor(rnd() * 20) + 1);
      contatos.push({
        ...base,
        aguardandoIA: true,
        intencao: rod.intencao,
        interesse: rod.interesse,
        etapa: "em-conversa",
        confianca: rod.confianca,
        motivo: rod.motivo,
        mensagens: [{ id: `${base.id}-1`, autor: "cliente", texto: rod.cliente, em }],
        ultimaAtividade: em,
      });
      return;
    }

    contatos.push(jogarRodadas(base, cenario, partida, rnd, agora));
  });

  if (contatos.length !== DEMO_CONTACT_LIMIT) {
    throw new Error(`demo: esperava ${DEMO_CONTACT_LIMIT} contatos, gerou ${contatos.length}`);
  }
  return contatos;
}

export function estadoInicial(): EstadoDemo {
  return { iaAtiva: true, rodando: false, contatos: gerarContatos(), ciclos: 0 };
}

/* ═══════════════════════ o contrato do provedor ═══════════════════════ */

/**
 * O contrato que um provedor de automação cumpre.
 *
 * `demoProvider` é o único que existe hoje. Um futuro `WhatsAppAutomationProvider`
 * cumpriria o mesmo contrato ligando-se ao classificador e à Bridge reais — e a
 * tela não saberia a diferença. É assim que a demonstração vira produto sem
 * reescrever a interface.
 *
 * Todos os métodos são PUROS: recebem estado, devolvem estado. Nada é mutado,
 * nada é persistido aqui — quem persiste é o contexto de tela, no navegador.
 */
export interface AutomationDemoProvider {
  getContacts(estado: EstadoDemo): Contato[];
  getConversation(estado: EstadoDemo, contatoId: string): Contato | null;
  /** O cliente manda algo. Devolve o estado e quem falou. */
  simulateIncomingMessage(estado: EstadoDemo, rnd?: () => number): { estado: EstadoDemo; contatoId: string | null };
  /** A IA responde ao último cliente daquele contato, se puder. */
  sendSimulatedMessage(estado: EstadoDemo, contatoId: string): EstadoDemo;
  classifyIntent(texto: string): Intencao;
  pauseConversation(estado: EstadoDemo, contatoId: string): EstadoDemo;
  resumeConversation(estado: EstadoDemo, contatoId: string): EstadoDemo;
  getMetrics(estado: EstadoDemo): Metricas;
}

export type Metricas = {
  monitorados: number;
  conversasIniciadas: number;
  respondidasPelaIA: number;
  interessados: number;
  orcamentos: number;
  agendamentos: number;
  aguardandoHumano: number;
  humano: number;
  semInteresse: number;
  foraDoHorario: number;
  tempoMedio: string;
  ciclos: number;
};

function classificar(texto: string): Intencao {
  const t = texto.toLowerCase();
  if (/pessoa|atendente|humano|alguém|alguem|problema|reclama/.test(t)) return "humano";
  if (/não tenho interesse|nao tenho interesse|agora não|agora nao|não quero|nao quero/.test(t)) return "sem-interesse";
  if (/quanto|valor|preço|preco|orçamento|orcamento|custa|desconto/.test(t)) return "preco";
  if (/marcar|agendar|vaga|encaix|remarcar|disponib/.test(t)) return "agendar";
  if (/de novo|mesmo do mês|mês passado|voltei|sou eu/.test(t)) return "recorrente";
  if (/hora|abre|fecha|atende|sábado|sabado|hoje|funciona/.test(t)) return "horario";
  if (/onde|endereço|endereco|fica|perto|localiza/.test(t)) return "localizacao";
  if (/pensar|depois|retorno|sócio|socio/.test(t)) return "sem-interesse";
  if (/fazem|serviço|servico|oferece|saber mais|como funciona|trabalham|dúvida|duvida/.test(t)) return "duvida";
  return "indefinida";
}

function simularEntrada(estado: EstadoDemo, rnd: () => number = Math.random) {
  /**
   * Prioridade: quem já está esperando a IA. Depois, quem tem roteiro por
   * jogar. Contatos com humano ou encerrados não recebem simulação — é o
   * mesmo comportamento que se espera de um sistema real.
   */
  const esperando = estado.contatos.filter((c) => c.aguardandoIA && !c.atendimentoHumano);
  if (esperando.length) {
    const alvo = esperando[Math.floor(rnd() * esperando.length)];
    return { estado: { ...estado, ciclos: estado.ciclos + 1 }, contatoId: alvo.id };
  }

  const temRoteiro = (c: Contato) => {
    const cen = cenarioPorId.get(c.cenarioId);
    return cen ? c.rodada < cen.rodadas.length : false;
  };
  const candidatos = estado.contatos.filter((c) => !c.atendimentoHumano && c.etapa !== "encerrado" && temRoteiro(c));

  /**
   * Com dez contatos o roteiro acaba em poucos minutos. Quando acaba, o
   * contato mais parado REABRE: recomeça o próprio roteiro do zero, como um
   * cliente que voltou a chamar. Nunca nasce um 11º contato — a lista é a
   * mesma, e é isso que mantém a demonstração leve para sempre.
   */
  let reaberto: Contato | null = null;
  if (!candidatos.length) {
    const parados = estado.contatos.filter((c) => !c.atendimentoHumano).sort((a, b) => a.ultimaAtividade.localeCompare(b.ultimaAtividade));
    if (!parados.length) return { estado, contatoId: null };
    const velho = parados[0];
    reaberto = {
      ...velho,
      rodada: 0,
      aguardandoIA: false,
      etapa: "novo",
      interesse: "indefinido",
      confianca: 0,
      mensagens: [{ id: `${velho.id}-r${estado.ciclos}`, autor: "sistema", texto: "🔁 O cliente voltou a chamar — nova conversa", em: new Date().toISOString() }],
    };
  }

  const alvo = reaberto ?? candidatos[Math.floor(rnd() * candidatos.length)];
  const cen = cenarioPorId.get(alvo.cenarioId)!;
  const rod = cen.rodadas[alvo.rodada];
  const em = new Date().toISOString();

  const contatos = estado.contatos.map((c) =>
    c.id !== alvo.id
      ? c
      : {
          ...alvo,
          aguardandoIA: true,
          intencao: classificar(rod.cliente),
          confianca: rod.confianca,
          motivo: rod.motivo,
          etapa: alvo.etapa === "novo" ? "em-conversa" : alvo.etapa,
          mensagens: [...alvo.mensagens, { id: `${alvo.id}-c${estado.ciclos}`, autor: "cliente" as const, texto: rod.cliente, em }],
          ultimaAtividade: em,
        },
  );
  return { estado: { ...estado, contatos, ciclos: estado.ciclos + 1 }, contatoId: alvo.id };
}

function responder(estado: EstadoDemo, contatoId: string): EstadoDemo {
  if (!estado.iaAtiva) return estado;
  const em = new Date().toISOString();

  const contatos = estado.contatos.map((c) => {
    if (c.id !== contatoId || c.atendimentoHumano || !c.aguardandoIA) return c;
    const cen = cenarioPorId.get(c.cenarioId);
    if (!cen) return c;
    const rod = cen.rodadas[Math.min(c.rodada, cen.rodadas.length - 1)];

    return {
      ...c,
      rodada: c.rodada + 1,
      aguardandoIA: false,
      intencao: rod.intencao,
      interesse: rod.interesse,
      etapa: rod.etapa,
      confianca: rod.confianca,
      motivo: rod.motivo,
      atendimentoHumano: rod.etapa === "humano",
      mensagens: [
        ...c.mensagens,
        { id: `${c.id}-i${estado.ciclos}`, autor: "ia" as const, texto: rod.ia, em },
        ...(rod.etapa === "humano"
          ? [{ id: `${c.id}-s${estado.ciclos}`, autor: "sistema" as const, texto: "👤 Atendimento humano assumiu · IA pausada nesta conversa", em }]
          : []),
      ],
      ultimaAtividade: em,
    };
  });
  return { ...estado, contatos };
}

function pausar(estado: EstadoDemo, contatoId: string): EstadoDemo {
  const em = new Date().toISOString();
  return {
    ...estado,
    contatos: estado.contatos.map((c) =>
      c.id !== contatoId || c.atendimentoHumano
        ? c
        : {
            ...c,
            atendimentoHumano: true,
            etapa: "humano",
            mensagens: [
              ...c.mensagens,
              { id: `${c.id}-${c.mensagens.length + 1}`, autor: "sistema" as const, texto: "👤 Atendimento humano assumiu · IA pausada nesta conversa", em },
            ],
            ultimaAtividade: em,
          },
    ),
  };
}

function retomar(estado: EstadoDemo, contatoId: string): EstadoDemo {
  return {
    ...estado,
    contatos: estado.contatos.map((c) =>
      c.id !== contatoId ? c : { ...c, atendimentoHumano: false, etapa: c.etapa === "humano" ? "em-conversa" : c.etapa },
    ),
  };
}

function metricas(estado: EstadoDemo): Metricas {
  const c = estado.contatos;
  const iniciadas = c.filter((x) => x.mensagens.some((m) => m.autor === "cliente"));
  return {
    monitorados: c.length,
    conversasIniciadas: iniciadas.length,
    respondidasPelaIA: c.filter((x) => x.mensagens.some((m) => m.autor === "ia")).length,
    interessados: c.filter((x) => x.interesse === "alto" && x.etapa !== "encerrado" && !x.atendimentoHumano).length,
    orcamentos: c.filter((x) => x.intencao === "preco").length,
    agendamentos: c.filter((x) => x.etapa === "agendado").length,
    aguardandoHumano: c.filter((x) => x.intencao === "humano" && !x.atendimentoHumano).length,
    humano: c.filter((x) => x.atendimentoHumano).length,
    semInteresse: c.filter((x) => x.intencao === "sem-interesse").length,
    foraDoHorario: c.filter((x) => x.foraDoHorario).length,
    /**
     * Fixo, porque é demonstração — e em SEGUNDOS, porque é o que a conversa
     * mostra. Um "4m 32s" ao lado de balões respondidos na hora se contradiz
     * na frente do cliente, e contradição é o que derruba uma venda.
     */
    tempoMedio: "8 s",
    ciclos: estado.ciclos,
  };
}

export const demoProvider: AutomationDemoProvider = {
  getContacts: (e) => e.contatos,
  getConversation: (e, id) => e.contatos.find((c) => c.id === id) ?? null,
  simulateIncomingMessage: simularEntrada,
  sendSimulatedMessage: responder,
  classifyIntent: classificar,
  pauseConversation: pausar,
  resumeConversation: retomar,
  getMetrics: metricas,
};

export { proximaAcao };
