"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";
import { ROTULO_INTENCAO, ROTULO_ETAPA, type Contato } from "@/lib/demo-automacao/motor";

/**
 * 💬 CONVERSAS IA — a caixa de entrada.
 *
 * Três colunas: a lista, a conversa aberta, o que a IA concluiu. No celular
 * as colunas viram etapas — lista → conversa → dados — porque três colunas
 * numa tela de 380px é ilegível e a apresentação às vezes é no telefone.
 *
 * "IA está digitando…" aparece por ~1s antes da resposta entrar. É ritmo de
 * apresentação, não latência: o motor responde na hora.
 */

function tempo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60_000;
  if (diff < 1) return "agora";
  if (diff < 60) return `${Math.floor(diff)} min`;
  if (diff < 1440) return `${Math.floor(diff / 60)} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function BadgeContato({ c }: { c: Contato }) {
  if (c.atendimentoHumano) return <Etiqueta tom="alerta">👤 Humano</Etiqueta>;
  if (c.etapa === "agendado") return <Etiqueta tom="bom">📅 Agendamento</Etiqueta>;
  if (c.etapa === "interessado") return <Etiqueta tom="bom">🔥 Interessado</Etiqueta>;
  if (c.intencao === "preco") return <Etiqueta tom="acao">💰 Orçamento</Etiqueta>;
  if (c.precisaHumano) return <Etiqueta tom="alerta">⏳ Aguardando humano</Etiqueta>;
  if (c.atendidoPelaIA) return <Etiqueta tom="acao">🤖 IA atendendo</Etiqueta>;
  return <Etiqueta>⏳ Aguardando resposta</Etiqueta>;
}

export default function ConversasPage() {
  const { estado, digitandoEm, apresentacao, simular, assumir, devolver } = useDemo();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "ia" | "humano" | "interessados">("todas");
  const fim = useRef<HTMLDivElement>(null);

  const conversas = useMemo(() => {
    const comMensagem = estado.contatos.filter((c) => c.mensagens.length > 0);
    const filtradas = comMensagem.filter((c) => {
      if (filtro === "ia") return c.atendidoPelaIA && !c.atendimentoHumano;
      if (filtro === "humano") return c.atendimentoHumano || c.precisaHumano;
      if (filtro === "interessados") return c.etapa === "interessado" || c.etapa === "agendado";
      return true;
    });
    return filtradas.sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));
  }, [estado.contatos, filtro]);

  const atual = estado.contatos.find((c) => c.id === selecionado) ?? conversas[0] ?? null;

  /** Ao chegar mensagem nova, a conversa aberta rola para o fim. */
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [atual?.mensagens.length, digitandoEm]);

  /** Quando a simulação toca um contato, a lista o traz para cima e o abre. */
  useEffect(() => {
    void (async () => {
      if (digitandoEm) setSelecionado(digitandoEm);
    })();
  }, [digitandoEm]);

  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["todas", "Todas"],
            ["ia", "🤖 IA atendendo"],
            ["interessados", "🔥 Interessados"],
            ["humano", "👤 Humano"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`rounded-full px-3 py-1.5 text-[12px] transition ${
              filtro === id ? "bg-[var(--acao)] font-medium text-[#04201d]" : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
            }`}
          >
            {rotulo}
          </button>
        ))}
        <button onClick={simular} className="btn-primario ml-auto">
          ✨ SIMULAR NOVA MENSAGEM
        </button>
      </div>

      <div className={`grid gap-3 ${apresentacao ? "lg:grid-cols-[260px_1fr_260px]" : "lg:grid-cols-[280px_1fr_280px]"}`}>
        {/* ───────────── coluna 1: lista ───────────── */}
        <section className={`cartao max-h-[70vh] overflow-y-auto p-2 ${atual && "max-lg:hidden"}`}>
          {conversas.length === 0 && (
            <p className="p-3 text-[12.5px] text-[var(--texto-3)]">Nenhuma conversa neste filtro.</p>
          )}
          {conversas.map((c) => {
            const ultima = c.mensagens.at(-1);
            const ativo = atual?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelecionado(c.id)}
                className={`block w-full rounded-[10px] px-3 py-2.5 text-left transition ${
                  ativo ? "bg-[var(--superficie-2)]" : "hover:bg-[var(--superficie)]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13.5px] font-medium">{c.nome}</p>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--texto-3)]">
                    {tempo(c.ultimaAtividade)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[var(--texto-3)]">
                  {digitandoEm === c.id ? (
                    <span className="text-[var(--acao)]">IA está digitando…</span>
                  ) : (
                    ultima?.texto
                  )}
                </p>
                <div className="mt-1.5">
                  <BadgeContato c={c} />
                </div>
              </button>
            );
          })}
        </section>

        {/* ───────────── coluna 2: conversa ───────────── */}
        <section className="cartao flex max-h-[70vh] flex-col">
          {!atual ? (
            <p className="p-6 text-center text-[13px] text-[var(--texto-3)]">
              Selecione uma conversa, ou clique em SIMULAR NOVA MENSAGEM.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--linha)] px-4 py-3">
                <div>
                  <button onClick={() => setSelecionado(null)} className="mr-2 text-[13px] text-[var(--acao)] lg:hidden">
                    ‹
                  </button>
                  <span className="text-[14px] font-medium">{atual.nome}</span>
                  <span className="ml-2 text-[11.5px] tabular-nums text-[var(--texto-3)]">{atual.telefone}</span>
                </div>
                <BadgeContato c={atual} />
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {atual.mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.autor === "cliente" ? "justify-start" : m.autor === "sistema" ? "justify-center" : "justify-end"}`}
                  >
                    {m.autor === "sistema" ? (
                      <p className="rounded-full bg-[var(--ambar-fraco)] px-3 py-1 text-[11.5px] text-[var(--ambar)]">
                        {m.texto}
                      </p>
                    ) : (
                      <div
                        className={`max-w-[78%] rounded-[14px] px-3.5 py-2 ${
                          m.autor === "cliente"
                            ? "rounded-bl-[4px] bg-[var(--superficie-2)]"
                            : "rounded-br-[4px] bg-[var(--acao-fraco)]"
                        }`}
                      >
                        <p className={`${apresentacao ? "text-[14.5px]" : "text-[13px]"} leading-relaxed`}>{m.texto}</p>
                        <p className="mt-1 text-right text-[10px] text-[var(--texto-3)]">
                          {m.autor === "ia" ? "🤖 IA · " : m.autor === "humano" ? "👤 · " : ""}
                          {tempo(m.em)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                {digitandoEm === atual.id && (
                  <div className="flex justify-end">
                    <div className="rounded-[14px] rounded-br-[4px] bg-[var(--acao-fraco)] px-3.5 py-2 text-[12px] text-[var(--acao)]">
                      IA está digitando<span className="animate-pulse">…</span>
                    </div>
                  </div>
                )}
                <div ref={fim} />
              </div>

              <div className="border-t border-[var(--linha)] px-4 py-3">
                {atual.atendimentoHumano ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12.5px] text-[var(--ambar)]">
                      IA pausada nesta conversa. Atendimento humano assumiu.
                    </p>
                    <button onClick={() => devolver(atual.id)} className="btn-secundario">
                      DEVOLVER PARA A IA
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-[var(--texto-3)]">
                      {estado.iaAtiva ? "🤖 A IA responde esta conversa" : "⚪ IA pausada globalmente"}
                    </p>
                    <button onClick={() => assumir(atual.id)} className="btn-primario">
                      ASSUMIR ATENDIMENTO
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ───────────── coluna 3: o que a IA concluiu ───────────── */}
        {atual && (
          <section className="cartao p-4 max-lg:hidden">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
              Leitura da IA
            </p>
            <dl className="mt-3 space-y-3 text-[13px]">
              <div>
                <dt className="text-[11px] text-[var(--texto-3)]">🎯 Intenção detectada</dt>
                <dd className="mt-0.5 font-medium">{ROTULO_INTENCAO[atual.intencao]}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--texto-3)]">🔥 Interesse</dt>
                <dd className="mt-0.5 font-medium capitalize">{atual.interesse}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--texto-3)]">Etapa</dt>
                <dd className="mt-0.5 font-medium">{ROTULO_ETAPA[atual.etapa]}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--texto-3)]">🤖 IA</dt>
                <dd className="mt-0.5 font-medium">
                  {atual.atendimentoHumano ? "Pausada — humano assumiu" : estado.iaAtiva ? "Ativa" : "Pausada"}
                </dd>
              </div>
              {atual.agendamento && (
                <div>
                  <dt className="text-[11px] text-[var(--texto-3)]">📅 Agendamento</dt>
                  <dd className="mt-0.5 font-medium">{atual.agendamento}</dd>
                </div>
              )}
              {atual.precisaHumano && !atual.atendimentoHumano && (
                <div className="rounded-[10px] bg-[var(--ambar-fraco)] px-3 py-2 text-[12px] text-[var(--ambar)]">
                  Este cliente pediu uma pessoa. A IA já avisou que vai transferir.
                </div>
              )}
            </dl>
            {!apresentacao && (
              <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--texto-3)]">
                Classificação por regras locais. Sem chave, sem rede, sem custo — o mesmo contrato que
                um motor de IA real cumpriria por trás.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
