"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ThreadConversa from "@/components/thread-conversa";
import type { Conversa, Lead } from "@/lib/db/schema";

type ItemLista = {
  lead: Pick<Lead, "id" | "nome" | "categoria" | "cidade" | "etapa" | "atendimentoHumano">;
  ultimaMensagem: { texto: string; direcao: "recebida" | "enviada"; criadoEm: string };
  naoLidas: number;
};

/** Espelho de /api/comercial/[leadId]. */
type PainelComercial = {
  score: { total: number; base: number; ajuste: number; emoji: string; motivos: string[] };
  proximaAcao: { tipo: string; titulo: string; motivo: string; pergunta?: string; acao?: string; urgencia: string };
  objecao: { id: string; nome: string; estrategia: string; resposta: string; trecho: string } | null;
  diagnostico: {
    pergunta: string;
    investiga: string;
    respondida: boolean;
    resposta: string | null;
    insight: string | null;
  }[];
  memoria: { processoAtual?: string; dorConfirmada?: string };
  proposta: { problema: string; problemaConfirmado: boolean; solucao: string; pendencias: string[] };
  negocio: { status: string; setup: number | null; mensalidade: number | null } | null;
};

export default function ConversasPage() {
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [thread, setThread] = useState<{ lead: Lead; mensagens: Conversa[] } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Painel comercial do lead aberto. Ver /api/comercial/[leadId]. */
  const [comercial, setComercial] = useState<PainelComercial | null>(null);
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [respostaDiag, setRespostaDiag] = useState("");

  /** Sem IA e sem escrita: só junta o que já está no banco. */
  const carregarComercial = useCallback(async (leadId: string) => {
    const r = await fetch(`/api/comercial/${leadId}`).then((x) => x.json());
    setComercial(r.erro ? null : r);
  }, []);

  async function registrarDiagnostico(pergunta: string) {
    if (!selecionado || !respostaDiag.trim()) return;
    const r = await fetch(`/api/comercial/${selecionado}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "responder-diagnostico", pergunta, resposta: respostaDiag }),
    }).then((x) => x.json());
    if (!r.erro) setComercial(r);
    setRegistrando(null);
    setRespostaDiag("");
  }

  /**
   * Cria o negócio em RASCUNHO. Não define preço e não move o funil —
   * proposta criada não é proposta enviada, e muito menos negócio fechado.
   */
  async function criarProposta() {
    if (!selecionado) return;
    const r = await fetch(`/api/comercial/${selecionado}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "salvar-negocio", status: "rascunho" }),
    }).then((x) => x.json());
    if (!r.erro) setComercial(r);
  }

  const carregarLista = useCallback(() => {
    fetch("/api/conversas")
      .then((r) => r.json())
      .then((d: { conversas: ItemLista[] }) => setItens(d.conversas ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregarLista();
    const id = setInterval(carregarLista, 20_000);
    return () => clearInterval(id);
  }, [carregarLista]);

  const abrirConversa = useCallback(
    async (leadId: string) => {
      setSelecionado(leadId);
      setErro(null);
      const r = await fetch(`/api/conversas/${leadId}`);
      if (!r.ok) return;
      const d = await r.json();
      setThread(d);
      await fetch(`/api/conversas/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "marcar-lida" }),
      });
      carregarLista();
      // Só leitura, sem IA: abrir conversa não custa cota.
      void carregarComercial(leadId);
    },
    [carregarLista, carregarComercial],
  );

  async function enviar() {
    if (!selecionado || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/conversas/${selecionado}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErro(d.erro ?? "Não consegui enviar.");
        return;
      }
      setTexto("");
      await abrirConversa(selecionado);
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtendimentoHumano(assumir: boolean) {
    if (!selecionado) return;
    await fetch(`/api/conversas/${selecionado}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: assumir ? "assumir" : "devolver" }),
    });
    abrirConversa(selecionado);
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-0px)] max-w-6xl flex-col px-0 pb-0 pt-16 sm:px-4 lg:pt-6">
      <h1 className="surgir mb-3 px-4 text-[24px] font-semibold sm:px-0 sm:text-[28px]">Conversas</h1>

      <div className="surgir grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[280px_1fr_260px]">
        {/* Coluna 1: lista */}
        <section className={`cartao flex flex-col overflow-hidden ${selecionado ? "hidden lg:flex" : "flex"}`}>
          <div className="flex-1 overflow-y-auto">
            {itens.length === 0 && (
              <p className="p-4 text-[13px] text-[var(--texto-3)]">Nenhuma conversa ainda.</p>
            )}
            {itens.map(({ lead, ultimaMensagem, naoLidas }) => (
              <button
                key={lead.id}
                onClick={() => abrirConversa(lead.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-[var(--linha)] px-4 py-3 text-left transition hover:bg-[var(--superficie)] ${
                  selecionado === lead.id ? "bg-[var(--superficie)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--texto)]">{lead.nome}</span>
                  {naoLidas > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--azul)] px-1.5 text-[11px] font-semibold text-white">
                      {naoLidas}
                    </span>
                  )}
                </div>
                <span className="truncate text-[12px] text-[var(--texto-2)]">
                  {ultimaMensagem.direcao === "enviada" ? "Você: " : ""}
                  {ultimaMensagem.texto}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Coluna 2: thread */}
        <section className={`cartao flex flex-col overflow-hidden ${selecionado ? "flex" : "hidden lg:flex"}`}>
          {!thread ? (
            <p className="flex flex-1 items-center justify-center text-[13px] text-[var(--texto-3)]">
              Selecione uma conversa
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--linha)] px-4 py-3 lg:hidden">
                <button onClick={() => setSelecionado(null)} className="text-[13px] text-[var(--texto-2)]">
                  ← Voltar
                </button>
                <span className="truncate text-[14px] font-medium">{thread.lead.nome}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ThreadConversa mensagens={thread.mensagens} />
              </div>
              <div className="border-t border-[var(--linha)] p-3">
                {erro && <p className="mb-2 text-[12px] text-[var(--vermelho)]">{erro}</p>}
                <div className="flex gap-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    placeholder="Escreva uma mensagem…"
                    rows={1}
                    className="campo-apple flex-1 resize-none"
                  />
                  <button onClick={enviar} disabled={enviando || !texto.trim()} className="btn-primario">
                    Enviar
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Coluna 3: dados do lead */}
        <section className={`cartao flex-col overflow-y-auto p-4 ${selecionado ? "hidden lg:flex" : "hidden lg:flex"}`}>
          {thread ? (
            <>
              <h2 className="mb-1 text-[16px] font-semibold text-[var(--texto)]">{thread.lead.nome}</h2>
              <p className="mb-3 text-[13px] text-[var(--texto-2)]">
                {thread.lead.categoria ?? "—"} · {thread.lead.cidade ?? "—"}
              </p>
              <p className="mb-3 text-[13px] text-[var(--texto-2)]">
                Etapa: <span className="text-[var(--texto)]">{thread.lead.etapa}</span>
              </p>

              <button
                onClick={() => alternarAtendimentoHumano(!thread.lead.atendimentoHumano)}
                className={thread.lead.atendimentoHumano ? "btn-secundario" : "btn-primario"}
              >
                {thread.lead.atendimentoHumano ? "Devolver para automação" : "Assumir conversa"}
              </button>
              {thread.lead.atendimentoHumano && (
                <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                  Resposta automática não vai disparar para este lead.
                </p>
              )}

              {/**
                * PAINEL COMERCIAL — a pergunta que o vendedor tem quando abre
                * esta tela: *o que eu faço agora com este lead?*
                *
                * Tudo aqui é calculado de dados já gravados (lib/proxima-acao,
                * lib/objecoes, lib/diagnostico). Nenhuma chamada de IA, então
                * abrir a conversa não custa cota nenhuma.
                *
                * Nada aqui envia mensagem: o que aparece é texto para copiar.
                */}
              {comercial && (
                <div className="mt-4 space-y-4 border-t border-[var(--linha)] pt-4">
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                      Oportunidade
                    </p>
                    <p className="text-[15px] font-semibold tabular-nums">
                      {comercial.score.emoji} {comercial.score.total}/100
                      {comercial.score.ajuste !== 0 && (
                        <span className="ml-1.5 text-[12px] font-normal text-[var(--texto-3)]">
                          ({comercial.score.base} do cadastro
                          {comercial.score.ajuste > 0 ? " +" : " "}
                          {comercial.score.ajuste} pelo comportamento)
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-snug text-[var(--texto-3)]">
                      Prioridade interna — nunca diga isso ao cliente.
                    </p>
                  </div>

                  {comercial.memoria?.dorConfirmada ? (
                    <div>
                      <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                        ✅ Dor confirmada
                      </p>
                      <p className="text-[13px] leading-relaxed">
                        {comercial.memoria.dorConfirmada}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                        💡 Hipótese
                      </p>
                      <p className="text-[13px] leading-relaxed text-[var(--texto-2)]">
                        {comercial.proposta.problema}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                      🛠 Solução
                    </p>
                    <p className="text-[13px] leading-relaxed">{comercial.proposta.solucao}</p>
                  </div>

                  {/* ---------------------------------------- próxima ação */}
                  <div className="rounded-[10px] bg-[var(--azul-fraco)] px-3 py-2.5">
                    <p className="text-[12px] uppercase tracking-wide text-[var(--azul)]">
                      🎯 Próxima ação
                    </p>
                    <p className="mt-0.5 text-[13.5px] font-semibold text-[var(--azul)]">
                      {comercial.proximaAcao.titulo}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--texto-2)]">
                      {comercial.proximaAcao.motivo}
                    </p>
                    {comercial.proximaAcao.pergunta && (
                      <>
                        <p className="mt-2 rounded-[8px] bg-[var(--fundo)] px-2.5 py-2 text-[13px] leading-relaxed">
                          {comercial.proximaAcao.pergunta}
                        </p>
                        <button
                          onClick={() => setTexto(comercial.proximaAcao.pergunta!)}
                          className="btn-secundario mt-2"
                        >
                          Usar sugestão
                        </button>
                      </>
                    )}
                  </div>

                  {/* ---------------------------------------- objeção */}
                  {comercial.objecao && (
                    <div className="rounded-[10px] bg-[var(--ambar-fraco)] px-3 py-2.5">
                      <p className="text-[12px] uppercase tracking-wide text-[var(--ambar)]">
                        🧠 Objeção detectada — {comercial.objecao.nome}
                      </p>
                      <p className="mt-1 text-[12.5px] italic leading-relaxed text-[var(--texto-2)]">
                        “{comercial.objecao.trecho}”
                      </p>
                      <p className="mt-2 text-[12.5px] leading-relaxed">
                        <strong>Estratégia:</strong> {comercial.objecao.estrategia}
                      </p>
                      <p className="mt-2 rounded-[8px] bg-[var(--fundo)] px-2.5 py-2 text-[13px] leading-relaxed">
                        {comercial.objecao.resposta}
                      </p>
                      <button
                        onClick={() => setTexto(comercial.objecao!.resposta)}
                        className="btn-secundario mt-2"
                      >
                        Usar resposta
                      </button>
                    </div>
                  )}

                  {/* ---------------------------------------- diagnóstico */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                      🔍 Diagnóstico ({comercial.diagnostico.filter((d) => d.respondida).length}/
                      {comercial.diagnostico.length})
                    </p>
                    <div className="mt-1.5 space-y-2">
                      {comercial.diagnostico.map((d) => (
                        <div key={d.pergunta}>
                          <p className="text-[12.5px] leading-snug">
                            {d.respondida ? "✓" : "○"} {d.pergunta}
                          </p>
                          {d.respondida ? (
                            <p className="mt-0.5 pl-4 text-[12px] leading-snug text-[var(--texto-2)]">
                              {d.resposta}
                              <br />
                              <span className="text-[var(--texto-3)]">{d.insight}</span>
                            </p>
                          ) : (
                            <div className="mt-1 flex gap-1.5 pl-4">
                              <button
                                onClick={() => setTexto(d.pergunta)}
                                className="text-[11.5px] text-[var(--azul)] underline"
                              >
                                perguntar
                              </button>
                              <button
                                onClick={() => setRegistrando(d.pergunta)}
                                className="text-[11.5px] text-[var(--texto-3)] underline"
                              >
                                registrar resposta
                              </button>
                            </div>
                          )}
                          {registrando === d.pergunta && (
                            <div className="mt-1.5 pl-4">
                              <input
                                value={respostaDiag}
                                onChange={(e) => setRespostaDiag(e.target.value)}
                                placeholder="O que ele respondeu?"
                                className="w-full rounded-[8px] bg-[var(--superficie)] px-2.5 py-1.5 text-[12.5px]"
                              />
                              <div className="mt-1.5 flex gap-1.5">
                                <button
                                  onClick={() => registrarDiagnostico(d.pergunta)}
                                  className="btn-primario"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setRegistrando(null)}
                                  className="btn-secundario"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ---------------------------------------- comercial */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-[var(--texto-3)]">
                      💰 Comercial
                    </p>
                    {comercial.negocio ? (
                      <p className="text-[13px] leading-relaxed">
                        {comercial.negocio.status} ·{" "}
                        {comercial.negocio.setup != null
                          ? `setup R$ ${comercial.negocio.setup}`
                          : "setup a definir"}{" "}
                        ·{" "}
                        {comercial.negocio.mensalidade != null
                          ? `R$ ${comercial.negocio.mensalidade}/mês`
                          : "mensalidade a definir"}
                      </p>
                    ) : (
                      <>
                        <p className="text-[12.5px] leading-relaxed text-[var(--texto-2)]">
                          Sem proposta registrada.
                        </p>
                        {comercial.proposta.pendencias.map((p) => (
                          <p key={p} className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">
                            • {p}
                          </p>
                        ))}
                        <button onClick={criarProposta} className="btn-secundario mt-2">
                          Gerar proposta
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Link
                href={`/lead/${thread.lead.id}`}
                className="mt-4 text-[13px] text-[var(--azul)] hover:underline"
              >
                Ver painel completo →
              </Link>
            </>
          ) : (
            <p className="text-[13px] text-[var(--texto-3)]">—</p>
          )}
        </section>
      </div>
    </main>
  );
}
