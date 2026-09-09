"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STATUS, corStatus, rotuloStatus } from "@/lib/etapa-simples";
import { SERVICOS } from "@/lib/servicos";

/**
 * Prospecção: uma tela só.
 *
 * Substitui o vaivém entre Painel, Meus leads, Pipeline e as três telas de
 * "Vender X". Aquilo obrigava a decorar em qual página estava cada coisa; a
 * pergunta do dia a dia — *quem eu procuro agora e o que ofereço?* — não
 * cabia em nenhuma delas sozinha.
 *
 * Tudo acontece aqui: a lista, a edição em linha, o painel lateral e o
 * cadastro. Nenhuma ação leva para outra rota.
 */

type Lead = {
  id: string;
  empresa: string;
  responsavel: string | null;
  segmento: string;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  site: string | null;
  maps: string | null;
  servico: string;
  servicoSugerido: boolean;
  status: string;
  etapaReal: string;
  valor: number | null;
  notas: string | null;
  proximoContato: string | null;
  ultimoContato: string;
  criadoEm: string;
  pontos: number;
  faixa: "muito-quente" | "quente" | "medio" | "frio";
  emoji: string;
  rotuloPontos: string;
  contato: number;
  rotuloContato: string;
};

/**
 * Faixas de temperatura. As cores vão de quente para frio de propósito —
 * a lista já vem ordenada, então a cor confirma a ordem em vez de competir
 * com ela.
 */
const FAIXAS = [
  { valor: "muito-quente", rotulo: "Muito quente", cor: "#ff5f57" },
  { valor: "quente", rotulo: "Quente", cor: "#febc2e" },
  { valor: "medio", rotulo: "Médio", cor: "#2f8fff" },
  { valor: "frio", rotulo: "Frio", cor: "#8b8b8b" },
] as const;

function corFaixa(f: string) {
  return FAIXAS.find((x) => x.valor === f)?.cor ?? "#8b8b8b";
}

/** A nota, com a barra que deixa a escala visível sem precisar ler o número. */
function Nota({ lead }: { lead: Lead }) {
  const cor = corFaixa(lead.faixa);
  return (
    <div
      className="flex items-center gap-2"
      title={`${lead.rotuloPontos} · ${lead.rotuloContato}`}
    >
      <span className="w-7 shrink-0 text-right text-[13px] font-medium tabular-nums" style={{ color: cor }}>
        {lead.pontos}
      </span>
      <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--superficie-2)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(4, lead.pontos)}%`, background: cor }}
        />
      </span>
    </div>
  );
}

type Resumo = {
  total: number;
  novo: number;
  conversa: number;
  proposta: number;
  fechado: number;
  perdido: number;
};

/** "Hoje", "Ontem", "há 3 dias" — data crua não responde "está atrasado?". */
function quando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function Etiqueta({ status }: { status: string }) {
  const cor = corStatus(status);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: `${cor}22`, color: cor }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {rotuloStatus(status)}
    </span>
  );
}

export default function Prospeccao() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  /**
   * Aba principal: quem ainda não foi abordado x quem já foi.
   *
   * A lista única misturava 801 novos com 60 contatados, e a pergunta de
   * quem abre a tela para trabalhar é sempre uma das duas — "quem eu
   * procuro agora?" ou "quem está esperando retorno?". Numa lista só, a
   * segunda pergunta some no meio da primeira.
   */
  const [aba, setAba] = useState<"novos" | "contatados" | "todos">("novos");
  const [fStatus, setFStatus] = useState("todos");
  const [fServico, setFServico] = useState("todos");
  const [fFaixa, setFFaixa] = useState("todos");
  const [visao, setVisao] = useState<"tabela" | "cards">("tabela");

  const [aberto, setAberto] = useState<Lead | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/prospeccao").then((x) => x.json());
    setLeads(r.leads ?? []);
    setResumo(r.resumo ?? null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/prospeccao")
      .then((x) => x.json())
      .then((r) => {
        if (!vivo) return;
        setLeads(r.leads ?? []);
        setResumo(r.resumo ?? null);
        setCarregando(false);
      })
      .catch(() => setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  /** Salva um campo e atualiza a linha na hora, sem recarregar a lista. */
  async function salvar(id: string, mudanca: Partial<Record<string, unknown>>) {
    const res = await fetch("/api/prospeccao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...mudanca }),
    });
    const corpo = await res.json();
    if (!res.ok) {
      setAviso(corpo.erro ?? "Não consegui salvar.");
      return null;
    }
    setLeads((l) => l.map((x) => (x.id === id ? corpo.lead : x)));
    setAberto((a) => (a && a.id === id ? corpo.lead : a));
    void carregar();
    return corpo.lead as Lead;
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (aba === "novos" && l.status !== "novo") return false;
      if (aba === "contatados" && l.status === "novo") return false;
      if (fStatus !== "todos" && l.status !== fStatus) return false;
      if (fServico !== "todos" && l.servico !== fServico) return false;
      if (fFaixa !== "todos" && l.faixa !== fFaixa) return false;
      if (!t) return true;
      return (
        l.empresa.toLowerCase().includes(t) ||
        (l.responsavel ?? "").toLowerCase().includes(t) ||
        (l.cidade ?? "").toLowerCase().includes(t) ||
        (l.segmento ?? "").toLowerCase().includes(t) ||
        (l.telefone ?? "").includes(t)
      );
    });
  }, [leads, aba, busca, fStatus, fServico, fFaixa]);

  /**
   * Cada ficha leva para a aba certa E ao filtro certo.
   *
   * Antes elas só mexiam no filtro fino: clicar em "Fechados" estando na aba
   * "Novos" cruzava dois cortes incompatíveis e devolvia lista vazia, sem
   * nada na tela explicando por quê.
   */
  const cartoes: [string, number, "novos" | "contatados" | "todos", string][] = resumo
    ? [
        ["Total", resumo.total, "todos", "todos"],
        ["Novos", resumo.novo, "novos", "todos"],
        ["Em conversa", resumo.conversa, "contatados", "conversa"],
        ["Propostas", resumo.proposta, "contatados", "proposta"],
        ["Fechados", resumo.fechado, "contatados", "fechado"],
        ["Perdidos", resumo.perdido, "contatados", "perdido"],
      ]
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-6 lg:pt-10">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Prospecção</h1>
        <p className="mt-1 text-[14px] text-[var(--texto-2)]">
          Todos os seus leads, o que você quer vender para cada um e em que pé está.
        </p>
      </header>

      {/* ─────────────────────────── números ─────────────────────────── */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cartoes.map(([rotulo, n, abaAlvo, statusAlvo]) => {
          const ativo = aba === abaAlvo && fStatus === statusAlvo;
          return (
          <button
            key={rotulo}
            onClick={() => {
              setAba(abaAlvo);
              setFStatus(statusAlvo);
            }}
            className={`rounded-[12px] border p-3 text-left transition ${
              ativo
                ? "border-[var(--azul)] bg-[var(--azul-fraco)]"
                : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-forte)]"
            }`}
          >
            <p className="text-[12px] text-[var(--texto-2)]">{rotulo}</p>
            <p className="mt-0.5 text-[22px] font-semibold tabular-nums">{n}</p>
          </button>
          );
        })}
      </section>

      {/* ─────────────────────── barra de controle ────────────────────── */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setNovoAberto(true)} className="btn-primario">
          + Adicionar lead
        </button>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa ou contato…"
          className="campo min-w-0 flex-1 sm:max-w-xs"
        />

        <select
          value={fServico}
          onChange={(e) => setFServico(e.target.value)}
          className="campo w-auto"
          aria-label="Filtrar por serviço"
        >
          <option value="todos">Todo serviço</option>
          {SERVICOS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>

        <select
          value={fFaixa}
          onChange={(e) => setFFaixa(e.target.value)}
          className="campo w-auto"
          aria-label="Filtrar por temperatura"
        >
          <option value="todos">Toda temperatura</option>
          {FAIXAS.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>

        <div className="ml-auto flex rounded-[10px] border border-[var(--linha)] p-0.5">
          {(["tabela", "cards"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={`rounded-[8px] px-3 py-1.5 text-[13px] capitalize transition ${
                visao === v
                  ? "bg-[var(--superficie-2)] text-[var(--texto)]"
                  : "text-[var(--texto-3)] hover:text-[var(--texto-2)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      {/* ─────────────────── abas: o corte principal ─────────────────── */}
      <section className="mb-4 flex gap-1 border-b border-[var(--linha)]">
        {(
          [
            ["novos", "Novos", resumo?.novo ?? 0],
            ["contatados", "Contatados", (resumo?.total ?? 0) - (resumo?.novo ?? 0)],
            ["todos", "Todos", resumo?.total ?? 0],
          ] as const
        ).map(([v, rotulo, n]) => (
          <button
            key={v}
            onClick={() => {
              setAba(v);
              // A aba já é um corte por status; manter o filtro fino ligado
              // produziria combinações vazias sem explicação na tela.
              setFStatus("todos");
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-[14px] transition ${
              aba === v
                ? "border-[var(--azul)] font-medium text-[var(--texto)]"
                : "border-transparent text-[var(--texto-3)] hover:text-[var(--texto-2)]"
            }`}
          >
            {rotulo}
            <span className="ml-1.5 text-[12px] tabular-nums text-[var(--texto-3)]">{n}</span>
          </button>
        ))}
      </section>

      {/* Refino por etapa, só dentro de "Contatados" — em "Novos" todos têm
          o mesmo status e a fileira não filtraria nada. */}
      {aba !== "novos" && (
        <section className="mb-5 flex flex-wrap gap-1.5">
          {[{ valor: "todos", rotulo: "Todas as etapas" }, ...STATUS.filter((x) => x.valor !== "novo")].map((s2) => (
            <button
              key={s2.valor}
              onClick={() => setFStatus(s2.valor)}
              className={`rounded-[8px] px-2.5 py-1.5 text-[13px] transition ${
                fStatus === s2.valor
                  ? "bg-[var(--azul)] text-white"
                  : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
              }`}
            >
              {s2.rotulo}
            </button>
          ))}
        </section>
      )}

      {aviso && (
        <p className="mb-4 rounded-[10px] bg-[var(--vermelho-fraco)] px-4 py-3 text-[13px] leading-relaxed text-[var(--vermelho)]">
          {aviso}{" "}
          <button onClick={() => setAviso(null)} className="underline">
            ok
          </button>
        </p>
      )}

      <p className="mb-3 text-[13px] text-[var(--texto-3)]">
        {visiveis.length} de {leads.length}
      </p>

      {/* ──────────────────────────── lista ──────────────────────────── */}
      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="esqueleto h-14" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--linha)] px-6 py-16 text-center">
          <p className="text-[15px]">Nenhum lead com esse filtro.</p>
          <p className="mt-1 text-[13.5px] text-[var(--texto-2)]">
            Limpe a busca ou{" "}
            <Link href="/" className="text-[var(--azul)]">
              busque novos leads
            </Link>
            .
          </p>
        </div>
      ) : visao === "tabela" ? (
        <div className="overflow-x-auto rounded-[12px] border border-[var(--linha)]">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="border-b border-[var(--linha)] text-left text-[12px] text-[var(--texto-3)]">
                <th className="px-3 py-2.5 font-medium">Nota</th>
                <th className="px-3 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Contato</th>
                <th className="px-3 py-2.5 font-medium">Quero vender</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Último contato</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-[var(--linha)] last:border-0 hover:bg-[var(--superficie)]"
                >
                  <td className="px-3 py-2.5">
                    <Nota lead={l} />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setAberto(l)}
                      className="text-left font-medium hover:text-[var(--azul)]"
                    >
                      {l.empresa}
                    </button>
                    <p className="text-[12px] capitalize text-[var(--texto-3)]">
                      {l.segmento}
                      {l.cidade ? ` · ${l.cidade}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p>{l.responsavel ?? "—"}</p>
                    <p className="text-[12px] tabular-nums text-[var(--texto-3)]">
                      {l.telefone ?? ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={l.servico}
                      onChange={(e) => void salvar(l.id, { servico: e.target.value })}
                      className={`select-etapa ${
                        l.servicoSugerido ? "text-[var(--texto-3)]" : ""
                      }`}
                      title={
                        l.servicoSugerido
                          ? "Sugestão do sistema — escolha para confirmar"
                          : "Escolhido por você"
                      }
                    >
                      {SERVICOS.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.curto}
                          {l.servicoSugerido && s.valor === l.servico ? " (sugerido)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={l.status}
                      onChange={(e) => void salvar(l.id, { status: e.target.value })}
                      className="select-etapa"
                    >
                      {STATUS.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--texto-2)]">
                    {quando(l.ultimoContato)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {l.whatsapp && (
                        <a
                          href={l.whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => void salvar(l.id, { registrarContato: true })}
                          className="rounded-[8px] px-2 py-1 text-[12.5px] text-[var(--verde)] hover:bg-[var(--verde-fraco)]"
                        >
                          WhatsApp
                        </a>
                      )}
                      <button
                        onClick={() => setAberto(l)}
                        className="rounded-[8px] px-2 py-1 text-[12.5px] text-[var(--texto-2)] hover:bg-[var(--superficie-2)]"
                      >
                        Detalhes
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((l) => (
            <div
              key={l.id}
              className="rounded-[12px] border border-[var(--linha)] bg-[var(--superficie)] p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <button
                  onClick={() => setAberto(l)}
                  className="min-w-0 text-left font-medium leading-snug hover:text-[var(--azul)]"
                >
                  {l.empresa}
                </button>
                <Etiqueta status={l.status} />
              </div>
              <div className="mb-2"><Nota lead={l} /></div>
              <p className="mb-3 text-[12.5px] capitalize text-[var(--texto-3)]">
                {l.segmento}
                {l.cidade ? ` · ${l.cidade}` : ""}
                {l.responsavel ? ` · ${l.responsavel}` : ""}
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <select
                  value={l.servico}
                  onChange={(e) => void salvar(l.id, { servico: e.target.value })}
                  className="select-etapa"
                >
                  {SERVICOS.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.curto}
                    </option>
                  ))}
                </select>
                <select
                  value={l.status}
                  onChange={(e) => void salvar(l.id, { status: e.target.value })}
                  className="select-etapa"
                >
                  {STATUS.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--texto-3)]">
                  {quando(l.ultimoContato)}
                </span>
                {l.whatsapp && (
                  <a
                    href={l.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void salvar(l.id, { registrarContato: true })}
                    className="text-[12.5px] text-[var(--verde)]"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto && (
        <Gaveta
          lead={aberto}
          aoFechar={() => setAberto(null)}
          aoSalvar={(m) => salvar(aberto.id, m)}
        />
      )}

      {novoAberto && (
        <ModalNovo
          aoFechar={() => setNovoAberto(false)}
          aoCriar={async (dados) => {
            const res = await fetch("/api/prospeccao", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(dados),
            });
            const c = await res.json();
            if (!res.ok) {
              setAviso(c.erro ?? "Não consegui adicionar.");
              return false;
            }
            setNovoAberto(false);
            await carregar();
            return true;
          }}
        />
      )}
    </main>
  );
}

/* ══════════════════════════════ gaveta ══════════════════════════════ */

function Gaveta({
  lead,
  aoFechar,
  aoSalvar,
}: {
  lead: Lead;
  aoFechar: () => void;
  aoSalvar: (m: Record<string, unknown>) => Promise<Lead | null>;
}) {
  const [notas, setNotas] = useState(lead.notas ?? "");
  const [valor, setValor] = useState(lead.valor?.toString() ?? "");
  const [proximo, setProximo] = useState(
    lead.proximoContato ? lead.proximoContato.slice(0, 10) : "",
  );
  const [salvando, setSalvando] = useState(false);

  // Esc fecha — é a tecla que todo mundo tenta primeiro.
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [aoFechar]);

  async function salvarTudo() {
    setSalvando(true);
    await aoSalvar({
      notas,
      valor: valor.trim() ? Number(valor.replace(/\D/g, "")) : null,
      proximoContato: proximo || null,
    });
    setSalvando(false);
  }

  const linha = (r: string, v: React.ReactNode) => (
    <div className="flex gap-3 py-1.5 text-[13.5px]">
      <span className="w-28 shrink-0 text-[var(--texto-3)]">{r}</span>
      <span className="min-w-0 flex-1 break-words">{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={aoFechar}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="surgir flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--linha)] bg-[var(--fundo-2)] p-5 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold leading-tight">{lead.empresa}</h2>
            <p className="mt-0.5 text-[13px] capitalize text-[var(--texto-3)]">
              {lead.segmento}
              {lead.cidade ? ` · ${lead.cidade}/${lead.estado ?? ""}` : ""}
            </p>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-[8px] px-2 py-1 text-[var(--texto-3)] hover:bg-[var(--superficie)]"
          >
            ✕
          </button>
        </div>

        {lead.etapaReal === "opt-out" && (
          <p className="mb-4 rounded-[10px] bg-[var(--vermelho-fraco)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--vermelho)]">
            Este lead pediu para não ser mais contatado. O sistema recusa
            reabrir o status — é a trava que impede mandar mensagem para quem
            pediu para parar.
          </p>
        )}

        {/**
          * Duas notas lado a lado, nunca somadas.
          *
          * Oportunidade alta com contato baixo é uma empresa que precisa muito
          * e que você não alcança — o que pede buscar o telefone, não abordar.
          * O inverso é alguém fácil de falar que não precisa de nada. Uma
          * média esconderia os dois casos.
          */}
        <section className="mb-5 grid grid-cols-2 gap-2">
          {[
            ["Oportunidade", lead.pontos, lead.rotuloPontos, corFaixa(lead.faixa)],
            ["Contato", lead.contato, lead.rotuloContato, "var(--texto-2)"],
          ].map(([r, n, sub, cor]) => (
            <div key={r as string} className="rounded-[10px] bg-[var(--superficie)] p-3">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--texto-3)]">{r as string}</p>
              <p className="mt-0.5 text-[22px] font-semibold tabular-nums" style={{ color: cor as string }}>
                {n as number}
              </p>
              <p className="text-[12px] leading-tight text-[var(--texto-3)]">{sub as string}</p>
            </div>
          ))}
        </section>

        <section className="mb-5">
          <h3 className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--texto-3)]">
            Contato
          </h3>
          {linha("Responsável", lead.responsavel ?? "—")}
          {linha("Telefone", lead.telefone ?? "—")}
          {linha("E-mail", lead.email ?? "—")}
          {linha(
            "Instagram",
            lead.instagram ? (
              <a href={lead.instagram} target="_blank" rel="noreferrer" className="text-[var(--azul)]">
                abrir
              </a>
            ) : (
              "—"
            ),
          )}
          {linha(
            "Site atual",
            lead.site ? (
              <a href={lead.site} target="_blank" rel="noreferrer" className="text-[var(--azul)]">
                {lead.site.replace(/^https?:\/\//, "").slice(0, 34)}
              </a>
            ) : (
              "não tem"
            ),
          )}
          {linha(
            "Google Maps",
            lead.maps ? (
              <a href={lead.maps} target="_blank" rel="noreferrer" className="text-[var(--azul)]">
                abrir
              </a>
            ) : (
              "—"
            ),
          )}
        </section>

        <section className="mb-5 space-y-3">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-[var(--texto-3)]">
            Negociação
          </h3>

          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
              Quero vender
            </label>
            <select
              value={lead.servico}
              onChange={(e) => void aoSalvar({ servico: e.target.value })}
              className="campo"
            >
              {SERVICOS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
            {lead.servicoSugerido && (
              <p className="mt-1 text-[12px] text-[var(--texto-3)]">
                Sugestão do sistema pelo ramo. Escolher confirma.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Status</label>
            <select
              value={lead.status}
              onChange={(e) => void aoSalvar({ status: e.target.value })}
              className="campo"
            >
              {STATUS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
                Valor estimado
              </label>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="numeric"
                placeholder="R$"
                className="campo tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
                Próximo contato
              </label>
              <input
                type="date"
                value={proximo}
                onChange={(e) => setProximo(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Observações</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              placeholder="O que ficou combinado…"
              className="campo resize-y leading-relaxed"
            />
          </div>
        </section>

        <section className="mb-5">
          <h3 className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--texto-3)]">
            Histórico
          </h3>
          <ul className="space-y-1 text-[13px] text-[var(--texto-2)]">
            <li>{quando(lead.ultimoContato)} — última movimentação</li>
            <li>{quando(lead.criadoEm)} — lead adicionado</li>
          </ul>
        </section>

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {lead.whatsapp && (
            <a
              href={lead.whatsapp}
              target="_blank"
              rel="noreferrer"
              onClick={() => void aoSalvar({ registrarContato: true })}
              className="btn-whatsapp flex-1 text-center"
            >
              Abrir WhatsApp
            </a>
          )}
          <button onClick={salvarTudo} disabled={salvando} className="btn-primario">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════ modal novo lead ═══════════════════════════ */

function ModalNovo({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void;
  aoCriar: (d: Record<string, string>) => Promise<boolean>;
}) {
  const [f, setF] = useState<Record<string, string>>({ servico: "site" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [aoFechar]);

  const campo = (nome: string, rotulo: string, extra: Record<string, string> = {}) => (
    <div>
      <label className="mb-1 block text-[13px] text-[var(--texto-2)]">{rotulo}</label>
      <input
        value={f[nome] ?? ""}
        onChange={(e) => setF((v) => ({ ...v, [nome]: e.target.value }))}
        className="campo"
        {...extra}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={aoFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surgir flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[18px] border border-[var(--linha)] bg-[var(--fundo-2)] p-5 sm:rounded-[18px] sm:p-6"
      >
        <h2 className="mb-4 text-[19px] font-semibold">Adicionar lead</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo("empresa", "Nome da empresa")}</div>
          {campo("responsavel", "Nome do contato")}
          {campo("telefone", "WhatsApp", { inputMode: "numeric", placeholder: "34 99999-9999" })}
          {campo("segmento", "Segmento", { placeholder: "oficina, pousada…" })}
          {campo("cidade", "Cidade")}

          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
              Quero vender
            </label>
            <select
              value={f.servico}
              onChange={(e) => setF((v) => ({ ...v, servico: e.target.value }))}
              className="campo"
            >
              {SERVICOS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>

          {campo("instagram", "Instagram", { placeholder: "link ou @" })}
          <div className="sm:col-span-2">{campo("site", "Site atual (se tiver)")}</div>
          <div className="sm:col-span-2">{campo("maps", "Google Maps")}</div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Observações</label>
            <textarea
              value={f.notas ?? ""}
              onChange={(e) => setF((v) => ({ ...v, notas: e.target.value }))}
              rows={3}
              className="campo resize-y"
            />
          </div>
        </div>

        <p className="mt-3 text-[12px] text-[var(--texto-3)]">
          Entra como <strong>Novo</strong>. Sem verificar o site, o status de
          presença fica &quot;não verificado&quot; — o sistema não afirma o que
          não checou.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              if (!f.empresa?.trim()) return;
              setSalvando(true);
              await aoCriar(f);
              setSalvando(false);
            }}
            disabled={salvando || !f.empresa?.trim()}
            className="btn-primario"
          >
            {salvando ? "Adicionando…" : "Adicionar lead"}
          </button>
          <button onClick={aoFechar} className="btn-secundario">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
