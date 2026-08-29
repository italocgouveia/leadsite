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

export default function ConversasPage() {
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [thread, setThread] = useState<{ lead: Lead; mensagens: Conversa[] } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    },
    [carregarLista],
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
