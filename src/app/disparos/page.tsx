"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead, StatusMensagem } from "@/lib/db/schema";
import { categoriaSingular, iconeCategoria } from "@/lib/categoria-nome";
import type { PreviaFiltrada } from "@/lib/disparo";
import { OPCOES_ABORDAGEM, type Abordagem } from "@/lib/abordagem";

/**
 * Disparos automáticos — a ÚNICA tela para preparar, iniciar, pausar e
 * acompanhar disparos.
 *
 * Fluxo: escolher nicho (contagem real, sem limite escondido) → escolher a
 * abordagem → a IA gera uma mensagem PRÓPRIA para cada lead elegível →
 * PREPARAR FILA → INICIAR DISPAROS → o worker da bridge trabalha sozinho.
 *
 * DECISÃO DELIBERADA (revertida de uma versão anterior): a mensagem NÃO é
 * mais um texto único repetido para o lote inteiro. Cada lead recebe uma
 * mensagem gerada por IA especificamente para ele — nome, ramo, cidade,
 * nota do Google, Instagram/site quando existem — nunca inventando fato que
 * não veio do cadastro. Ver `lib/gen/mensagem-prospeccao.ts`. A IA só
 * escreve texto: quem decide QUEM entra na fila continua sendo as mesmas
 * travas de sempre (`lib/fila.ts`), e quem ENVIA continua sendo só o worker
 * da bridge — a IA nunca manda mensagem, nunca controla o worker.
 *
 * /disparar e /automacao continuam existindo só como redirect para cá (ver
 * os arquivos deles) — link salvo ou aba antiga não pode virar 404. Esta
 * tela é a única com botão de "manda agora": nenhum `fetch` daqui dispara
 * mensagem — quem envia é sempre o worker único da bridge
 * (`whatsapp-node/servidor.js`, `puxarFila`), mesmo com esta aba fechada. O
 * navegador só chama rotas que já existiam ou são só-leitura:
 * `/api/disparo/preview` (contagem), `/api/disparo/preview-mensagens`
 * (prévia gerada por IA, não grava nada), `/api/campanhas` (monta e aprova
 * o rascunho — a geração por IA acontece NO SERVIDOR, dentro dessa rota),
 * `/api/automacao/worker` (liga/desliga o loop da bridge), `/api/disparo`
 * DELETE (cancela o que não saiu) e `/api/config` (grava o limite/intervalo/
 * o interruptor mestre).
 */

type SaudeBridge =
  | {
      alcancavel: true;
      whatsappConectado: boolean;
      whatsappEstado: string;
      filaWorkerAtivo: boolean;
      limiteWorkerRestante: number | null;
    }
  | { alcancavel: false };

type StatusWorker = {
  codigo: "rodando" | "aguardando" | "whatsapp-desconectado" | "limite-diario" | "pausado-manualmente" | "erro";
  emoji: string;
  label: string;
};

type Painel = {
  provedorConfigurado: boolean;
  aguardando: number;
  /** Contagem por estado da fila inteira. */
  estados?: Record<string, number>;
  enviadasHoje: number;
  respondidasHoje: number;
  errosHoje: number;
  limiteDiario: number;
  intervaloSegundos: number;
  ultimoEnvio: string | null;
  pode: boolean;
  motivo: string | null;
  esperarSegundos: number;
  proximaMensagem: {
    lead: string;
    cidade: string | null;
    categoria: string | null;
    pontuacao: number | null;
    produto: string | null;
    trecho: string;
  } | null;
  ultimosEnvios: { lead: string; status: StatusMensagem; quando: string; produto: string | null }[];
  horarioPermitido: { ativo: boolean; inicio: string; fim: string };
  bridge: SaudeBridge;
  statusWorker: StatusWorker;
};

type LinhaRascunho = {
  m: { id: string; texto: string; produto: string | null; criadoEm: string };
  lead: Lead;
};

type Amostra = {
  nome: string;
  cidade: string | null;
  oportunidade?: string;
  solucao?: string;
  mensagem?: string;
  erro?: string;
};
/** Espelho de /api/disparo/oportunidades. */
type Oportunidades = {
  encontrados: number;
  elegiveis: number;
  excluidos: number;
  recusas: { motivo: string; quantidade: number }[];
  segmentos: { nome: string; total: number; comWhatsapp: number; elegiveis: number; solucao: string | null }[];
  totais: { leads: number; comWhatsapp: number; elegiveis: number };
  leads: {
    id: string;
    nome: string;
    cidade: string | null;
    segmento: string;
    score: number;
    emoji: string;
    classificacao: string;
    motivos: string[];
    temWhatsapp: boolean;
    temInstagram: boolean;
    temSite: boolean;
    nota: number | null;
    avaliacoes: number | null;
    sistema: string | null;
    modulos: string[];
    dor: string | null;
  }[];
};

type Filtros = {
  somenteWhatsapp: boolean;
  incluirContatados: boolean;
  comInstagram: boolean;
  site: "qualquer" | "com" | "sem";
  notaMinima: string;
  avaliacoesMinimas: string;
  prioridade: "alta" | "media" | "todas";
};

const FILTROS_PADRAO: Filtros = {
  // WhatsApp ligado por padrão: sem número não existe disparo.
  somenteWhatsapp: true,
  incluirContatados: false,
  comInstagram: false,
  site: "qualquer",
  notaMinima: "",
  avaliacoesMinimas: "",
  prioridade: "todas",
};

/** Espelho de /api/campanhas/revisao?id= */
type CardRevisao = {
  mensagemId: string;
  status: StatusMensagem;
  origem: string;
  texto: string;
  lead: {
    id: string;
    nome: string;
    cidade: string | null;
    categoria: string | null;
    temInstagram: boolean;
    temSite: boolean;
    nota: number | null;
    avaliacoes: number | null;
  };
  score: number;
  emoji: string;
  classificacao: string;
  oportunidade: string | null;
  solucaoId: string | null;
  solucaoRotulo: string | null;
};

/** Espelho de /api/campanhas/revisao (lista). */
type CampanhaResultado = {
  id: string;
  nome: string;
  status: string;
  criadoEm: string;
  total: number;
  rascunho: number;
  aprovada: number;
  enviadas: number;
  respondidas: number;
  interessados: number;
  erros: number;
  canceladas: number;
  taxaResposta: number;
  taxaInteresse: number;
  porIntencao: { intencao: string; rotulo: string; emoji: string; quantos: number }[];
};

/** Espelho da resposta de /api/disparo/pre-voo. */
type PreVoo = {
  pode: boolean;
  pendencias: { item: string; ok: boolean; detalhe?: string }[];
  faltando: string[];
  resumo: {
    aprovadas: number;
    rascunhos: number;
    sairaoHoje: number;
    enviadasHoje: number;
    limiteDiario: number;
    intervaloSegundos: number;
    campanhas: string[];
    automacaoAtiva: boolean;
    workerAtivo: boolean;
  };
};

/** Espelho de `EstadoGeracao` em lib/gen/fila-geracao. */
type EstadoGeracao = {
  total: number;
  pendente: number;
  processando: number;
  pronta: number;
  pulada: number;
  erro: number;
  proximaTentativaEm: string | null;
  problemas: { motivo: string; quantos: number }[];
};

type CampanhaPronta = {
  nicho: string;
  abordagem: string;
  quantidade: number;
  campanhaId: string;
  /** Só depois de aprovada as mensagens saem de rascunho para a fila. */
  aprovada?: boolean;
  /** Estado da fila de geração — vem do servidor, não do que a aba fez. */
  estado?: EstadoGeracao;
};

const ROTULO_STATUS: Partial<Record<StatusMensagem, string>> = {
  enviada: "Enviada",
  entregue: "Entregue",
  respondida: "Respondida",
  erro: "Erro",
};

const COR_STATUS: Partial<Record<StatusMensagem, string>> = {
  enviada: "etiqueta-boa",
  entregue: "etiqueta-boa",
  respondida: "etiqueta-alta",
  erro: "etiqueta-alta",
};

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type EstadoCodigo = "rodando" | "pausada" | "sem-fila" | "bridge-erro" | "whatsapp-erro";

const BANNER_POR_ESTADO: Record<EstadoCodigo, string> = {
  rodando: "bg-[var(--verde-fraco)] text-[var(--verde)]",
  pausada: "bg-[var(--ambar-fraco)] text-[var(--ambar)]",
  "sem-fila": "bg-[var(--superficie)] text-[var(--texto-2)]",
  "bridge-erro": "bg-[var(--vermelho-fraco)] text-[var(--vermelho)]",
  "whatsapp-erro": "bg-[var(--vermelho-fraco)] text-[var(--vermelho)]",
};

export default function Disparos() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [rascunhos, setRascunhos] = useState<LinhaRascunho[]>([]);
  const [mostrarRascunhos, setMostrarRascunhos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarInicio, setConfirmarInicio] = useState(false);
  const [contagem, setContagem] = useState(0);

  const [config, setConfig] = useState({
    limiteDiario: 30,
    intervaloSegundos: 90,
    horarioAtivo: false,
    horarioInicio: "08:00",
    horarioFim: "20:00",
  });
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  // ---------- passo 1: nicho ----------
  const [segmento, setSegmento] = useState("");
  const [nichoEscolhido, setNichoEscolhido] = useState(false);
  const [preview, setPreview] = useState<PreviaFiltrada | null>(null);

  // ---------- passo 2: abordagem (define a oferta que a IA vai propor) ----------
  const [abordagem, setAbordagem] = useState<Abordagem>("");
  const [abordagemEscolhida, setAbordagemEscolhida] = useState(false);

  // ---------- prévia: mensagens reais geradas por IA, antes de preparar tudo ----------
  const [amostras, setAmostras] = useState<Amostra[] | null>(null);
  const [gerandoAmostras, setGerandoAmostras] = useState(false);

  // ---------- oportunidades: quem abordar, por quê, e quem ficou de fora ----------
  const [oportunidades, setOportunidades] = useState<Oportunidades | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [carregandoOportunidades, setCarregandoOportunidades] = useState(false);

  // ---------- revisão: os cards da campanha em preparação ----------
  const [cards, setCards] = useState<CardRevisao[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunhoTexto, setRascunhoTexto] = useState("");

  // ---------- campanhas salvas e resultados ----------
  const [campanhasSalvas, setCampanhasSalvas] = useState<CampanhaResultado[] | null>(null);

  /** Null = ainda não escolheu; cai no padrão (o teto diário). */
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [campanhaPronta, setCampanhaPronta] = useState<CampanhaPronta | null>(null);
  /** Resultado da checagem de pré-voo, preenchido ao pedir para iniciar. */
  const [preVoo, setPreVoo] = useState<PreVoo | null>(null);

  function escolherSegmento(v: string) {
    setSegmento(v);
    setQuantidade(null);
    setNichoEscolhido(true);
    setAmostras(null);
    setCampanhaPronta(null);
  }

  function escolherAbordagem(v: Abordagem) {
    setAbordagem(v);
    setAbordagemEscolhida(true);
    setAmostras(null);
    setCampanhaPronta(null);
  }

  /**
   * Recarrega o painel de oportunidades a cada mudança de filtro.
   *
   * É só leitura no servidor (nenhuma IA, nenhuma escrita), então pode rodar
   * a cada clique. O que ele traz de diferente da prévia antiga é o TERCEIRO
   * número: quantos ficaram de fora e por quê. Ver lib/oportunidades.ts.
   */
  const carregarOportunidades = useCallback(async () => {
    setCarregandoOportunidades(true);
    try {
      const q = new URLSearchParams();
      if (segmento) q.set("segmento", segmento);
      q.set("somenteWhatsapp", filtros.somenteWhatsapp ? "1" : "0");
      if (filtros.incluirContatados) q.set("incluirContatados", "1");
      if (filtros.comInstagram) q.set("comInstagram", "1");
      if (filtros.site !== "qualquer") q.set("site", filtros.site);
      if (filtros.notaMinima) q.set("notaMinima", filtros.notaMinima);
      if (filtros.avaliacoesMinimas) q.set("avaliacoesMinimas", filtros.avaliacoesMinimas);
      if (filtros.prioridade !== "todas") q.set("prioridade", filtros.prioridade);
      q.set("quantidade", "200");
      const r = await fetch(`/api/disparo/oportunidades?${q}`).then((x) => x.json());
      setOportunidades(r);
    } finally {
      setCarregandoOportunidades(false);
    }
  }, [segmento, filtros]);

  useEffect(() => {
    void (async () => {
      await carregarOportunidades();
    })();
  }, [carregarOportunidades]);

  const carregarCampanhas = useCallback(async () => {
    const r = await fetch("/api/campanhas/revisao").then((x) => x.json());
    setCampanhasSalvas(r.campanhas ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      await carregarCampanhas();
    })();
  }, [carregarCampanhas]);

  /** Os cards de revisão da campanha em preparação. */
  const carregarCards = useCallback(async (campanhaId: string) => {
    const r = await fetch(`/api/campanhas/revisao?id=${campanhaId}`).then((x) => x.json());
    setCards(r.cards ?? []);
  }, []);

  const carregarPreview = useCallback(async () => {
    const q = new URLSearchParams();
    if (segmento) q.set("segmento", segmento);
    const r = await fetch(`/api/disparo/preview?${q}`).then((x) => x.json());
    setPreview(r);
  }, [segmento]);

  useEffect(() => {
    void (async () => {
      await carregarPreview();
    })();
  }, [carregarPreview]);

  /**
   * Gera só uns poucos exemplos REAIS (leads de verdade, IA de verdade) para
   * a pessoa conferir que está personalizando antes de gastar a chamada por
   * lead do lote inteiro. Não grava nada — ver /api/disparo/preview-mensagens.
   */
  async function gerarAmostras() {
    setGerandoAmostras(true);
    setAmostras(null);
    try {
      const q = new URLSearchParams();
      if (segmento) q.set("segmento", segmento);
      if (abordagem) q.set("produto", abordagem);
      const r = await fetch(`/api/disparo/preview-mensagens?${q}`).then((x) => x.json());
      setAmostras(r.amostras ?? []);
    } finally {
      setGerandoAmostras(false);
    }
  }

  /**
   * Um único `carregarTudo`, não dois `fetch` soltos no efeito: chamar duas
   * funções que fazem `setState` no mesmo efeito é o padrão "cascading" que o
   * lint do React 19 (`set-state-in-effect`) recusa — ver o mesmo cuidado em
   * `components/integracao-whatsapp.tsx`.
   */
  const carregarTudo = useCallback(async () => {
    try {
      const [fila, rascunhosResp] = await Promise.all([
        fetch("/api/automacao/fila").then((r) => r.json()),
        fetch("/api/automacao/mensagens?status=rascunho").then((r) => r.json()),
      ]);
      setPainel(fila);
      setRascunhos(rascunhosResp.mensagens ?? []);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  // Só consulta status — nunca envia. O worker de verdade roda na bridge,
  // mesmo com esta aba fechada; isto é só o relógio que mantém a tela ao vivo.
  useEffect(() => {
    const t = setInterval(() => void carregarTudo(), 15_000);
    return () => clearInterval(t);
  }, [carregarTudo]);

  useEffect(() => {
    const t = setInterval(() => setContagem((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  /**
   * Ajuste de estado DURANTE a renderização, não num efeito — é o padrão que
   * o próprio React recomenda para "resetar estado quando uma prop muda"
   * (https://react.dev/learn/you-might-not-need-an-effect). `useEffect` aqui
   * dispararia o lint `set-state-in-effect` (setState síncrono no corpo do
   * efeito) e ainda gastaria um re-render extra à toa.
   */
  const [ultimoEsperar, setUltimoEsperar] = useState<number | undefined>(undefined);
  if (painel && painel.esperarSegundos !== ultimoEsperar) {
    setUltimoEsperar(painel.esperarSegundos);
    setContagem(painel.esperarSegundos);
  }

  const chaveConfig = painel
    ? `${painel.limiteDiario}|${painel.intervaloSegundos}|${painel.horarioPermitido.ativo}|${painel.horarioPermitido.inicio}|${painel.horarioPermitido.fim}`
    : undefined;
  const [ultimaChaveConfig, setUltimaChaveConfig] = useState<string | undefined>(undefined);
  if (painel && chaveConfig !== ultimaChaveConfig) {
    setUltimaChaveConfig(chaveConfig);
    setConfig({
      limiteDiario: painel.limiteDiario,
      intervaloSegundos: painel.intervaloSegundos,
      horarioAtivo: painel.horarioPermitido.ativo,
      horarioInicio: painel.horarioPermitido.inicio,
      horarioFim: painel.horarioPermitido.fim,
    });
  }

  async function salvarConfig() {
    setSalvandoConfig(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limiteDiario: config.limiteDiario,
          intervaloSegundos: config.intervaloSegundos,
          horarioEnvioAtivo: config.horarioAtivo,
          horarioInicio: config.horarioInicio,
          horarioFim: config.horarioFim,
        }),
      });
      setAviso("Configurações salvas.");
      await carregarTudo();
    } finally {
      setSalvandoConfig(false);
    }
  }

  const rodando = Boolean(painel?.bridge.alcancavel && painel.bridge.filaWorkerAtivo);

  /**
   * `filaWorkerAtivo` (bridge) e `automacaoAtiva` (configuração) são travas
   * INDEPENDENTES — a fila só entrega com as duas ligadas ao mesmo tempo
   * (`podeEnviarAgora` em lib/fila.ts checa `automacaoAtiva` antes de checar
   * a bridge). Sem sincronizar as duas aqui, "Iniciar" ligaria só o painel
   * visual da bridge e o worker ficaria repetindo "Automação pausada" para
   * sempre. Usa a MESMA rota `/api/config` que "Salvar configurações" já usa
   * — nenhuma trava nova, só as duas chaves existentes ligadas juntas.
   */
  async function definirAutomacaoAtiva(ativa: boolean) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automacaoAtiva: ativa }),
    });
  }

  async function acaoWorker(acao: "ligar" | "desligar") {
    setOcupado(true);
    setAviso(null);
    try {
      await definirAutomacaoAtiva(acao === "ligar");
      const r = await fetch("/api/automacao/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      }).then((x) => x.json());
      setAviso(r.erro ?? (acao === "ligar" ? "Disparos iniciados." : "Disparos pausados."));
      await carregarTudo();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Parar agora é mais forte que pausar: além de desligar o worker, cancela
   * o que ainda não saiu (`DELETE /api/disparo` → `pararTudo`, já existente).
   * Pausar mantém a fila intacta para retomar depois.
   */
  async function pararAgora() {
    setOcupado(true);
    setAviso(null);
    try {
      await Promise.all([
        definirAutomacaoAtiva(false),
        fetch("/api/automacao/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "desligar" }),
        }),
      ]);
      const r = await fetch("/api/disparo", { method: "DELETE" }).then((x) => x.json());
      setAviso(`Disparos parados. ${r.canceladas ?? 0} mensagem(ns) pendente(s) cancelada(s).`);
      await Promise.all([carregarTudo(), carregarPreview()]);
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Antes de mostrar a confirmação, roda o pré-voo no servidor.
   *
   * As travas sempre existiram, mas só apareciam DEPOIS de ligar, uma a cada
   * mensagem que não saía. Ligar e ficar adivinhando por que nada acontece é
   * pior que um "não" imediato com o motivo escrito.
   */
  async function pedirConfirmacaoIniciar() {
    if (rodando) {
      setAviso("Automação já está em execução.");
      return;
    }
    setOcupado(true);
    try {
      const r: PreVoo = await fetch("/api/disparo/pre-voo").then((x) => x.json());
      setPreVoo(r);
      setConfirmarInicio(true);
    } catch {
      setAviso("Não consegui verificar as condições de disparo. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarIniciar() {
    // Cinto e suspensório: o botão já fica desabilitado quando `pode` é falso.
    if (preVoo && !preVoo.pode) return;
    setConfirmarInicio(false);
    await acaoWorker("ligar");
  }

  async function acaoMensagem(id: string, acao: "aprovar" | "cancelar") {
    setOcupado(true);
    try {
      await fetch("/api/automacao/mensagens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      await carregarTudo();
    } finally {
      setOcupado(false);
    }
  }

  const nichoLabel = segmento || "Todos os nichos";
  const totalGeral = preview?.segmentos.reduce((s, x) => s + x.total, 0) ?? 0;
  const disponivelGeral = preview?.segmentos.reduce((s, x) => s + x.disponivel, 0) ?? 0;
  const abordagemAtual = OPCOES_ABORDAGEM.find((o) => o.valor === abordagem) ?? OPCOES_ABORDAGEM[0];

  /**
   * Preparar fila usa a MESMA função de campanha que /campanhas já usa —
   * `POST /api/campanhas` com `usarIA: true` monta o rascunho gerando UMA
   * mensagem por lead, no servidor (ver `montarCampanha` em lib/campanha.ts
   * e `lib/gen/mensagem-prospeccao.ts`). `PATCH .../iniciar` aprova. Nenhuma
   * das duas envia: só o worker da bridge, chamando `/api/automacao/fila`,
   * manda mensagem de verdade — e manda exatamente o texto que foi salvo
   * aqui, sem gerar nada de novo na hora do envio.
   */
  /**
   * Gera em LOTES, não numa requisição só.
   *
   * Cada lead é uma ida ao Gemini de ~15-30s; 40 leads não caberiam em
   * requisição nenhuma. Aqui a campanha nasce vazia e o navegador vai
   * pedindo o próximo lote, mostrando o progresso. O progresso fica no
   * banco: se esta aba fechar no meio, a campanha para onde parou e as
   * mensagens já geradas continuam lá — nada é perdido nem duplicado.
   *
   * Continua sem enviar nada: tudo nasce em `rascunho` e só vira fila
   * quando você aprova.
   */
  async function prepararFila() {
    if (!preview || preview.disponivel === 0 || quantidadeEfetiva === 0) return;
    setPreparando(true);
    try {
      const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      const nome = `${nichoLabel} — ${abordagemAtual.rotulo} — ${data}`;

      const criada = await fetch("/api/campanhas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          // Só o lote escolhido — não tudo que a prévia devolveu.
          leadIds: preview.leadIds.slice(0, quantidadeEfetiva),
          produto: abordagem || undefined,
          filtro: { segmento, abordagem },
        }),
      }).then((x) => x.json());

      if (!criada.campanha?.id) throw new Error(criada.erro ?? "Falha ao criar a campanha");

      /**
       * Acabou o trabalho da aba: os leads estão na fila do servidor e a
       * geração já pode andar sem ninguém aqui. O que vem depois é só
       * acompanhamento — ver o `useEffect` de acompanhamento logo abaixo.
       */
      setCampanhaPronta({
        nicho: nichoLabel,
        abordagem: abordagemAtual.rotulo,
        quantidade: 0,
        campanhaId: criada.campanha.id,
      });
      setCards([]);
      setAviso(
        `✓ ${criada.total} lead(s) na fila de geração. ` +
          "Pode fechar esta aba — a geração continua no servidor.",
      );
      setSegmento("");
      setNichoEscolhido(false);
      setAbordagem("");
      setAbordagemEscolhida(false);
      setAmostras(null);
      await Promise.all([carregarTudo(), carregarPreview()]);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Falha ao preparar a campanha.");
    } finally {
      setPreparando(false);
    }
  }

  /**
   * Opções de tamanho do lote, sempre limitadas ao que existe de verdade.
   *
   * Ancoradas no teto diário de envio, não em números redondos: é ele que
   * define quantas mensagens têm serventia hoje. Gerar muito além disso é
   * gastar cota de IA para produzir mensagem que vai envelhecer na fila.
   */
  const opcoesQuantidade = (() => {
    const disp = preview?.disponivel ?? 0;
    const teto = config.limiteDiario;
    const brutas = [teto, teto * 2, teto * 5, disp];
    return [...new Set(brutas.map((n) => Math.min(n, disp)).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    );
  })();

  /** O que vale agora: a escolha, ou o padrão (teto diário), sempre capado. */
  const quantidadeEfetiva = Math.min(
    quantidade ?? config.limiteDiario,
    preview?.disponivel ?? 0,
  );

  /** Campanha cuja geração ainda vale acompanhar. Null = nada a fazer aqui. */
  const campanhaEmGeracao =
    campanhaPronta && !campanhaPronta.aprovada ? campanhaPronta.campanhaId : null;

  /**
   * Acompanha a geração — e, de quebra, ACELERA enquanto a aba está aberta.
   *
   * A diferença para a versão anterior é o papel desta aba. Antes ela era o
   * motor: o laço vivia aqui e fechar a página parava a geração no lead em
   * que estivesse. Agora o trabalho está numa fila no banco, drenada pelo
   * serviço local e pelo cron; este efeito só empurra um lote a mais porque
   * você está olhando e é bom ver andar. Fechar a aba tira a aceleração, não
   * a geração.
   *
   * Por isso ele pode morrer a qualquer momento sem consequência: cada PATCH
   * é independente, e item reservado por uma chamada que sumiu volta sozinho
   * para a fila depois do timeout.
   */
  useEffect(() => {
    if (!campanhaEmGeracao) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Só lê o estado. Responde na hora e nunca deixa a tela sem informação. */
    const olhar = async () => {
      const e: EstadoGeracao = await fetch(
        `/api/campanhas/gerar?id=${campanhaEmGeracao}`,
      ).then((x) => x.json());
      if (!vivo || !e || typeof e.pronta !== "number") return;
      setCampanhaPronta((c) =>
        c && c.campanhaId === campanhaEmGeracao ? { ...c, estado: e, quantidade: e.pronta } : c,
      );
    };

    const passo = async () => {
      if (!vivo) return;
      try {
        /**
         * Lê o estado ANTES de empurrar o lote.
         *
         * O PATCH processa uma leva e pode demorar (ou falhar), e enquanto ele
         * não voltava a tela ficava sem `estado` nenhum — caindo no rótulo
         * otimista "CAMPANHA PRONTA" com zero mensagens, que é a pior coisa
         * que essa tela pode dizer. Um GET barato antes garante que o que
         * aparece é sempre o que o servidor tem.
         */
        await olhar();

        const r = await fetch("/api/campanhas/gerar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campanhaEmGeracao, tamanhoLote: 3 }),
        }).then((x) => x.json());
        if (!vivo) return;

        const estado: EstadoGeracao | undefined = r.estado;
        if (estado) {
          setCampanhaPronta((c) =>
            c && c.campanhaId === campanhaEmGeracao
              ? { ...c, estado, quantidade: estado.pronta }
              : c,
          );
        }

        // Fila zerada: para de pedir. Nada mais vai mudar sozinho.
        // Apareceu card novo pronto: recarrega a revisão para ele surgir na hora.
        if ((estado?.pronta ?? 0) !== (cards?.length ?? 0)) await carregarCards(campanhaEmGeracao);

        if ((estado?.pendente ?? 0) + (estado?.processando ?? 0) === 0) return;

        /**
         * Com cota estourada o servidor já marcou hora para tentar de novo.
         * Insistir de 1,5s em 1,5s só gastaria requisição para ouvir o mesmo
         * "ainda não" — daí o minuto de espera.
         */
        timer = setTimeout(passo, r.pausadoPorCota ? 60_000 : 1_500);
      } catch {
        if (vivo) timer = setTimeout(passo, 15_000);
      }
    };

    void passo();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recarregar cards não deve reiniciar o acompanhamento
  }, [campanhaEmGeracao]);

  /**
   * Ações de UMA mensagem na revisão.
   *
   * Todas passam pelas rotas que já existiam — nenhuma escreve no banco por
   * caminho novo, e nenhuma envia nada. `regenerar` em particular NÃO gera na
   * hora: devolve o lead para a fila de geração, que é a única que conta cota
   * e trata 429.
   */
  async function acaoCard(mensagemId: string, acao: "aprovar" | "cancelar" | "regenerar") {
    setOcupado(true);
    try {
      const r = await fetch("/api/automacao/mensagens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mensagemId, acao }),
      }).then((x) => x.json());
      if (r.erro) setAviso(r.erro);
      else if (acao === "regenerar") setAviso("Voltou para a fila — a IA vai reescrever esta.");
      if (campanhaPronta) await carregarCards(campanhaPronta.campanhaId);
      await carregarTudo();
    } finally {
      setOcupado(false);
    }
  }

  async function salvarEdicao(mensagemId: string) {
    if (rascunhoTexto.trim().length < 10) {
      setAviso("A mensagem ficou curta demais.");
      return;
    }
    setOcupado(true);
    try {
      const r = await fetch("/api/automacao/mensagens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mensagemId, acao: "editar", texto: rascunhoTexto }),
      }).then((x) => x.json());
      setAviso(r.erro ?? "Texto salvo. A IA não sobrescreve mensagem editada à mão.");
      setEditando(null);
      if (campanhaPronta) await carregarCards(campanhaPronta.campanhaId);
    } finally {
      setOcupado(false);
    }
  }

  /** Aprova em lote só o que está pronto — o resto continua em rascunho. */
  async function aprovarTodasProntas() {
    const ids = (cards ?? []).filter((c) => c.status === "rascunho").map((c) => c.mensagemId);
    if (!ids.length) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/automacao/mensagens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao: "aprovar" }),
      }).then((x) => x.json());
      setAviso(`${r.alteradas ?? 0} mensagem(ns) aprovada(s) — ainda sem enviar.`);
      if (campanhaPronta) {
        await carregarCards(campanhaPronta.campanhaId);
        setCampanhaPronta((c) => (c ? { ...c, aprovada: true } : c));
      }
      await carregarTudo();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Aprovar é o passo que transforma rascunho em fila — e é o ÚNICO ponto
   * em que a campanha passa a poder sair. Um clique para o lote inteiro,
   * não mensagem por mensagem.
   */
  async function aprovarCampanha(campanhaId: string) {
    setOcupado(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campanhaId, acao: "iniciar" }),
      }).then((x) => x.json());
      setAviso(r.erro ?? `${r.aprovadas ?? 0} mensagem(ns) aprovada(s) e na fila.`);
      setCampanhaPronta((c) => (c ? { ...c, aprovada: !r.erro } : c));
      await carregarTudo();
    } finally {
      setOcupado(false);
    }
  }

  if (carregando || !painel) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="esqueleto h-96" />
      </main>
    );
  }

  const bridgeOk = painel.bridge.alcancavel;
  const whatsappOk = bridgeOk && painel.bridge.whatsappConectado;
  const filaPronta = painel.aguardando > 0;

  const estado: { codigo: EstadoCodigo; emoji: string; label: string } = !bridgeOk
    ? { codigo: "bridge-erro", emoji: "🔴", label: "Bridge desconectada" }
    : !whatsappOk
      ? { codigo: "whatsapp-erro", emoji: "🔴", label: "WhatsApp desconectado" }
      : rodando
        ? { codigo: "rodando", emoji: "🟢", label: "Disparos rodando" }
        : filaPronta
          ? { codigo: "pausada", emoji: "🟡", label: "Automação pausada" }
          : { codigo: "sem-fila", emoji: "⚪", label: "Nenhuma empresa pronta" };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold sm:text-[28px]">🚀 Disparos</h1>
          <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
            Escolha o nicho e a abordagem — a IA identifica a oportunidade e escreve uma mensagem
            para cada lead.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="etiqueta etiqueta-neutra">{bridgeOk ? "🟢" : "🔴"} Bridge</span>
          <span className="etiqueta etiqueta-neutra">
            {!bridgeOk ? "—" : whatsappOk ? "🟢" : "🟡"} WhatsApp
          </span>
          <span className="etiqueta etiqueta-neutra">
            {rodando ? "🟢" : "🟡"} {rodando ? "Rodando" : "Pausada"}
          </span>
        </div>
      </header>

      <p
        className={`surgir mb-4 rounded-[10px] px-4 py-3 text-center text-[14px] font-medium ${BANNER_POR_ESTADO[estado.codigo]}`}
      >
        {estado.emoji} {estado.label}
      </p>

      {/**
       * Indicadores da operação inteira, do banco.
       *
       * Ficam no topo porque respondem, sem clique nenhum, a pergunta com que
       * se abre esta tela: *tenho com quem falar hoje?* — e o número que
       * importa não é "quantos leads eu tenho", é quantos estão ELEGÍVEIS.
       */}
      {oportunidades && (
        <section className="surgir mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { r: "Leads", v: oportunidades.totais.leads },
            { r: "Com WhatsApp", v: oportunidades.totais.comWhatsapp },
            { r: "Elegíveis", v: oportunidades.totais.elegiveis, destaque: true },
            { r: "Aguardando IA", v: painel.estados?.["rascunho"] ?? 0 },
            { r: "Aprovadas", v: (painel.estados?.["aprovada"] ?? 0) + (painel.estados?.["na-fila"] ?? 0) },
            { r: "Enviadas", v: painel.estados?.["enviada"] ?? 0 },
          ].map((i) => (
            <div
              key={i.r}
              className={`rounded-[10px] px-2.5 py-2.5 text-center ${
                i.destaque ? "bg-[var(--azul-fraco)]" : "bg-[var(--superficie)]"
              }`}
            >
              <p
                className={`text-[19px] font-semibold tabular-nums ${
                  i.destaque ? "text-[var(--azul)]" : ""
                }`}
              >
                {i.v}
              </p>
              <p className="text-[11px] leading-tight text-[var(--texto-3)]">{i.r}</p>
            </div>
          ))}
        </section>
      )}

      {!painel.provedorConfigurado && (
        <p className="surgir mb-6 rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-3 text-[13px] leading-relaxed text-[var(--ambar)]">
          Nenhum provedor de WhatsApp configurado. Aponte a URL da sua bridge em{" "}
          <Link href="/config" className="underline">
            Configurações
          </Link>
          .
        </p>
      )}

      {/* --- rodando: painel ao vivo --- */}
      {rodando ? (
        <section className="cartao surgir mb-6 p-5">
          <p className="text-[15px] font-semibold text-[var(--verde,var(--azul))]">
            🟢 DISPAROS RODANDO
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[12.5px] text-[var(--texto-2)]">Enviados hoje</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {painel.enviadasHoje} / {painel.limiteDiario}
              </p>
            </div>
            <div>
              <p className="text-[12.5px] text-[var(--texto-2)]">Próximo disparo</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {contagem > 0
                  ? `em ${String(Math.floor(contagem / 60)).padStart(2, "0")}:${String(contagem % 60).padStart(2, "0")}`
                  : "agora"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[var(--texto-2)]">
            <span>Intervalo: {painel.intervaloSegundos}s</span>
            <span>Restantes hoje: {Math.max(0, painel.limiteDiario - painel.enviadasHoje)}</span>
          </div>

          {painel.ultimosEnvios[0] && (
            <p className="mt-4 text-[13px] text-[var(--texto-2)]">
              Último envio: <strong className="text-[var(--texto)]">{painel.ultimosEnvios[0].lead}</strong>
              {" — "}
              <span
                className={`etiqueta ${COR_STATUS[painel.ultimosEnvios[0].status] ?? "etiqueta-neutra"}`}
              >
                {ROTULO_STATUS[painel.ultimosEnvios[0].status] ?? painel.ultimosEnvios[0].status}
              </span>
            </p>
          )}

          {painel.proximaMensagem && (
            <p className="mt-1 text-[13px] text-[var(--texto-2)]">
              Próxima empresa:{" "}
              <strong className="text-[var(--texto)]">{painel.proximaMensagem.lead}</strong>
            </p>
          )}

          {!painel.pode && painel.motivo && (
            <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">{painel.motivo}</p>
          )}

          {/**
           * PARAR é o botão grande e não destrutivo: desliga o worker e
           * mantém a fila inteira intacta, para retomar depois. Cancelar a
           * fila é ação separada, menor e explícita — misturar as duas num
           * botão só é como se perde uma campanha inteira num clique com
           * pressa.
           */}
          <button
            onClick={() => acaoWorker("desligar")}
            disabled={ocupado}
            className="btn-perigo mt-5 w-full !py-3.5 !text-[16px]"
          >
            ⛔ PARAR DISPAROS
          </button>
          <p className="mt-2 text-center text-[12px] text-[var(--texto-3)]">
            Interrompe os envios e mantém a fila — dá para retomar de onde parou.
          </p>
          <div className="mt-3 text-center">
            <button
              onClick={pararAgora}
              disabled={ocupado}
              className="text-[12.5px] text-[var(--texto-3)] underline hover:text-[var(--vermelho)]"
            >
              Parar e cancelar a fila inteira
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* --- Passo 1: nicho --- */}
          <section className="cartao surgir mb-6 p-5">
            <p className="mb-1 text-[15px] font-semibold">Passo 1 — Escolha o nicho</p>
            <p className="mb-4 text-[13px] text-[var(--texto-2)]">
              A contagem é real, direto do banco — sem limite escondido.
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                onClick={() => escolherSegmento("")}
                className={`rounded-[12px] px-3 py-3 text-left transition ${
                  nichoEscolhido && !segmento
                    ? "bg-[var(--azul)] text-white"
                    : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                }`}
              >
                <span className="block text-[20px]">🏢</span>
                <span className="mt-1 block text-[13px] font-medium">Todos</span>
                <span
                  className={`block text-[12px] ${nichoEscolhido && !segmento ? "text-white/80" : "text-[var(--texto-3)]"}`}
                >
                  {disponivelGeral} de {totalGeral}
                </span>
              </button>

              {/**
               * Três números por card, não um.
               *
               * "24 leads" sozinho é a promessa que a fila desmente depois:
               * sem WhatsApp não há disparo, e quem já foi contatado também
               * não entra. Mostrar total / com WhatsApp / elegível deixa a
               * conta visível ANTES de escolher, e a dica de solução diz o que
               * se vende para aquele ramo.
               */}
              {(oportunidades?.segmentos ?? [])
                .filter((s) => s.elegiveis > 0)
                .slice(0, 14)
                .map((s) => {
                  const ativo = nichoEscolhido && segmento === s.nome;
                  return (
                    <button
                      key={s.nome}
                      onClick={() => escolherSegmento(s.nome)}
                      className={`rounded-[12px] px-3 py-3 text-left capitalize transition ${
                        ativo
                          ? "bg-[var(--azul)] text-white"
                          : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                      }`}
                    >
                      <span className="block text-[20px]">{iconeCategoria(s.nome)}</span>
                      <span className="mt-1 block text-[13px] font-medium leading-tight">
                        {s.nome}
                      </span>
                      <span
                        className={`mt-1 block text-[11.5px] leading-snug tabular-nums ${
                          ativo ? "text-white/80" : "text-[var(--texto-3)]"
                        }`}
                      >
                        {s.total} leads · {s.comWhatsapp} zap
                        <br />
                        <strong className={ativo ? "text-white" : "text-[var(--texto-2)]"}>
                          {s.elegiveis} elegíveis
                        </strong>
                      </span>
                      {s.solucao && (
                        <span
                          className={`mt-1.5 block text-[11px] normal-case leading-snug ${
                            ativo ? "text-white/75" : "text-[var(--azul)]"
                          }`}
                        >
                          💡 {s.solucao}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {carregandoOportunidades && !oportunidades && (
              <p className="mt-4 text-[13px] text-[var(--texto-3)]">Contando leads…</p>
            )}
            {oportunidades && oportunidades.segmentos.filter((s) => s.elegiveis > 0).length === 0 && (
              <p className="mt-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[13px] text-[var(--texto-2)]">
                Nenhum nicho com lead elegível agora. Busque novos leads em{" "}
                <Link href="/leads" className="underline">
                  Leads
                </Link>{" "}
                ou inclua já contatados nos filtros.
              </p>
            )}
          </section>

          {/* --- filtros: refina quem entra, e mostra quem ficou de fora --- */}
          {nichoEscolhido && (
            <section className="cartao surgir mb-6 p-5">
              <button
                onClick={() => setMostrarFiltros((v) => !v)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-[15px] font-semibold">🔎 Filtrar oportunidades</span>
                <span className="text-[13px] text-[var(--texto-3)]">
                  {mostrarFiltros ? "ocultar" : "abrir"}
                </span>
              </button>

              {oportunidades && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                  <span className="tabular-nums">
                    <strong>{oportunidades.encontrados}</strong> encontrados
                  </span>
                  <span className="tabular-nums text-[var(--azul)]">
                    <strong>{oportunidades.elegiveis}</strong> elegíveis
                  </span>
                  <span className="tabular-nums text-[var(--texto-3)]">
                    {oportunidades.excluidos} excluídos
                  </span>
                  {carregandoOportunidades && (
                    <span className="text-[12px] text-[var(--texto-3)]">atualizando…</span>
                  )}
                </div>
              )}

              {/**
               * Os motivos de exclusão, sempre visíveis — não escondidos atrás
               * do painel de filtros. "31 de 53" sem explicação parece bug; com
               * a lista, vira informação comercial: 8 já receberam contato, 4
               * responderam, 3 estão em negociação.
               */}
              {oportunidades && oportunidades.recusas.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {oportunidades.recusas.map((r) => (
                    <li key={r.motivo} className="text-[12.5px] text-[var(--texto-3)]">
                      🚫 {r.quantidade} {r.motivo.toLowerCase().replace(/\.$/, "")}
                    </li>
                  ))}
                </ul>
              )}

              {mostrarFiltros && (
                <div className="mt-4 space-y-3 border-t border-[var(--linha)] pt-4">
                  <label className="flex items-center gap-2.5 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={filtros.somenteWhatsapp}
                      onChange={(e) =>
                        setFiltros((f) => ({ ...f, somenteWhatsapp: e.target.checked }))
                      }
                    />
                    Somente com WhatsApp
                    <span className="text-[12px] text-[var(--texto-3)]">
                      (sem número não há disparo)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={filtros.incluirContatados}
                      onChange={(e) =>
                        setFiltros((f) => ({ ...f, incluirContatados: e.target.checked }))
                      }
                    />
                    Incluir já contatados
                  </label>

                  <label className="flex items-center gap-2.5 text-[13.5px]">
                    <input
                      type="checkbox"
                      checked={filtros.comInstagram}
                      onChange={(e) =>
                        setFiltros((f) => ({ ...f, comInstagram: e.target.checked }))
                      }
                    />
                    Possui Instagram
                  </label>

                  <div>
                    <p className="mb-1.5 text-[13px] font-medium">Site</p>
                    <div className="flex flex-wrap gap-2">
                      {(["qualquer", "com", "sem"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setFiltros((f) => ({ ...f, site: v }))}
                          className={`rounded-[10px] px-3 py-1.5 text-[13px] capitalize transition ${
                            filtros.site === v
                              ? "bg-[var(--azul)] text-white"
                              : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                          }`}
                        >
                          {v === "qualquer" ? "Qualquer" : v === "com" ? "Com site" : "Sem site"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="text-[13px]">
                      <span className="mb-1 block font-medium">Nota mínima</span>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={filtros.notaMinima}
                        onChange={(e) =>
                          setFiltros((f) => ({ ...f, notaMinima: e.target.value }))
                        }
                        placeholder="—"
                        className="w-24 rounded-[10px] bg-[var(--superficie)] px-3 py-1.5 text-[13.5px]"
                      />
                    </label>
                    <label className="text-[13px]">
                      <span className="mb-1 block font-medium">Avaliações mínimas</span>
                      <input
                        type="number"
                        min={0}
                        value={filtros.avaliacoesMinimas}
                        onChange={(e) =>
                          setFiltros((f) => ({ ...f, avaliacoesMinimas: e.target.value }))
                        }
                        placeholder="—"
                        className="w-24 rounded-[10px] bg-[var(--superficie)] px-3 py-1.5 text-[13.5px]"
                      />
                    </label>
                  </div>

                  {/**
                   * O corte por prioridade usa o score que já existe
                   * (lib/pontuacao). É PALPITE INTERNO, não dado externo — e o
                   * texto abaixo diz isso, porque um número de 0 a 100 na tela
                   * é lido como verdade se ninguém avisar o contrário.
                   */}
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium">🎯 Priorizar oportunidades</p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["alta", "🔥 Alta"],
                          ["media", "🟡 Média"],
                          ["todas", "⚪ Todas"],
                        ] as const
                      ).map(([v, r]) => (
                        <button
                          key={v}
                          onClick={() => setFiltros((f) => ({ ...f, prioridade: v }))}
                          className={`rounded-[10px] px-3 py-1.5 text-[13px] transition ${
                            filtros.prioridade === v
                              ? "bg-[var(--azul)] text-white"
                              : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[12px] text-[var(--texto-3)]">
                      Prioridade calculada a partir dos dados do cadastro (ramo, presença digital,
                      histórico). É palpite interno para ordenar a fila — não é nota do Google.
                    </p>
                  </div>

                  <button
                    onClick={() => setFiltros(FILTROS_PADRAO)}
                    className="btn-secundario"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </section>
          )}

          {/* --- Passo 2: abordagem --- */}
          {nichoEscolhido && (
            <section className="cartao surgir mb-6 p-5">
              <p className="mb-1 text-[15px] font-semibold">Passo 2 — Escolha a abordagem</p>
              <p className="mb-4 text-[13px] text-[var(--texto-2)]">
                Define o que a IA vai oferecer. A mensagem em si é escrita individualmente para
                cada lead — isto só define a oferta.
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {OPCOES_ABORDAGEM.map((o) => (
                  <button
                    key={o.valor}
                    onClick={() => escolherAbordagem(o.valor)}
                    className={`rounded-[12px] px-3.5 py-3 text-left transition ${
                      abordagemEscolhida && abordagem === o.valor
                        ? "bg-[var(--azul)] text-white"
                        : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                    }`}
                  >
                    <span className="text-[14px] font-medium">
                      {o.emoji} {o.rotulo}
                    </span>
                    <span
                      className={`block text-[12px] ${
                        abordagemEscolhida && abordagem === o.valor ? "text-white/80" : "text-[var(--texto-3)]"
                      }`}
                    >
                      {o.descricao}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* --- prévia + preparar fila --- */}
          {nichoEscolhido && abordagemEscolhida && preview && (
            <section className="cartao surgir mb-6 p-5">
              <p className="mb-3 text-[15px] font-semibold">Campanha</p>
              <dl className="space-y-2.5 text-[13.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Nicho</dt>
                  <dd className="truncate text-right font-medium capitalize">{nichoLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Abordagem</dt>
                  <dd className="text-right font-medium">
                    {abordagemAtual.emoji} {abordagemAtual.rotulo}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Leads encontrados</dt>
                  <dd className="text-right font-medium tabular-nums">{preview.totalNoNicho}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Disponíveis</dt>
                  <dd className="text-right font-medium tabular-nums">{preview.disponivel}</dd>
                </div>
              </dl>

              {/**
               * Quantos leads entram NESTA campanha.
               *
               * Antes não existia: o botão mandava tudo que a prévia devolvia,
               * até 300. E 300 é um pedido que não se realiza — é uma chamada
               * de IA por lead (a cota gratuita não cobre) para alimentar um
               * teto de envio de 30/dia. O resultado prático foi uma fila de
               * 300 itens travada e nenhuma mensagem para aprovar.
               *
               * O padrão é o teto diário: o lote que de fato sai hoje.
               */}
              <div className="mt-4 border-t border-[var(--linha)] pt-4">
                <p className="mb-2 text-[13px] font-medium">Quantos leads nesta campanha</p>
                <div className="flex flex-wrap gap-2">
                  {opcoesQuantidade.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuantidade(q)}
                      className={`rounded-[10px] px-3.5 py-2 text-[13.5px] font-medium tabular-nums transition ${
                        quantidadeEfetiva === q
                          ? "bg-[var(--azul)] text-white"
                          : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                  {quantidadeEfetiva > config.limiteDiario
                    ? `Seu teto de envio é ${config.limiteDiario}/dia — o que passar disso fica esperando na fila.`
                    : `Cabe no seu teto de ${config.limiteDiario}/dia. É uma chamada de IA por lead.`}
                </p>
              </div>

              <div className="mt-4 border-t border-[var(--linha)] pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium">Prévia das mensagens (geradas por IA)</p>
                  <button
                    onClick={gerarAmostras}
                    disabled={gerandoAmostras || preview.disponivel === 0}
                    className="btn-secundario"
                  >
                    {gerandoAmostras
                      ? "Gerando…"
                      : amostras
                        ? "Gerar de novo"
                        : "Ver prévia de mensagens"}
                  </button>
                </div>

                {amostras && amostras.length > 0 && (
                  <div className="space-y-3">
                    {amostras.map((a, i) => (
                      <div key={i} className="rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
                        <p className="text-[13px] font-semibold">
                          {a.nome}
                          {a.cidade ? (
                            <span className="font-normal text-[var(--texto-3)]"> — {a.cidade}</span>
                          ) : null}
                        </p>

                        {a.erro ? (
                          <p className="mt-1.5 text-[12.5px] text-[var(--vermelho)]">
                            Falhou: {a.erro}
                          </p>
                        ) : (
                          <>
                            <dl className="mt-2 space-y-1 text-[12.5px]">
                              <div className="flex gap-2">
                                <dt className="shrink-0 text-[var(--texto-3)]">Oportunidade:</dt>
                                <dd className="text-[var(--texto-2)]">{a.oportunidade}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="shrink-0 text-[var(--texto-3)]">Solução:</dt>
                                <dd className="font-medium text-[var(--azul)]">{a.solucao}</dd>
                              </div>
                            </dl>
                            <p className="mt-2 whitespace-pre-line border-t border-[var(--linha)] pt-2 text-[13.5px] leading-relaxed">
                              {a.mensagem}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                    <p className="text-[12px] text-[var(--texto-3)]">
                      A IA analisa cada lead e escolhe a solução — sistema e automação vêm antes de
                      site. Estes 3 são exemplo; ao aprovar, o lote inteiro é gerado um a um.
                    </p>
                  </div>
                )}

                {amostras && amostras.length === 0 && (
                  <p className="text-[13px] text-[var(--texto-2)]">
                    Nenhum lead disponível para gerar prévia agora.
                  </p>
                )}
              </div>

              {/**
               * Aprovação é da CAMPANHA, não de mensagem por mensagem: um
               * clique libera o lote inteiro. A revisão individual continua
               * existindo lá embaixo, mas só para rascunho avulso criado
               * fora deste fluxo.
               */}
              <button
                onClick={prepararFila}
                disabled={preparando || preview.disponivel === 0}
                className="btn-primario mt-5 w-full !py-3.5 !text-[16px]"
              >
                {preparando ? "Enfileirando…" : `GERAR MENSAGENS (${quantidadeEfetiva} leads)`}
              </button>
              <p className="mt-2 text-center text-[12px] text-[var(--texto-3)]">
                Os leads entram numa fila no servidor. A geração roda sozinha, uma chamada de IA
                por lead — você pode fechar esta aba. Nada é enviado nesta etapa.
              </p>
              {preview.disponivel === 0 && (
                <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
                  Nenhuma empresa disponível para esse nicho agora.
                </p>
              )}
            </section>
          )}

          {/* --- campanha pronta: iniciar --- */}
          {campanhaPronta && (
            <section className="cartao surgir mb-6 p-5">
              {(() => {
                const e = campanhaPronta.estado;
                /**
                 * Sem estado ainda = "carregando", NUNCA "pronta".
                 *
                 * A versão anterior só diferenciava gerando/pronta, e com
                 * `estado` indefinido caía no otimista: a tela anunciava
                 * "🟢 CAMPANHA PRONTA — 0 leads" enquanto o servidor tinha 317
                 * na fila e nada gerado. Anunciar sucesso que não existe é bem
                 * pior do que não anunciar nada.
                 */
                if (!e) {
                  return (
                    <p className="text-[16px] font-semibold text-[var(--texto-2)]">
                      … CARREGANDO ESTADO
                    </p>
                  );
                }
                const faltam = e.pendente + e.processando;
                const esperandoCota = Boolean(e.proximaTentativaEm) && e.pronta === 0;
                return (
                  <p
                    className={`text-[16px] font-semibold ${
                      faltam > 0 ? "text-[var(--texto-2)]" : "text-[var(--verde,var(--azul))]"
                    }`}
                  >
                    {esperandoCota
                      ? "⏸ AGUARDANDO COTA DA IA"
                      : faltam > 0
                        ? `⏳ GERANDO — ${e.pronta} de ${e.total}`
                        : "🟢 CAMPANHA PRONTA"}
                  </p>
                );
              })()}
              <dl className="mt-3 space-y-2 text-[13.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Nicho</dt>
                  <dd className="text-right font-medium capitalize">{campanhaPronta.nicho}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Abordagem</dt>
                  <dd className="text-right font-medium">{campanhaPronta.abordagem}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--texto-2)]">Quantidade</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {campanhaPronta.quantidade} leads
                  </dd>
                </div>
              </dl>
              {campanhaPronta.estado && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--azul)] transition-[width] duration-500"
                      style={{
                        width: `${
                          campanhaPronta.estado.total
                            ? Math.round(
                                (campanhaPronta.estado.pronta / campanhaPronta.estado.total) * 100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] tabular-nums text-[var(--texto-3)]">
                    {campanhaPronta.estado.pronta} pronta(s) · {campanhaPronta.estado.pendente} na
                    fila
                    {campanhaPronta.estado.processando > 0 &&
                      ` · ${campanhaPronta.estado.processando} gerando`}
                    {campanhaPronta.estado.pulada > 0 &&
                      ` · ${campanhaPronta.estado.pulada} pulado(s)`}
                    {campanhaPronta.estado.erro > 0 && ` · ${campanhaPronta.estado.erro} com erro`}
                  </p>
                  {/**
                   * Item adiado por cota tem hora marcada para voltar. Mostrar
                   * isso é o que separa "está esperando" de "travou" — sem a
                   * hora, uma fila parada por cota parece uma fila quebrada.
                   */}
                  {campanhaPronta.estado.proximaTentativaEm && (
                    <p className="mt-1 text-[12px] text-[var(--texto-3)]">
                      Cota do Gemini atingida. Volta a gerar às{" "}
                      {new Date(campanhaPronta.estado.proximaTentativaEm).toLocaleTimeString(
                        "pt-BR",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                      . Nenhum lead foi perdido.
                    </p>
                  )}
                  {campanhaPronta.estado.problemas.map((p) => (
                    <p key={p.motivo} className="mt-1 text-[12px] text-[var(--texto-3)]">
                      {p.quantos}× {p.motivo}
                    </p>
                  ))}
                </div>
              )}

              <p className="mt-3 rounded-[10px] bg-[var(--azul-fraco)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--azul)]">
                {campanhaPronta.estado && campanhaPronta.estado.pendente > 30
                  ? `${campanhaPronta.estado.pendente} leads na fila é muito para um dia: é uma chamada de IA por lead, e o teto de envio é ${config.limiteDiario}/dia. Vale cancelar e refazer com um lote menor.`
                  : "Cada lead recebe uma mensagem própria, gerada por IA — não é o mesmo texto repetido. A fila roda no servidor: fechar esta aba não interrompe nada."}
              </p>

              {/**
               * REVISÃO — um card por lead, com o raciocínio da IA à vista.
               *
               * Antes só existia o número "20 mensagens" e um botão de aprovar
               * o lote. Aprovar 20 textos que ninguém leu, para 20 WhatsApp de
               * estranhos, é o tipo de clique que só se descobre errado depois.
               * Aqui cada card mostra POR QUE aquele lead, QUAL oportunidade a
               * IA viu e O QUE ela decidiu oferecer, antes do texto.
               */}
              {cards && cards.length > 0 && (
                <div className="mt-5 border-t border-[var(--linha)] pt-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold">
                      Revisão — {cards.filter((c) => c.status !== "rascunho").length} de{" "}
                      {cards.length} aprovadas
                    </p>
                    {cards.some((c) => c.status === "rascunho") && (
                      <button
                        onClick={aprovarTodasProntas}
                        disabled={ocupado}
                        className="btn-secundario"
                      >
                        ✓ Aprovar todas prontas
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {cards.map((c) => (
                      <article
                        key={c.mensagemId}
                        className={`rounded-[12px] px-3.5 py-3 ${
                          c.status === "rascunho"
                            ? "bg-[var(--superficie)]"
                            : "bg-[var(--verde-fraco,var(--azul-fraco))]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-[14px] font-semibold">
                            {iconeCategoria(c.lead.categoria ?? "")} {c.lead.nome}
                            {c.lead.cidade && (
                              <span className="font-normal text-[var(--texto-3)]">
                                {" "}
                                — {c.lead.cidade}
                              </span>
                            )}
                          </p>
                          <span className="text-[12.5px] tabular-nums text-[var(--texto-3)]">
                            {c.emoji} {c.score}/100
                          </span>
                        </div>

                        {c.oportunidade && (
                          <p className="mt-2 text-[12.5px] leading-relaxed">
                            <span className="text-[var(--texto-3)]">🎯 Oportunidade </span>
                            {c.oportunidade}
                          </p>
                        )}
                        {c.solucaoRotulo && (
                          <p className="mt-1 text-[12.5px] leading-relaxed">
                            <span className="text-[var(--texto-3)]">💡 Solução </span>
                            {c.solucaoRotulo}
                          </p>
                        )}

                        {editando === c.mensagemId ? (
                          <div className="mt-2.5">
                            <textarea
                              value={rascunhoTexto}
                              onChange={(e) => setRascunhoTexto(e.target.value)}
                              rows={6}
                              className="w-full rounded-[10px] bg-[var(--fundo)] px-3 py-2.5 text-[13px] leading-relaxed"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => salvarEdicao(c.mensagemId)}
                                disabled={ocupado}
                                className="btn-primario"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditando(null)}
                                className="btn-secundario"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2.5 whitespace-pre-wrap rounded-[10px] bg-[var(--fundo)] px-3 py-2.5 text-[13px] leading-relaxed">
                            {c.texto}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {c.status === "rascunho" ? (
                            <>
                              <button
                                onClick={() => acaoCard(c.mensagemId, "aprovar")}
                                disabled={ocupado || editando === c.mensagemId}
                                className="btn-secundario"
                              >
                                ✓ Aprovar
                              </button>
                              <button
                                onClick={() => {
                                  setEditando(c.mensagemId);
                                  setRascunhoTexto(c.texto);
                                }}
                                disabled={ocupado}
                                className="btn-secundario"
                              >
                                ✎ Editar
                              </button>
                              <button
                                onClick={() => acaoCard(c.mensagemId, "regenerar")}
                                disabled={ocupado || c.origem === "manual"}
                                title={
                                  c.origem === "manual"
                                    ? "Editada à mão — regenerar apagaria seu texto"
                                    : "A IA escreve outra versão"
                                }
                                className="btn-secundario"
                              >
                                ↻ IA
                              </button>
                              <button
                                onClick={() => acaoCard(c.mensagemId, "cancelar")}
                                disabled={ocupado}
                                className="ml-auto text-[12.5px] text-[var(--texto-3)] underline"
                              >
                                ✕ Rejeitar
                              </button>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-[var(--texto-3)]">
                              ✓ Aprovada — na fila, esperando o worker
                            </span>
                          )}
                          {c.origem === "manual" && (
                            <span className="text-[11.5px] text-[var(--texto-3)]">
                              ✎ editada por você
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {!campanhaPronta.aprovada && (
                <>
                  <button
                    onClick={() => aprovarCampanha(campanhaPronta.campanhaId)}
                    disabled={ocupado || campanhaPronta.quantidade === 0}
                    className="btn-primario mt-4 w-full !py-3.5 !text-[16px]"
                  >
                    ✓ APROVAR CAMPANHA ({campanhaPronta.quantidade} mensagens)
                  </button>
                  {/**
                   * Botão desabilitado precisa dizer POR QUE, senão vira
                   * "não dá pra clicar". Com zero mensagens prontas não há o
                   * que aprovar, e o motivo quase sempre é a cota da IA.
                   */}
                  <p className="mt-2 text-center text-[12px] text-[var(--texto-3)]">
                    {campanhaPronta.quantidade === 0
                      ? campanhaPronta.estado?.proximaTentativaEm
                        ? `Nenhuma mensagem pronta ainda — a cota da IA foi atingida. A fila volta a gerar às ${new Date(
                            campanhaPronta.estado.proximaTentativaEm,
                          ).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })} e o botão libera sozinho. Nenhum lead foi perdido.`
                        : "Nenhuma mensagem pronta ainda. O botão libera assim que a primeira sair."
                      : (campanhaPronta.estado?.pendente ?? 0) > 0
                        ? `Dá para aprovar as ${campanhaPronta.quantidade} já prontas — o resto continua gerando e entra depois.`
                        : "As mensagens estão em rascunho. Aprovar move todas para a fila de uma vez — ainda sem enviar."}
                  </p>
                </>
              )}

              {campanhaPronta.aprovada && filaPronta && (
                <>
                  <button
                    onClick={pedirConfirmacaoIniciar}
                    disabled={ocupado || !bridgeOk || !whatsappOk}
                    className="btn-primario mt-4 w-full !py-3.5 !text-[16px]"
                  >
                    ▶ INICIAR DISPAROS
                  </button>
                  {(!bridgeOk || !whatsappOk) && (
                    <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
                      {!bridgeOk
                        ? "A bridge precisa estar acessível para iniciar."
                        : "O WhatsApp precisa estar conectado para iniciar."}
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      {confirmarInicio && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => setConfirmarInicio(false)}
        >
          <div
            className="cartao w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-inicio-titulo"
          >
            <h2 id="confirmar-inicio-titulo" className="text-[18px] font-semibold leading-snug">
              {preVoo?.pode
                ? "Você está prestes a iniciar os disparos."
                : "Ainda não dá para iniciar."}
            </h2>

            {/**
             * A lista inteira, não só o que falta: ver os itens verdes é o que
             * dá confiança de que a checagem realmente rodou, e quando algo
             * falha você enxerga na hora se é a bridge, o teto ou a aprovação.
             */}
            <ul className="mt-4 space-y-1.5 text-[13.5px]">
              {preVoo?.pendencias.map((p) => (
                <li key={p.item} className="flex gap-2">
                  <span className={p.ok ? "text-[var(--verde,var(--azul))]" : "text-[var(--vermelho,#c0392b)]"}>
                    {p.ok ? "✓" : "✗"}
                  </span>
                  <span>
                    <strong className="text-[var(--texto)]">{p.item}</strong>
                    {p.detalhe && <span className="text-[var(--texto-2)]"> — {p.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>

            {preVoo?.pode && (
              <div className="mt-4 rounded-[10px] bg-[var(--azul-fraco)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--azul)]">
                Saem hoje: <strong>{preVoo.resumo.sairaoHoje} empresas</strong>, uma a cada{" "}
                {preVoo.resumo.intervaloSegundos}s.
                {preVoo.resumo.campanhas.length > 0 && (
                  <> Campanha: {preVoo.resumo.campanhas.join(", ")}.</>
                )}
              </div>
            )}

            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--texto-2)]">
              {preVoo?.pode
                ? "Depois de iniciar, o sistema continua enviando sozinho até bater o limite ou acabar a fila — mesmo com esta página fechada. O botão PARAR interrompe a qualquer momento sem perder a fila."
                : "Nada será enviado enquanto os itens acima não estiverem resolvidos. Nenhuma mensagem é perdida — a fila continua esperando."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={confirmarIniciar}
                disabled={ocupado || !preVoo?.pode}
                className="btn-primario"
              >
                ▶ Iniciar
              </button>
              <button
                onClick={() => setConfirmarInicio(false)}
                disabled={ocupado}
                className="btn-secundario ml-auto"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <p className="surgir mb-6 rounded-[10px] bg-[var(--azul-fraco)] px-4 py-2.5 text-[14px] text-[var(--azul)]">
          {aviso}
        </p>
      )}

      {/**
       * MINHAS CAMPANHAS — o resultado de cada lote, com números reais.
       *
       * "Interessados" não é classificação nova: reaproveita a intenção que
       * lib/classificar.ts já grava no lead quando ele responde. Criar um
       * segundo motor de classificação daria dois números divergentes para a
       * mesma pergunta, e nenhum dos dois seria confiável.
       */}
      {campanhasSalvas && campanhasSalvas.length > 0 && (
        <section className="cartao surgir mb-6 p-5">
          <p className="mb-3 text-[15px] font-semibold">📁 Minhas campanhas</p>
          <div className="space-y-2.5">
            {campanhasSalvas.slice(0, 6).map((c) => (
              <div key={c.id} className="rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13.5px] font-medium">{c.nome}</p>
                  <span className="text-[12px] text-[var(--texto-3)]">
                    {new Date(c.criadoEm).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] tabular-nums text-[var(--texto-2)]">
                  {c.total} leads · {c.enviadas} enviadas · {c.respondidas} respostas
                  {c.interessados > 0 && ` · ${c.interessados} interessados`}
                  {c.erros > 0 && ` · ${c.erros} erros`}
                </p>
                {c.enviadas > 0 && (
                  <p className="mt-0.5 text-[12px] text-[var(--texto-3)] tabular-nums">
                    taxa de resposta {c.taxaResposta}%
                    {c.respondidas > 0 && ` · interesse ${c.taxaInteresse}%`}
                  </p>
                )}
                {c.porIntencao.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-[var(--texto-3)]">
                    {c.porIntencao.map((i) => (
                      <span key={i.intencao}>
                        {i.emoji} {i.quantos} {i.rotulo.toLowerCase()}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- estados da fila: onde está cada mensagem, sem abrir o banco --- */}
      {painel.estados && (
        <section className="cartao surgir mb-4 p-5">
          <p className="mb-3 text-[14px] font-semibold">Estados da fila</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {(
              [
                ["Rascunho", "rascunho"],
                ["Aprovada", "aprovada"],
                ["Aguardando", "na-fila"],
                ["Enviada", "enviada"],
                ["Erro", "erro"],
                ["Cancelada", "cancelada"],
              ] as [string, string][]
            ).map(([rotulo, chave]) => (
              <div key={chave}>
                <p className="text-[12px] text-[var(--texto-2)]">{rotulo}</p>
                <p className="mt-0.5 text-[17px] font-semibold tabular-nums">
                  {painel.estados?.[chave] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- resumo do dia --- */}
      <section className="cartao surgir mb-4 p-5">
        <p className="mb-3 text-[14px] font-semibold">Resumo de hoje</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["✓ Enviadas", painel.enviadasHoje],
            ["💬 Respondidas", painel.respondidasHoje],
            ["⚠ Erros", painel.errosHoje],
            ["⏳ Aguardando", painel.aguardando],
          ].map(([r, v]) => (
            <div key={String(r)}>
              <p className="text-[12.5px] text-[var(--texto-2)]">{r}</p>
              <p className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {painel.ultimosEnvios.length > 0 && (
        <section className="cartao surgir mb-6 p-5">
          <p className="mb-3 text-[14px] font-semibold">Últimos disparos</p>
          <ul className="space-y-2">
            {painel.ultimosEnvios.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">{u.lead}</span>
                <span className={`etiqueta shrink-0 ${COR_STATUS[u.status] ?? "etiqueta-neutra"}`}>
                  {ROTULO_STATUS[u.status] ?? u.status}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-[var(--texto-3)]">
                  {formatarHora(u.quando)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- configurações, recolhida por padrão --- */}
      <section className="cartao surgir mb-4 p-5">
        <button
          onClick={() => setMostrarConfig((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[14px] font-semibold">⚙ Configurações de disparo</span>
          <span className="text-[13px] text-[var(--azul)]">{mostrarConfig ? "Esconder" : "Ajustar"}</span>
        </button>

        {mostrarConfig && (
          <div className="mt-4">
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-[var(--texto-2)]">Limite diário</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={config.limiteDiario}
                  onChange={(e) => setConfig({ ...config, limiteDiario: Number(e.target.value) })}
                  className="campo"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-[var(--texto-2)]">
                  Intervalo (segundos)
                </span>
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={config.intervaloSegundos}
                  onChange={(e) => setConfig({ ...config, intervaloSegundos: Number(e.target.value) })}
                  className="campo"
                />
              </label>
            </div>

            <label className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.horarioAtivo}
                onChange={(e) => setConfig({ ...config, horarioAtivo: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--linha)]"
              />
              <span className="text-[13.5px]">Usar horário permitido</span>
            </label>
            {config.horarioAtivo && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[13px] text-[var(--texto-2)]">
                  De
                  <input
                    type="time"
                    value={config.horarioInicio}
                    onChange={(e) => setConfig({ ...config, horarioInicio: e.target.value })}
                    className="campo w-28"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[13px] text-[var(--texto-2)]">
                  Até
                  <input
                    type="time"
                    value={config.horarioFim}
                    onChange={(e) => setConfig({ ...config, horarioFim: e.target.value })}
                    className="campo w-28"
                  />
                </label>
              </div>
            )}

            <button onClick={salvarConfig} disabled={salvandoConfig} className="btn-secundario">
              {salvandoConfig ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        )}
      </section>

      {/* --- rascunhos avulsos aguardando revisão (só aparece se existir) --- */}
      {rascunhos.length > 0 && (
        <section className="cartao surgir p-5">
          <button
            onClick={() => setMostrarRascunhos((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-[14px] font-semibold">
              {rascunhos.length} rascunho(s) aguardando revisão
            </span>
            <span className="text-[13px] text-[var(--azul)]">
              {mostrarRascunhos ? "Esconder" : "Revisar"}
            </span>
          </button>

          {mostrarRascunhos && (
            <ol className="mt-4 space-y-3">
              {rascunhos.map(({ m, lead }) => (
                <li key={m.id} className="rounded-[10px] border border-[var(--linha)] p-3">
                  <p className="text-[13.5px] font-medium">{lead.nome}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--texto-3)]">
                    {categoriaSingular(lead.categoria)} · {lead.cidade}
                  </p>
                  <p className="mt-2 whitespace-pre-line rounded-[8px] bg-[var(--superficie)] px-3 py-2.5 text-[13px] leading-relaxed">
                    {m.texto}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => acaoMensagem(m.id, "aprovar")}
                      disabled={ocupado}
                      className="btn-primario"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => acaoMensagem(m.id, "cancelar")}
                      disabled={ocupado}
                      className="btn-secundario"
                    >
                      Cancelar
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
