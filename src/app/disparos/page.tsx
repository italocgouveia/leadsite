"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead, StatusMensagem } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Disparos automáticos — página única.
 *
 * Substitui /disparar e /automacao, que eram duas telas para a mesma
 * pergunta ("como eu mando mensagem?") com dois botões diferentes de
 * "manda agora" — cada um um loop rodando NO NAVEGADOR, chamando
 * `/api/automacao/fila` sozinho. Isso é exatamente o "segundo worker" que
 * não pode existir: quem envia é sempre o worker único da bridge
 * (`whatsapp-node/servidor.js`, `puxarFila`), mesmo com esta aba fechada.
 *
 * Esta tela só faz três coisas: mostra status, liga/pausa/para o worker de
 * verdade (via `/api/automacao/worker` → bridge `/worker/ligar|desligar`), e
 * deixa configurar limite/intervalo/horário. Nenhum `fetch` daqui dispara
 * mensagem — o único POST que manda alguma coisa é o `/worker/ligar`, e ele
 * só liga o loop que já mora na bridge.
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
    trecho: string;
  } | null;
  ultimosEnvios: { lead: string; status: StatusMensagem; quando: string }[];
  horarioPermitido: { ativo: boolean; inicio: string; fim: string };
  bridge: SaudeBridge;
  statusWorker: StatusWorker;
};

type LinhaRascunho = {
  m: { id: string; texto: string; produto: string | null; criadoEm: string };
  lead: Lead;
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

  async function acaoWorker(acao: "ligar" | "desligar") {
    setOcupado(true);
    setAviso(null);
    try {
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

  if (carregando || !painel) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="esqueleto h-96" />
      </main>
    );
  }

  const pronto =
    painel.bridge.alcancavel &&
    painel.bridge.whatsappConectado &&
    painel.provedorConfigurado &&
    !rodando;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6">
        <h1 className="text-[24px] font-semibold sm:text-[28px]">🚀 Disparos automáticos</h1>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
          Configure uma vez e deixe o sistema trabalhar sozinho.
        </p>
      </header>

      {/* --- status principal --- */}
      <section className="surgir mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Bridge", painel.bridge.alcancavel ? "🟢 Conectada" : "🔴 Inacessível"],
          [
            "WhatsApp",
            !painel.bridge.alcancavel
              ? "—"
              : painel.bridge.whatsappConectado
                ? "🟢 Conectado"
                : `🟡 ${painel.bridge.whatsappEstado}`,
          ],
          ["Automação", rodando ? "🟢 Rodando" : "🟡 Pausada"],
          ["Hoje", `${painel.enviadasHoje} / ${painel.limiteDiario}`],
        ].map(([r, v]) => (
          <div key={r} className="cartao p-4">
            <p className="text-[12.5px] text-[var(--texto-2)]">{r}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      {pronto && (
        <p className="surgir mb-6 rounded-[10px] bg-[var(--verde-fraco,var(--azul-fraco))] px-4 py-3 text-center text-[14px] font-medium text-[var(--verde,var(--azul))]">
          🟢 SISTEMA PRONTO PARA DISPARAR
        </p>
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
            🟢 DISPAROS AUTOMÁTICOS ATIVOS
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[12.5px] text-[var(--texto-2)]">Enviados hoje</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {painel.enviadasHoje} / {painel.limiteDiario}
              </p>
            </div>
            <div>
              <p className="text-[12.5px] text-[var(--texto-2)]">Próximo envio</p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {contagem > 0
                  ? `em ${String(Math.floor(contagem / 60)).padStart(2, "0")}:${String(contagem % 60).padStart(2, "0")}`
                  : "agora"}
              </p>
            </div>
          </div>

          {painel.ultimosEnvios[0] && (
            <p className="mt-4 text-[13px] text-[var(--texto-2)]">
              Última atividade: mensagem {painel.ultimosEnvios[0].status} para{" "}
              <strong className="text-[var(--texto)]">{painel.ultimosEnvios[0].lead}</strong>
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
            <button onClick={() => acaoWorker("desligar")} disabled={ocupado} className="btn-perigo">
              ⛔ Parar agora
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* --- próxima empresa --- */}
          {painel.proximaMensagem && (
            <section className="cartao surgir mb-6 p-5">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--texto-3)]">
                Próxima empresa
              </p>
              <p className="text-[16px] font-semibold">{painel.proximaMensagem.lead}</p>
              <p className="mt-0.5 text-[13px] text-[var(--texto-2)]">
                {painel.proximaMensagem.cidade ?? "—"}
                {painel.proximaMensagem.categoria
                  ? ` · ${categoriaSingular(painel.proximaMensagem.categoria)}`
                  : ""}
              </p>
              <p className="mt-3 text-[12.5px] text-[var(--texto-3)]">Mensagem que será enviada:</p>
              <p className="mt-1 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[13.5px] leading-relaxed">
                {painel.proximaMensagem.trecho}…
              </p>
            </section>
          )}

          {/* --- configurações simples --- */}
          <section className="cartao surgir mb-6 p-5">
            <p className="mb-4 text-[14px] font-semibold">Configurações</p>

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
                  Início
                  <input
                    type="time"
                    value={config.horarioInicio}
                    onChange={(e) => setConfig({ ...config, horarioInicio: e.target.value })}
                    className="campo w-28"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[13px] text-[var(--texto-2)]">
                  Fim
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
          </section>

          {/* --- iniciar --- */}
          <div className="surgir mb-6 text-center">
            <button
              onClick={pedirConfirmacaoIniciar}
              disabled={ocupado || !painel.bridge.alcancavel}
              className="btn-primario w-full max-w-sm !py-3.5 !text-[16px]"
            >
              ▶ INICIAR DISPAROS
            </button>
            {!painel.bridge.alcancavel && (
              <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
                A bridge precisa estar acessível para iniciar.
              </p>
            )}
          </div>
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
              Você está prestes a iniciar os disparos automáticos.
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--texto-2)]">
              O sistema continuará enviando automaticamente mesmo se você fechar esta página.
            </p>
            <ul className="mt-4 space-y-1.5 text-[14px] text-[var(--texto-2)]">
              <li>
                Limite diário: <strong className="text-[var(--texto)]">{config.limiteDiario}</strong>
              </li>
              <li>
                Intervalo:{" "}
                <strong className="text-[var(--texto)]">{config.intervaloSegundos} segundos</strong>
              </li>
            </ul>
            <p className="mt-4 text-[13.5px] font-medium">Deseja iniciar?</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={confirmarIniciar} disabled={ocupado} className="btn-primario">
                🚀 Iniciar automação
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
        <p className="mb-3 text-[14px] font-semibold">Resumo do dia</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["✓ Enviadas", painel.enviadasHoje],
            ["💬 Respondidas", painel.respondidasHoje],
            ["⚠ Erros", painel.errosHoje],
            ["⏳ Pendentes", painel.aguardando],
          ].map(([r, v]) => (
            <div key={String(r)}>
              <p className="text-[12.5px] text-[var(--texto-2)]">{r}</p>
              <p className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- últimos envios --- */}
      {painel.ultimosEnvios.length > 0 && (
        <section className="cartao surgir mb-6 p-5">
          <p className="mb-3 text-[14px] font-semibold">Últimos envios</p>
          <ul className="space-y-2">
            {painel.ultimosEnvios.map((u, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[13.5px]">
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

      {/* --- rascunhos aguardando revisão (só aparece se existir) --- */}
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

      <p className="mt-6 text-center text-[12.5px] text-[var(--texto-3)]">
        <Link href="/campanhas" className="hover:text-[var(--texto-2)]">
          Escolher um lote específico
        </Link>
      </p>
    </main>
  );
}
