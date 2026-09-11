"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";
import { ROTULO_INTENCAO, ROTULO_ETAPA, proximaAcao, type Contato } from "@/lib/demo-automacao/motor";

/**
 * 💬 CONVERSAS IA — a caixa de entrada, e o centro da apresentação.
 *
 * Três colunas no desktop: a lista, a conversa aberta, a leitura da IA. No
 * celular viram DUAS TELAS — lista ou conversa — controladas por estado
 * próprio (`aberto`). A primeira versão derivava a conversa aberta de
 * `conversas[0]` e escondia a lista sempre que havia conversa: no celular a
 * lista simplesmente nunca aparecia, e o botão de voltar não voltava.
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

function Badge({ c, digitando }: { c: Contato; digitando: boolean }) {
  if (c.atendimentoHumano) return <Etiqueta tom="alerta">👤 Humano</Etiqueta>;
  if (digitando) return <Etiqueta tom="acao">🤖 IA atendendo</Etiqueta>;
  if (c.etapa === "agendado") return <Etiqueta tom="bom">📅 Agendamento</Etiqueta>;
  if (c.intencao === "preco") return <Etiqueta tom="bom">💰 Orçamento</Etiqueta>;
  if (c.etapa === "interessado" || c.interesse === "alto") return <Etiqueta tom="bom">🔥 Interessado</Etiqueta>;
  if (c.intencao === "sem-interesse") return <Etiqueta>❌ Sem interesse</Etiqueta>;
  if (c.intencao === "humano") return <Etiqueta tom="alerta">⏳ Aguardando humano</Etiqueta>;
  if (c.aguardandoIA) return <Etiqueta>⏳ Aguardando resposta</Etiqueta>;
  return <Etiqueta tom="acao">🤖 IA atendendo</Etiqueta>;
}

const ROTULO_INTERESSE = { alto: "🔥 Alto", medio: "🟡 Médio", baixo: "⚪ Baixo", indefinido: "❔ Indefinido" } as const;

/**
 * A NARRATIVA — os sete passos da operação, com o passo atual aceso.
 *
 * É o que o cliente precisa entender, e é mais importante que qualquer
 * gráfico: recebe → entende → responde → qualifica → identifica oportunidade
 * → agenda ou transfere → equipe assume. O passo aceso é derivado do estado
 * da conversa aberta, então ele anda conforme a conversa avança.
 */
const NARRATIVA = ["Atendimento recebido", "IA entende", "IA responde", "IA qualifica", "IA identifica oportunidade", "IA agenda ou transfere", "Equipe assume"];

function passoAtual(c: Contato | null, digitando: boolean): number {
  if (!c || !c.mensagens.length) return -1;
  if (c.atendimentoHumano) return 6;
  if (c.etapa === "agendado" || c.intencao === "humano") return 5;
  if (c.intencao === "preco" || c.etapa === "negociacao") return 4;
  if (c.interesse !== "indefinido" && c.mensagens.some((m) => m.autor === "ia")) return 3;
  if (digitando) return 1;
  if (c.mensagens.some((m) => m.autor === "ia")) return 2;
  return 0;
}

function Narrativa({ passo }: { passo: number }) {
  return (
    <div className="mb-3 overflow-x-auto">
      <div className="flex min-w-[860px] items-center gap-1.5">
        {NARRATIVA.map((n, i) => {
          const feito = i < passo;
          const atual = i === passo;
          return (
            <div key={n} className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-3 py-1.5 text-[11.5px] transition ${
                  atual
                    ? "bg-[var(--acao)] font-medium text-[#04201d] shadow-[var(--brilho-acao)]"
                    : feito
                      ? "bg-[var(--acao-fraco)] text-[var(--acao)]"
                      : "bg-[var(--superficie)] text-[var(--texto-3)]"
                }`}
              >
                {feito ? "✓ " : ""}{n}
              </span>
              {i < NARRATIVA.length - 1 && <span className="text-[var(--texto-3)]">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeituraIA({ c, estadoIA, compacta }: { c: Contato; estadoIA: boolean; compacta?: boolean }) {
  const itens = [
    ["Intenção", ROTULO_INTENCAO[c.intencao]],
    ["Interesse", ROTULO_INTERESSE[c.interesse]],
    ["Etapa", ROTULO_ETAPA[c.etapa]],
  ];
  if (compacta) {
    return (
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--linha)] px-4 py-2">
        {itens.map(([r, v]) => (
          <Etiqueta key={r} titulo={r}>{v}</Etiqueta>
        ))}
        <Etiqueta tom="acao" titulo="Próxima ação">→ {proximaAcao(c.intencao, c.etapa, c.atendimentoHumano)}</Etiqueta>
      </div>
    );
  }
  return (
    <>
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Leitura da IA</p>
      <dl className="mt-3 space-y-3 text-[13px]">
        {itens.map(([r, v]) => (
          <div key={r}>
            <dt className="text-[11px] text-[var(--texto-3)]">{r}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
        <div>
          <dt className="text-[11px] text-[var(--texto-3)]">Confiança</dt>
          <dd className="mt-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                <div className="h-full rounded-full bg-[var(--acao)] transition-[width]" style={{ width: `${c.confianca}%` }} />
              </div>
              <span className="text-[12px] font-medium tabular-nums">{c.confianca}%</span>
            </div>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--texto-3)]">Próxima ação</dt>
          <dd className="mt-0.5 font-medium text-[var(--acao)]">{proximaAcao(c.intencao, c.etapa, c.atendimentoHumano)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--texto-3)]">Motivo</dt>
          <dd className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--texto-2)]">{c.motivo}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--texto-3)]">🤖 IA</dt>
          <dd className="mt-0.5 font-medium">{c.atendimentoHumano ? "Pausada — humano assumiu" : estadoIA ? "Ativa" : "Pausada"}</dd>
        </div>
      </dl>
    </>
  );
}

export default function ConversasPage() {
  const { estado, digitandoEm, apresentacao, simular, assumir, devolver } = useDemo();
  const [selecionado, setSelecionado] = useState<string | null>(null);
  /** No celular: a conversa está aberta (true) ou a lista (false)? */
  const [aberto, setAberto] = useState(false);
  /** Seguir ao vivo: a tela pula para a conversa que a IA está atendendo. */
  const [seguir, setSeguir] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "ia" | "interessados" | "orcamento" | "humano">("todas");
  const fim = useRef<HTMLDivElement>(null);

  const conversas = useMemo(
    () =>
      estado.contatos
        .filter((c) => c.mensagens.length > 0)
        .filter((c) => {
          if (filtro === "ia") return !c.atendimentoHumano && c.etapa !== "encerrado";
          if (filtro === "interessados") return c.interesse === "alto" && !c.atendimentoHumano;
          if (filtro === "orcamento") return c.intencao === "preco";
          if (filtro === "humano") return c.atendimentoHumano || c.intencao === "humano";
          return true;
        })
        .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade)),
    [estado.contatos, filtro],
  );

  const atual = estado.contatos.find((c) => c.id === selecionado) ?? conversas[0] ?? null;
  const digitando = Boolean(atual && digitandoEm === atual.id);
  const passo = passoAtual(atual, digitando);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [atual?.mensagens.length, digitandoEm]);

  /**
   * Seguir ao vivo: quando a simulação toca um contato, a tela o abre. É o
   * que dá a sensação de operação acontecendo — e é desligável, porque no
   * meio de uma frase sobre UMA conversa a tela não pode pular para outra.
   */
  useEffect(() => {
    void (async () => {
      if (digitandoEm && seguir) {
        setSelecionado(digitandoEm);
        setAberto(true);
      }
    })();
  }, [digitandoEm, seguir]);

  const abrir = (id: string) => {
    setSelecionado(id);
    setAberto(true);
  };

  const FILTROS = [
    ["todas", "Todas"],
    ["ia", "🤖 IA atendendo"],
    ["interessados", "🔥 Interessados"],
    ["orcamento", "💰 Orçamento"],
    ["humano", "👤 Humano"],
  ] as const;

  return (
    <main>
      {apresentacao && <Narrativa passo={passo} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!apresentacao &&
          FILTROS.map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={`rounded-full px-3 py-1.5 text-[12px] transition ${filtro === id ? "bg-[var(--acao)] font-medium text-[#04201d]" : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"}`}
            >
              {rotulo}
            </button>
          ))}
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--texto-3)]">
          <input type="checkbox" checked={seguir} onChange={(e) => setSeguir(e.target.checked)} />
          seguir ao vivo
        </label>
        <button onClick={simular} className="btn-primario ml-auto">✨ SIMULAR NOVA MENSAGEM</button>
      </div>

      <div className={`grid gap-3 ${apresentacao ? "lg:grid-cols-[240px_1fr_260px]" : "lg:grid-cols-[280px_1fr_280px]"}`}>
        {/* ───────────── coluna 1: lista ───────────── */}
        <section className={`cartao max-h-[72vh] overflow-y-auto p-2 ${aberto ? "max-lg:hidden" : ""}`}>
          {conversas.length === 0 && <p className="p-3 text-[12.5px] text-[var(--texto-3)]">Nenhuma conversa neste filtro.</p>}
          {conversas.map((c) => {
            const ultima = c.mensagens.at(-1);
            const ativo = atual?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={`block w-full rounded-[10px] px-3 py-2.5 text-left transition ${ativo ? "bg-[var(--superficie-2)]" : "hover:bg-[var(--superficie)]"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13.5px] font-medium">{c.nome}</p>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--texto-3)]">{tempo(c.ultimaAtividade)}</span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[var(--texto-3)]">
                  {digitandoEm === c.id ? <span className="text-[var(--acao)]">IA está digitando…</span> : ultima?.texto}
                </p>
                <div className="mt-1.5"><Badge c={c} digitando={digitandoEm === c.id} /></div>
              </button>
            );
          })}
        </section>

        {/* ───────────── coluna 2: conversa ───────────── */}
        <section className={`cartao flex max-h-[72vh] flex-col ${!aberto ? "max-lg:hidden" : ""}`}>
          {!atual ? (
            <p className="p-6 text-center text-[13px] text-[var(--texto-3)]">Selecione uma conversa, ou clique em SIMULAR NOVA MENSAGEM.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--linha)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button onClick={() => setAberto(false)} className="text-[15px] text-[var(--acao)] lg:hidden" aria-label="voltar à lista">‹</button>
                  <span className="truncate text-[14px] font-medium">{atual.nome}</span>
                  {!apresentacao && <span className="text-[11.5px] tabular-nums text-[var(--texto-3)]">{atual.telefone}</span>}
                </div>
                {atual.atendimentoHumano ? (
                  <span className="shrink-0 text-[11.5px] text-[var(--ambar)]">👤 Humano assumiu</span>
                ) : estado.iaAtiva ? (
                  <span className="shrink-0 text-[11.5px] text-[var(--acao)]">🤖 IA está atendendo</span>
                ) : null}
              </div>

              {/* No celular a leitura da IA vira uma faixa compacta aqui. */}
              <div className="lg:hidden"><LeituraIA c={atual} estadoIA={estado.iaAtiva} compacta /></div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {atual.mensagens.map((m) => (
                  <div key={m.id} className={`flex ${m.autor === "cliente" ? "justify-start" : m.autor === "sistema" ? "justify-center" : "justify-end"}`}>
                    {m.autor === "sistema" ? (
                      <p className="rounded-full bg-[var(--ambar-fraco)] px-3 py-1.5 text-center text-[12px] font-medium text-[var(--ambar)]">{m.texto}</p>
                    ) : (
                      <div className={`max-w-[78%] rounded-[14px] px-3.5 py-2 ${m.autor === "cliente" ? "rounded-bl-[4px] bg-[var(--superficie-2)]" : "rounded-br-[4px] bg-[var(--acao-fraco)]"}`}>
                        <p className={`${apresentacao ? "text-[15.5px]" : "text-[13px]"} leading-relaxed`}>{m.texto}</p>
                        <p className="mt-1 text-right text-[10px] text-[var(--texto-3)]">{m.autor === "ia" ? "🤖 IA · " : m.autor === "humano" ? "👤 · " : ""}{tempo(m.em)}</p>
                      </div>
                    )}
                  </div>
                ))}
                {digitando && (
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
                    <p className="text-[12.5px] font-medium text-[var(--ambar)]">👤 Humano assumiu · IA pausada nesta conversa</p>
                    <button onClick={() => devolver(atual.id)} className="btn-secundario">DEVOLVER PARA A IA</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-[var(--texto-3)]">{estado.iaAtiva ? "🤖 A IA responde esta conversa" : "⚪ IA pausada globalmente"}</p>
                    <button onClick={() => assumir(atual.id)} className="btn-primario">👤 ASSUMIR ATENDIMENTO</button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ───────────── coluna 3: leitura da IA (desktop) ───────────── */}
        {atual && (
          <section className="cartao p-4 max-lg:hidden">
            <LeituraIA c={atual} estadoIA={estado.iaAtiva} />
            {!apresentacao && (
              <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--texto-3)]">
                Classificação por roteiro local. Sem chave, sem rede, sem custo — o mesmo contrato que um motor de IA real cumpriria por trás.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
