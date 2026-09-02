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

type Amostra = { nome: string; cidade: string | null; mensagem: string };
type CampanhaPronta = { nicho: string; abordagem: string; quantidade: number };

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

  const [preparando, setPreparando] = useState(false);
  const [campanhaPronta, setCampanhaPronta] = useState<CampanhaPronta | null>(null);

  function escolherSegmento(v: string) {
    setSegmento(v);
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

  function pedirConfirmacaoIniciar() {
    if (rodando) {
      setAviso("Automação já está em execução.");
      return;
    }
    setConfirmarInicio(true);
  }

  async function confirmarIniciar() {
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
  async function prepararFila() {
    if (!preview || preview.disponivel === 0) return;
    setPreparando(true);
    try {
      const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      const nome = `${nichoLabel} — ${abordagemAtual.rotulo} — ${data}`;
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          leadIds: preview.leadIds,
          usarIA: true,
          produto: abordagem || undefined,
          filtro: { segmento, abordagem },
        }),
      }).then((x) => x.json());

      if (r.campanha?.id) {
        await fetch("/api/campanhas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.campanha.id, acao: "iniciar" }),
        });
      }

      setCampanhaPronta({ nicho: nichoLabel, abordagem: abordagemAtual.rotulo, quantidade: r.criadas ?? 0 });
      const puladasPorFalhaIA = (r.pulados ?? []).filter((p: { motivo: string }) =>
        p.motivo?.includes("IA"),
      ).length;
      setAviso(
        `✓ Fila preparada — ${r.criadas ?? 0} mensagem(ns) personalizada(s) por IA, pronta(s) para receber.` +
          (puladasPorFalhaIA > 0 ? ` ${puladasPorFalhaIA} pulada(s) por falha ao gerar.` : ""),
      );
      setSegmento("");
      setNichoEscolhido(false);
      setAbordagem("");
      setAbordagemEscolhida(false);
      setAmostras(null);
      await Promise.all([carregarTudo(), carregarPreview()]);
    } finally {
      setPreparando(false);
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
            Escolha o nicho e a abordagem — a IA escreve uma mensagem própria para cada lead.
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
        className={`surgir mb-6 rounded-[10px] px-4 py-3 text-center text-[14px] font-medium ${BANNER_POR_ESTADO[estado.codigo]}`}
      >
        {estado.emoji} {estado.label}
      </p>

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

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => acaoWorker("desligar")} disabled={ocupado} className="btn-secundario">
              ⏸ Pausar
            </button>
            <button onClick={pararAgora} disabled={ocupado} className="btn-perigo">
              ⛔ Parar agora
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

              {(preview?.segmentos ?? []).map((s) => (
                <button
                  key={s.nome}
                  onClick={() => escolherSegmento(s.nome)}
                  className={`rounded-[12px] px-3 py-3 text-left capitalize transition ${
                    nichoEscolhido && segmento === s.nome
                      ? "bg-[var(--azul)] text-white"
                      : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                  }`}
                >
                  <span className="block text-[20px]">{iconeCategoria(s.nome)}</span>
                  <span className="mt-1 block text-[13px] font-medium">{s.nome}</span>
                  <span
                    className={`block text-[12px] ${nichoEscolhido && segmento === s.nome ? "text-white/80" : "text-[var(--texto-3)]"}`}
                  >
                    {s.disponivel} de {s.total}
                  </span>
                </button>
              ))}
            </div>

            {nichoEscolhido && preview && (
              <p className="mt-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[13.5px]">
                <strong className="capitalize">{nichoLabel}</strong> — {preview.totalNoNicho}{" "}
                lead{preview.totalNoNicho === 1 ? "" : "s"} encontrado
                {preview.totalNoNicho === 1 ? "" : "s"}, {preview.disponivel} disponíve
                {preview.disponivel === 1 ? "l" : "is"} para disparo agora.
              </p>
            )}
          </section>

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
                        <p className="text-[12.5px] font-medium text-[var(--texto-2)]">
                          {a.nome}
                          {a.cidade ? ` — ${a.cidade}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed">
                          {a.mensagem}
                        </p>
                      </div>
                    ))}
                    <p className="text-[12px] text-[var(--texto-3)]">
                      Cada lead do lote recebe uma mensagem própria, gerada na hora de preparar a
                      fila — estas 3 são só um exemplo do que a IA escreve.
                    </p>
                  </div>
                )}

                {amostras && amostras.length === 0 && (
                  <p className="text-[13px] text-[var(--texto-2)]">
                    Nenhum lead disponível para gerar prévia agora.
                  </p>
                )}
              </div>

              <button
                onClick={prepararFila}
                disabled={preparando || preview.disponivel === 0}
                className="btn-primario mt-5 w-full !py-3.5 !text-[16px]"
              >
                {preparando ? "Gerando mensagens e preparando…" : "✓ PREPARAR FILA"}
              </button>
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
              <p className="text-[16px] font-semibold text-[var(--verde,var(--azul))]">
                🟢 CAMPANHA PRONTA
              </p>
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
              <p className="mt-3 rounded-[10px] bg-[var(--azul-fraco)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--azul)]">
                Cada lead recebeu uma mensagem própria, gerada por IA — não é o mesmo texto
                repetido.
              </p>

              {filaPronta && (
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
              Você está prestes a iniciar os disparos.
            </h2>
            <ul className="mt-4 space-y-1.5 text-[14px] text-[var(--texto-2)]">
              <li>
                Fila hoje:{" "}
                <strong className="text-[var(--texto)]">
                  {Math.min(painel.aguardando, config.limiteDiario)} empresas
                </strong>
              </li>
              <li>
                Intervalo:{" "}
                <strong className="text-[var(--texto)]">{config.intervaloSegundos} segundos</strong>
              </li>
            </ul>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--texto-2)]">
              A fila pode conter mensagens de mais de uma campanha preparada. Cada uma sai com o
              texto exato com que foi criada.
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--texto-2)]">
              Depois de iniciar, o sistema continuará enviando automaticamente até atingir o limite
              ou não haver mais empresas elegíveis — mesmo se você fechar esta página.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={confirmarIniciar} disabled={ocupado} className="btn-primario">
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
