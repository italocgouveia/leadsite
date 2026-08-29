"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead, StatusMensagem } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Automação de mensagens.
 *
 * A tela é deliberadamente chata: lista, status e três botões. O que ela
 * precisa fazer bem é te deixar LER cada mensagem antes de sair — automação
 * de WhatsApp sem revisão é o caminho curto para queimar o número e a marca.
 *
 * Por isso não existe "aprovar todas". Aprovar é um clique por mensagem.
 */

type Linha = {
  m: {
    id: string;
    texto: string;
    status: StatusMensagem;
    produto: string | null;
    tentativas: number;
    erro: string | null;
    enviadaEm: string | null;
    criadoEm: string;
  };
  lead: Lead;
};

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
  ativa: boolean;
  provedorConfigurado: boolean;
  aguardando: number;
  enviadasHoje: number;
  limiteDiario: number;
  intervaloSegundos: number;
  variacaoAleatoriaAtiva: boolean;
  ultimoEnvio: string | null;
  ultimaTentativa: string | null;
  pode: boolean;
  motivo: string | null;
  esperarSegundos: number;
  proximaMensagem: { lead: string; trecho: string } | null;
  ultimoErro: { lead: string; motivo: string | null; quando: string } | null;
  horarioPermitido: { ativo: boolean; inicio: string; fim: string };
  bridge: SaudeBridge;
  statusWorker: StatusWorker;
};

const COR: Record<StatusMensagem, string> = {
  rascunho: "etiqueta-neutra",
  aprovada: "etiqueta-boa",
  "na-fila": "etiqueta-boa",
  enviada: "etiqueta-boa",
  entregue: "etiqueta-alta",
  respondida: "etiqueta-alta",
  erro: "etiqueta-alta",
  cancelada: "etiqueta-neutra",
};

const ROTULO: Record<StatusMensagem, string> = {
  rascunho: "Rascunho",
  aprovada: "Aprovada",
  "na-fila": "Na fila",
  enviada: "Enviada",
  entregue: "Entregue",
  respondida: "Respondida",
  erro: "Erro",
  cancelada: "Cancelada",
};

/** "há 2 min", "há 3h", ou o horário do dia se já faz mais de 24h. Sem valor: "—". */
function formatarQuando(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleString("pt-BR");
}

export default function Automacao() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const [horario, setHorario] = useState({ ativo: false, inicio: "08:00", fim: "20:00" });
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [ms, fila] = await Promise.all([
        fetch("/api/automacao/mensagens").then((r) => r.json()),
        fetch("/api/automacao/fila").then((r) => r.json()),
      ]);
      setLinhas(ms.mensagens ?? []);
      setPainel(fila);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Sincroniza o formulário de horário com o que veio do servidor — só na
  // primeira carga de cada valor, para não sobrescrever o que a pessoa está
  // digitando a cada refresh automático.
  useEffect(() => {
    if (painel?.horarioPermitido) {
      setHorario({
        ativo: painel.horarioPermitido.ativo,
        inicio: painel.horarioPermitido.inicio,
        fim: painel.horarioPermitido.fim,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel?.horarioPermitido.ativo, painel?.horarioPermitido.inicio, painel?.horarioPermitido.fim]);

  async function acao(id: string, acao: string, texto?: string) {
    setOcupado(true);
    try {
      await fetch("/api/automacao/mensagens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao, ...(texto ? { texto } : {}) }),
      });
      setEditando(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  /** "Enviar próxima": manda UMA mensagem agora, se puder — mesma trava de sempre. */
  async function enviarProxima() {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch("/api/automacao/fila", { method: "POST" }).then((x) => x.json());
      setAviso(
        r.enviada
          ? `Enviada para ${r.lead}. Próxima liberada em ${r.proximaEm}s.`
          : (r.motivo ?? "Nada a enviar."),
      );
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Controle do worker de verdade — o que roda na bridge (`servidor.js`),
   * único processador da fila. Não existe mais laço no navegador: quem manda
   * mensagem sozinho, em intervalo, é o worker, mesmo com a aba fechada.
   *
   * "Pausar automação" e "Parar imediatamente" chamam a MESMA ação seguro
   * (desligar o worker) — não existe como abortar um envio HTTP já em voo
   * sem risco de duplicar, e desligar nunca mexe em mensagem já enviada. Os
   * dois botões existem por clareza (rotina vs. emergência), não por
   * mecanismo diferente.
   */
  async function acaoWorker(acao: "ligar" | "desligar") {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch("/api/automacao/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      }).then((x) => x.json());
      setAviso(r.erro ?? (acao === "ligar" ? "Automação ligada." : "Automação pausada."));
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  /** Aprovar ou cancelar tudo que está marcado, numa requisição só. */
  async function emLote(acao: "aprovar" | "cancelar") {
    if (marcadas.size === 0) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/automacao/mensagens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...marcadas], acao }),
      }).then((x) => x.json());
      setAviso(
        `${r.alteradas} mensagem(ns) ${acao === "aprovar" ? "aprovada(s)" : "cancelada(s)"}.`,
      );
      setMarcadas(new Set());
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function salvarHorario() {
    setSalvandoHorario(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horarioEnvioAtivo: horario.ativo,
          horarioInicio: horario.inicio,
          horarioFim: horario.fim,
        }),
      });
      setAviso("Horário permitido salvo.");
      await carregar();
    } finally {
      setSalvandoHorario(false);
    }
  }

  const rascunhos = linhas.filter((l) => l.m.status === "rascunho");
  const porStatus = (s: StatusMensagem) => linhas.filter((l) => l.m.status === s).length;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold sm:text-[28px]">Automação de mensagens</h1>
          <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
            Nada sai sem você aprovar, uma por uma.
          </p>
        </div>
        <Link href="/automacao/regras" className="btn-secundario whitespace-nowrap">
          Resposta automática
        </Link>
      </header>

      {/* --- semáforo + saúde do sistema --- */}
      {painel && (
        <section className="surgir mb-4 flex items-center gap-2 rounded-[10px] bg-[var(--superficie)] px-4 py-3">
          <span className="text-[18px] leading-none">{painel.statusWorker.emoji}</span>
          <span className="text-[14px] font-medium">{painel.statusWorker.label}</span>
        </section>
      )}

      {painel && (
        <section className="surgir mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Bridge", !painel.bridge.alcancavel ? "Inacessível" : "Conectada"],
            [
              "WhatsApp",
              !painel.bridge.alcancavel
                ? "—"
                : painel.bridge.whatsappConectado
                  ? "Conectado"
                  : painel.bridge.whatsappEstado,
            ],
            [
              "Worker",
              !painel.bridge.alcancavel
                ? "—"
                : painel.bridge.filaWorkerAtivo
                  ? "Rodando"
                  : "Pausado",
            ],
            ["Fila pendente", String(painel.aguardando)],
            ["Hoje", `${painel.enviadasHoje} / ${painel.limiteDiario}`],
            ["Intervalo", `${painel.intervaloSegundos}s`],
            ["Último envio", formatarQuando(painel.ultimoEnvio)],
            ["Última tentativa", formatarQuando(painel.ultimaTentativa)],
          ].map(([r, v]) => (
            <div key={r} className="cartao p-4">
              <p className="text-[13px] text-[var(--texto-2)]">{r}</p>
              <p className="mt-1 text-[16px] font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </section>
      )}

      {painel && (painel.proximaMensagem || painel.ultimoErro) && (
        <section className="surgir mb-6 grid gap-3 sm:grid-cols-2">
          {painel.proximaMensagem && (
            <div className="cartao p-4">
              <p className="text-[13px] text-[var(--texto-2)]">Próxima mensagem</p>
              <p className="mt-1 text-[14px] font-medium">{painel.proximaMensagem.lead}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
                {painel.proximaMensagem.trecho}…
              </p>
            </div>
          )}
          {painel.ultimoErro && (
            <div className="cartao p-4">
              <p className="text-[13px] text-[var(--texto-2)]">Último erro</p>
              <p className="mt-1 text-[14px] font-medium">{painel.ultimoErro.lead}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--vermelho)]">
                {painel.ultimoErro.motivo} · {formatarQuando(painel.ultimoErro.quando)}
              </p>
            </div>
          )}
        </section>
      )}

      {painel && !painel.provedorConfigurado && (
        <p className="surgir mb-5 rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-3 text-[13px] leading-relaxed text-[var(--ambar)]">
          Nenhum provedor de WhatsApp configurado. Nada será enviado até você
          apontar a URL da sua API em{" "}
          <Link href="/config" className="underline">
            Configurações
          </Link>
          . Você ainda pode revisar e aprovar as mensagens.
        </p>
      )}

      {/* --- controle do worker (bridge) --- */}
      <div className="surgir mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => acaoWorker("ligar")}
          disabled={ocupado || !painel?.bridge.alcancavel || painel?.bridge.filaWorkerAtivo}
          className="btn-primario"
          title="Liga o worker da bridge — ele passa a mandar mensagens sozinho, respeitando intervalo e horário"
        >
          Iniciar automação
        </button>
        <button
          onClick={() => acaoWorker("desligar")}
          disabled={ocupado || !painel?.bridge.alcancavel || !painel?.bridge.filaWorkerAtivo}
          className="btn-secundario"
          title="Pausa o worker — não altera nenhuma mensagem já enviada"
        >
          Pausar automação
        </button>
        <button
          onClick={enviarProxima}
          disabled={ocupado || !painel?.pode}
          className="btn-secundario"
          title={painel?.motivo ?? "Manda só a próxima, uma vez"}
        >
          Enviar próxima
        </button>
        <button
          onClick={() => acaoWorker("desligar")}
          disabled={ocupado || !painel?.bridge.alcancavel || !painel?.bridge.filaWorkerAtivo}
          className="btn-perigo"
          title="Mesma ação segura de pausar — não existe como abortar um envio já em voo sem risco de duplicar"
        >
          Parar imediatamente
        </button>
        {painel && !painel.pode && painel.motivo && (
          <span className="text-[13px] text-[var(--texto-3)]">{painel.motivo}</span>
        )}
      </div>

      {/* --- horário permitido --- */}
      <div className="cartao surgir mb-6 p-4">
        <p className="mb-3 text-[14px] font-semibold">Horário permitido de envio</p>
        <label className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={horario.ativo}
            onChange={(e) => setHorario({ ...horario, ativo: e.target.checked })}
            className="h-4 w-4 rounded border-[var(--linha)]"
          />
          <span className="text-[13.5px]">
            Só enviar automaticamente dentro de um horário (fuso America/São Paulo)
          </span>
        </label>
        {horario.ativo && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[13px] text-[var(--texto-2)]">
              Início
              <input
                type="time"
                value={horario.inicio}
                onChange={(e) => setHorario({ ...horario, inicio: e.target.value })}
                className="campo w-28"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-[var(--texto-2)]">
              Fim
              <input
                type="time"
                value={horario.fim}
                onChange={(e) => setHorario({ ...horario, fim: e.target.value })}
                className="campo w-28"
              />
            </label>
          </div>
        )}
        <button onClick={salvarHorario} disabled={salvandoHorario} className="btn-secundario">
          {salvandoHorario ? "Salvando…" : "Salvar horário"}
        </button>
      </div>

      {/* --- ações em lote sobre os rascunhos --- */}
      {rascunhos.length > 0 && (
        <div className="cartao surgir mb-5 flex flex-wrap items-center gap-2 p-3">
          <button
            onClick={() =>
              setMarcadas(
                marcadas.size === rascunhos.length
                  ? new Set()
                  : new Set(rascunhos.map((l) => l.m.id)),
              )
            }
            className="text-[13px] font-medium text-[var(--azul)] hover:underline"
          >
            {marcadas.size === rascunhos.length
              ? "Desmarcar todos"
              : `Marcar os ${rascunhos.length} rascunhos`}
          </button>

          {marcadas.size > 0 && (
            <>
              <span className="text-[13px] text-[var(--texto-2)]">
                {marcadas.size} marcada(s)
              </span>
              <button
                onClick={() => emLote("aprovar")}
                disabled={ocupado}
                className="btn-primario"
              >
                Aprovar selecionadas
              </button>
              <button
                onClick={() => emLote("cancelar")}
                disabled={ocupado}
                className="btn-secundario ml-auto"
              >
                Cancelar selecionadas
              </button>
            </>
          )}
        </div>
      )}

      {aviso && (
        <p className="surgir mb-5 rounded-[10px] bg-[var(--azul-fraco)] px-4 py-2.5 text-[14px] text-[var(--azul)]">
          {aviso}
        </p>
      )}

      {/* --- resumo por status --- */}
      <div className="mb-4 flex flex-wrap gap-1.5 text-[13px]">
        {(["rascunho", "aprovada", "enviada", "respondida", "erro"] as StatusMensagem[]).map(
          (s) => (
            <span key={s} className={`etiqueta ${COR[s]}`}>
              {ROTULO[s]}: {porStatus(s)}
            </span>
          ),
        )}
      </div>

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="esqueleto h-32" />
          ))}
        </div>
      ) : linhas.length === 0 ? (
        <div className="cartao px-5 py-14 text-center">
          <p className="text-[15px]">Nenhuma mensagem na automação.</p>
          <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
            Abra{" "}
            <Link href="/vender-site" className="text-[var(--azul)]">
              Vender site
            </Link>
            ,{" "}
            <Link href="/vender-chatbot" className="text-[var(--azul)]">
              chatbot
            </Link>{" "}
            ou{" "}
            <Link href="/vender-sistema" className="text-[var(--azul)]">
              sistema
            </Link>{" "}
            e mande leads para a fila.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {linhas.map(({ m, lead }) => (
            <li key={m.id} className="cartao p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2.5">
                  {m.status === "rascunho" && (
                    <input
                      type="checkbox"
                      checked={marcadas.has(m.id)}
                      onChange={() =>
                        setMarcadas((atual) => {
                          const novo = new Set(atual);
                          if (novo.has(m.id)) novo.delete(m.id);
                          else novo.add(m.id);
                          return novo;
                        })
                      }
                      aria-label={`Selecionar mensagem de ${lead.nome}`}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--azul)]"
                    />
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/lead/${lead.id}`}
                      className="block text-[15px] font-semibold leading-snug hover:text-[var(--azul)]"
                    >
                      {lead.nome}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] capitalize text-[var(--texto-3)]">
                      {categoriaSingular(lead.categoria)} · {lead.cidade}
                      {lead.telefone ? ` · ${lead.telefone}` : ""}
                      {m.produto ? ` · ${m.produto}` : ""}
                    </p>
                  </div>
                </div>
                <span className={`etiqueta shrink-0 ${COR[m.status]}`}>{ROTULO[m.status]}</span>
              </div>

              {editando === m.id ? (
                <textarea
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  rows={8}
                  className="campo mt-3 font-[inherit] text-[13.5px] leading-relaxed"
                />
              ) : (
                <p className="mt-3 whitespace-pre-line rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[13.5px] leading-relaxed">
                  {m.texto}
                </p>
              )}

              <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                {m.enviadaEm
                  ? `Enviada em ${new Date(m.enviadaEm).toLocaleString("pt-BR")}`
                  : `Criada em ${new Date(m.criadoEm).toLocaleString("pt-BR")}`}
                {m.tentativas > 0 ? ` · ${m.tentativas} tentativa(s)` : ""}
              </p>

              {m.erro && (
                <p className="mt-2 rounded-[10px] bg-[var(--vermelho-fraco)] px-3 py-2 text-[12.5px] text-[var(--vermelho)]">
                  {m.erro}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {editando === m.id ? (
                  <>
                    <button
                      onClick={() => acao(m.id, "editar", rascunho)}
                      disabled={ocupado}
                      className="btn-primario"
                    >
                      Salvar
                    </button>
                    <button onClick={() => setEditando(null)} className="btn-secundario">
                      Cancelar edição
                    </button>
                  </>
                ) : (
                  <>
                    {m.status === "rascunho" && (
                      <>
                        <button
                          onClick={() => acao(m.id, "aprovar")}
                          disabled={ocupado}
                          className="btn-primario"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => {
                            setEditando(m.id);
                            setRascunho(m.texto);
                          }}
                          className="btn-secundario"
                        >
                          Editar
                        </button>
                      </>
                    )}
                    {["enviada", "entregue"].includes(m.status) && (
                      <button
                        onClick={() => acao(m.id, "marcar-respondida")}
                        disabled={ocupado}
                        className="btn-secundario"
                        title="Encerra a automação para este lead e move para Respondeu"
                      >
                        Respondeu
                      </button>
                    )}
                    {!["cancelada", "respondida"].includes(m.status) && (
                      <button
                        onClick={() => acao(m.id, "cancelar")}
                        disabled={ocupado}
                        className="btn-secundario ml-auto"
                      >
                        Cancelar
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
