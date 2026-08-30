"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StatusCampanha } from "@/lib/db/schema";
import type { Facetas, Faixa } from "@/lib/facetas";
import { estimarDuracao, nomeSugerido, ROTULO_FAIXA } from "@/lib/facetas";

/**
 * Campanhas.
 *
 * A tela anterior abria com um formulário vazio — cidade, nota, quantidade —
 * e só depois de preencher dizia "nenhum lead atende ao filtro". Tentativa e
 * erro sobre dados que o sistema já conhecia.
 *
 * Aqui a ordem se inverte: primeiro a tela MOSTRA o que existe (segmentos e
 * cidades com contagem real ao lado), e você escolhe entre opções que sabem
 * quantos leads têm. Nenhum caminho leva a zero por surpresa.
 *
 * Quatro etapas, uma de cada vez, para não despejar tudo junto.
 */

type Etapa = 1 | 2 | 3;

type Progresso = {
  total: number;
  rascunho: number;
  aprovadas: number;
  enviadas: number;
  respondidas: number;
  erros: number;
  percentual: number;
  taxaResposta: number;
};

type Campanha = {
  id: string;
  nome: string;
  status: StatusCampanha;
  criadoEm: string;
  progresso: Progresso;
};

const SUGESTOES_QTD = [10, 20, 30, 50];

/** Emoji por segmento — puramente visual, cai num padrão quando não conhece. */
function iconeSegmento(s: string): string {
  const t = s.toLowerCase();
  if (/oficina|mec[âa]nic|auto|borracharia|pneu/.test(t)) return "🔧";
  if (/lava|est[ée]tica automotiva/.test(t)) return "🚗";
  if (/cl[íi]nic|m[ée]dic|consult[óo]rio|odonto|dentista|fisio|psicolog/.test(t)) return "🏥";
  if (/sal[ãa]o|barbear|cabelo|beleza|manicure/.test(t)) return "💇";
  if (/est[ée]tica/.test(t)) return "💆";
  if (/pet|veterin/.test(t)) return "🐶";
  if (/restaurante|lanchonete|pizza|caf[ée]|padaria|bar\b/.test(t)) return "🍽️";
  if (/farm[áa]cia|drogaria/.test(t)) return "💊";
  if (/im[óo]vel|imobili/.test(t)) return "🏠";
  if (/academia|pilates|crossfit/.test(t)) return "🏋️";
  return "🏢";
}

export default function Campanhas() {
  // ---------- dados ----------
  const [f, setF] = useState<(Facetas & { envio: { intervaloSegundos: number; limiteDiario: number; automacaoAtiva: boolean } }) | null>(null);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // ---------- filtros ----------
  const [segmento, setSegmento] = useState<string>("");
  const [cidade, setCidade] = useState<string>("");
  const [faixa, setFaixa] = useState<Faixa>("todos");
  const [soZap, setSoZap] = useState(true);
  const [buscaCidade, setBuscaCidade] = useState("");

  // ---------- montagem ----------
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nome, setNome] = useState("");
  const [nomeEditado, setNomeEditado] = useState(false);

  const carregarFacetas = useCallback(async () => {
    const q = new URLSearchParams({ faixa });
    if (segmento) q.set("segmento", segmento);
    if (cidade) q.set("cidade", cidade);
    if (soZap) q.set("zap", "1");
    const r = await fetch(`/api/campanhas/publico?${q}`).then((x) => x.json());
    setF(r);
  }, [segmento, cidade, faixa, soZap]);

  const carregarCampanhas = useCallback(async () => {
    const r = await fetch("/api/campanhas").then((x) => x.json());
    setCampanhas(r.campanhas ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([carregarFacetas(), carregarCampanhas()]);
      setCarregando(false);
    })();
  }, [carregarFacetas, carregarCampanhas]);

  // Nome se atualiza com os filtros, até você editar à mão.
  useEffect(() => {
    if (!nomeEditado) setNome(nomeSugerido(segmento || undefined, cidade || undefined));
  }, [segmento, cidade, nomeEditado]);

  /**
   * `?? []` cria um array novo a cada render, o que faria o useMemo abaixo
   * recalcular sempre. Memorizando aqui, a referência só muda quando `f` muda.
   */
  const compativeis = useMemo(() => f?.compativeis ?? [], [f]);
  const selecionados = useMemo(
    () => compativeis.filter((l) => marcados.has(l.id)),
    [compativeis, marcados],
  );

  const duracao = estimarDuracao(
    selecionados.length,
    f?.envio.intervaloSegundos ?? 90,
    f?.envio.limiteDiario ?? 30,
  );

  function marcarMelhores(n: number) {
    setMarcados(new Set(compativeis.slice(0, n).map((l) => l.id)));
  }

  async function criar() {
    if (selecionados.length === 0) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || nomeSugerido(segmento || undefined, cidade || undefined),
          leadIds: selecionados.map((l) => l.id),
          filtro: { segmento, cidade, faixa, soZap },
        }),
      }).then((x) => x.json());

      const pulados: { nome: string; motivo: string }[] = r.pulados ?? [];
      setAviso(
        `Campanha criada com ${r.criadas} mensagem(ns) em rascunho.` +
          (pulados.length
            ? ` ${pulados.length} pulado(s): ${pulados.slice(0, 2).map((p) => `${p.nome} (${p.motivo})`).join("; ")}${pulados.length > 2 ? "…" : ""}`
            : "") +
          " Revise em Disparos e depois inicie.",
      );
      setMarcados(new Set());
      setEtapa(1);
      setNomeEditado(false);
      await Promise.all([carregarFacetas(), carregarCampanhas()]);
    } finally {
      setOcupado(false);
    }
  }

  async function acao(id: string, acao: "iniciar" | "pausar" | "parar") {
    setOcupado(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      }).then((x) => x.json());
      setAviso(
        r.erro ??
          (acao === "iniciar"
            ? `${r.aprovadas} mensagem(ns) aprovada(s). Vá em "Disparos" para iniciar o envio.`
            : acao === "pausar"
              ? "Campanha pausada."
              : `Encerrada. ${r.canceladas} pendente(s) cancelado(s).`),
      );
      await carregarCampanhas();
    } finally {
      setOcupado(false);
    }
  }

  const aguardando = campanhas.reduce((s, c) => s + c.progresso.aprovadas, 0);

  if (carregando || !f) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="esqueleto h-24" />
          ))}
        </div>
      </main>
    );
  }

  const cidadesVisiveis = buscaCidade
    ? f.cidades.filter((c) => c.valor.toLowerCase().includes(buscaCidade.toLowerCase()))
    : f.cidades.slice(0, 8);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6">
        <h1 className="text-[26px] font-semibold sm:text-[30px]">🚀 Campanhas</h1>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)] sm:text-[15px]">
          Escolha seus melhores leads, monte o lote e deixe a automação cuidar do envio.
        </p>
      </header>

      {/* ============================================ visão geral */}
      <section className="surgir mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Leads disponíveis", f.visaoGeral.disponiveis, "Nunca contatados"],
          ["Prontos para contato", f.visaoGeral.prontosParaContato, "Possuem WhatsApp"],
          ["Leads quentes", f.visaoGeral.quentes, "Nota 60 ou mais"],
          ["Campanhas ativas", campanhas.filter((c) => c.status === "rodando").length, "Rodando agora"],
        ].map(([r, v, d]) => (
          <div key={String(r)} className="cartao p-4">
            <p className="text-[12.5px] text-[var(--texto-2)]">{r}</p>
            <p className="mt-1 text-[26px] font-semibold tabular-nums">{v}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">{d}</p>
          </div>
        ))}
      </section>

      {/**
       * Oportunidade e contato são eixos SEPARADOS desde a recalibração. Um
       * lote com muitos leads bons e poucos contatáveis é situação normal, e
       * não um erro de filtro — a tela diz isso em vez de deixar você descobrir.
       */}
      {f.visaoGeral.disponiveis > 0 &&
        f.visaoGeral.prontosParaContato < f.visaoGeral.disponiveis * 0.4 && (
          <p className="surgir mb-6 rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-3 text-[13px] leading-relaxed text-[var(--ambar)]">
            Só {f.visaoGeral.prontosParaContato} dos {f.visaoGeral.disponiveis} leads
            disponíveis têm WhatsApp. Os outros podem ser boas oportunidades sem canal
            de contato — veja{" "}
            <Link href="/calibracao" className="underline">
              Enriquecer contato
            </Link>{" "}
            para saber quais valem a caçada.
          </p>
        )}

      {aviso && (
        <p className="surgir mb-6 rounded-[10px] bg-[var(--azul-fraco)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--azul)]">
          {aviso}
        </p>
      )}

      {/* ============================================ disparo */}
      {aguardando > 0 && (
        <div className="cartao surgir mb-7 flex flex-wrap items-center gap-3 p-4">
          <Link href="/disparos" className="btn-primario btn-g">
            🚀 Ir para Automação ({aguardando})
          </Link>
          <span className="text-[13px] text-[var(--texto-2)]">
            mensagens aprovadas aguardando o worker único iniciar o envio
          </span>
        </div>
      )}

      {/* ============================================ etapas */}
      <div className="surgir mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        {(
          [
            [1, "Escolher público"],
            [2, "Selecionar leads"],
            [3, "Revisar e criar"],
          ] as [Etapa, string][]
        ).map(([n, r]) => (
          <button
            key={n}
            onClick={() => (n === 1 || compativeis.length > 0) && setEtapa(n)}
            disabled={n > 1 && compativeis.length === 0}
            className={`rounded-[8px] px-3 py-1.5 font-medium transition ${
              etapa === n
                ? "bg-[var(--azul)] text-white"
                : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)] disabled:opacity-40"
            }`}
          >
            {n}. {r}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          {/* -------------------------------------- etapa 1 */}
          {etapa === 1 && (
            <section className="cartao surgir p-5">
              <h2 className="mb-4 text-[17px] font-semibold">O que você quer prospectar?</h2>

              <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
                Segmento
              </p>
              <div className="mb-5 flex flex-wrap gap-2">
                <button
                  onClick={() => setSegmento("")}
                  className={`rounded-[10px] px-3 py-2 text-[13px] transition ${
                    !segmento
                      ? "bg-[var(--azul)] text-white"
                      : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                  }`}
                >
                  Todos os segmentos
                  <span className="ml-1.5 opacity-70">{f.visaoGeral.disponiveis}</span>
                </button>
                {f.segmentos.map((s) => (
                  <button
                    key={s.valor}
                    onClick={() => setSegmento(segmento === s.valor ? "" : s.valor)}
                    className={`rounded-[10px] px-3 py-2 text-[13px] capitalize transition ${
                      segmento === s.valor
                        ? "bg-[var(--azul)] text-white"
                        : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                    }`}
                    title={`${s.comWhatsapp} com WhatsApp`}
                  >
                    {iconeSegmento(s.valor)} {s.valor}
                    <span className="ml-1.5 opacity-70">{s.leads}</span>
                  </button>
                ))}
              </div>

              <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
                Cidade
              </p>
              <input
                value={buscaCidade}
                onChange={(e) => setBuscaCidade(e.target.value)}
                placeholder="Buscar cidade…"
                className="campo mb-2"
              />
              <div className="mb-5 flex flex-wrap gap-2">
                <button
                  onClick={() => setCidade("")}
                  className={`rounded-[10px] px-3 py-2 text-[13px] transition ${
                    !cidade
                      ? "bg-[var(--azul)] text-white"
                      : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                  }`}
                >
                  Todas
                </button>
                {cidadesVisiveis.map((c) => (
                  <button
                    key={c.valor}
                    onClick={() => setCidade(cidade === c.valor ? "" : c.valor)}
                    className={`rounded-[10px] px-3 py-2 text-[13px] transition ${
                      cidade === c.valor
                        ? "bg-[var(--azul)] text-white"
                        : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                    }`}
                    title={`${c.comWhatsapp} com WhatsApp`}
                  >
                    {c.valor} <span className="ml-1 opacity-70">{c.leads}</span>
                  </button>
                ))}
              </div>

              <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
                Qualidade
              </p>
              <div className="mb-4 space-y-1.5">
                {f.porFaixa.map((x) => (
                  <label
                    key={x.faixa}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 transition ${
                      faixa === x.faixa ? "bg-[var(--azul-fraco)]" : "bg-[var(--superficie)]"
                    } ${x.leads === 0 ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      checked={faixa === x.faixa}
                      onChange={() => setFaixa(x.faixa as Faixa)}
                      className="h-4 w-4 accent-[var(--azul)]"
                    />
                    <span className="flex-1 text-[13.5px]">
                      {ROTULO_FAIXA[x.faixa as Faixa]}
                      {x.nota > 0 && (
                        <span className="ml-1.5 text-[var(--texto-3)]">({x.nota}+)</span>
                      )}
                    </span>
                    <span className="text-[13px] tabular-nums text-[var(--texto-2)]">
                      {x.leads}
                    </span>
                  </label>
                ))}
              </div>

              <label className="mb-4 flex cursor-pointer items-center gap-2.5 rounded-[10px] bg-[var(--superficie)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={soZap}
                  onChange={(e) => setSoZap(e.target.checked)}
                  className="h-4 w-4 accent-[var(--azul)]"
                />
                <span className="text-[13.5px]">
                  Somente com WhatsApp
                  <span className="block text-[12px] text-[var(--texto-3)]">
                    Sem canal de contato, o lead não entra em campanha
                  </span>
                </span>
              </label>

              {/* resultado instantâneo */}
              <div className="rounded-[12px] border border-[var(--linha)] bg-[var(--superficie)] p-4">
                {f.resumo.compativeis > 0 ? (
                  <>
                    <p className="text-[22px] font-semibold tabular-nums">
                      {f.resumo.compativeis} leads encontrados
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--texto-2)]">
                      {f.resumo.comWhatsapp} com WhatsApp · {f.resumo.quentes} quentes · notas
                      de {f.resumo.menorNota} a {f.resumo.maiorNota}
                    </p>
                    <button
                      onClick={() => {
                        marcarMelhores(Math.min(20, f.resumo.compativeis));
                        setEtapa(2);
                      }}
                      className="btn-primario mt-3"
                    >
                      Ver os leads →
                    </button>
                  </>
                ) : (
                  /**
                   * Estado vazio que ajuda a decidir, não que só informa falta.
                   * Mostra o que EXISTE por perto e oferece o ajuste em um clique.
                   */
                  <>
                    <p className="text-[15px] font-medium">
                      Nenhum lead com esse filtro.
                    </p>
                    {f.alternativas.length > 0 ? (
                      <>
                        <p className="mt-1.5 text-[13px] text-[var(--texto-2)]">
                          Mas existem, afrouxando a qualidade:
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {f.alternativas.map((a) => (
                            <button
                              key={a.faixa}
                              onClick={() => setFaixa(a.faixa as Faixa)}
                              className="btn-secundario"
                            >
                              {a.leads} em &quot;{ROTULO_FAIXA[a.faixa as Faixa]}&quot;
                            </button>
                          ))}
                          {soZap && (
                            <button onClick={() => setSoZap(false)} className="btn-secundario">
                              Incluir sem WhatsApp
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1.5 text-[13px] text-[var(--texto-2)]">
                        Nem afrouxando o filtro. Use{" "}
                        <Link href="/" className="text-[var(--azul)]">
                          Buscar leads
                        </Link>{" "}
                        para trazer empresas novas.
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* -------------------------------------- etapa 2 */}
          {etapa === 2 && (
            <section className="cartao surgir p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold">
                  {f.resumo.compativeis} leads compatíveis
                </h2>
                <span className="text-[13px] text-[var(--texto-3)]">
                  ordenados por WhatsApp e nota
                </span>
              </div>

              <p className="mb-3 rounded-[10px] bg-[var(--azul-fraco)] px-3.5 py-2.5 text-[13px] text-[var(--azul)]">
                ✨ Selecionamos os {marcados.size} melhores automaticamente. Ajuste se quiser.
              </p>

              <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-[var(--texto-3)]">Quantos leads?</span>
                {SUGESTOES_QTD.filter((n) => n <= f.resumo.compativeis).map((n) => (
                  <button
                    key={n}
                    onClick={() => marcarMelhores(n)}
                    className={`rounded-[8px] px-3 py-1.5 font-medium transition ${
                      marcados.size === n
                        ? "bg-[var(--azul)] text-white"
                        : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => marcarMelhores(f.resumo.compativeis)}
                  className="rounded-[8px] bg-[var(--superficie)] px-3 py-1.5 font-medium text-[var(--texto-2)] hover:text-[var(--texto)]"
                >
                  Todos ({f.resumo.compativeis})
                </button>
                <button
                  onClick={() => setMarcados(new Set())}
                  className="ml-auto text-[var(--texto-3)] hover:text-[var(--texto)]"
                >
                  Limpar
                </button>
              </div>

              <div className="max-h-[460px] overflow-x-auto overflow-y-auto rounded-[10px] border border-[var(--linha)]">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-[var(--fundo-2)]">
                    <tr className="text-left text-[11.5px] text-[var(--texto-3)]">
                      <th className="px-3 py-2 font-medium" />
                      <th className="px-2 py-2 font-medium">Empresa</th>
                      <th className="px-2 py-2 font-medium">Segmento</th>
                      <th className="px-2 py-2 font-medium">Cidade</th>
                      <th className="px-2 py-2 text-right font-medium">Nota</th>
                      <th className="px-3 py-2 font-medium">Contato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compativeis.map((l) => (
                      <tr
                        key={l.id}
                        className="border-t border-[var(--linha)] hover:bg-[var(--superficie)]"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={marcados.has(l.id)}
                            onChange={() =>
                              setMarcados((a) => {
                                const n = new Set(a);
                                if (n.has(l.id)) n.delete(l.id);
                                else n.add(l.id);
                                return n;
                              })
                            }
                            aria-label={`Selecionar ${l.nome}`}
                            className="h-4 w-4 accent-[var(--azul)]"
                          />
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 font-medium">
                          {l.nome}
                        </td>
                        <td className="px-2 py-2 capitalize text-[var(--texto-2)]">
                          {l.segmento}
                        </td>
                        <td className="px-2 py-2 text-[var(--texto-2)]">{l.cidade}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {l.emoji} {l.nota}
                        </td>
                        <td className="px-3 py-2 text-[var(--texto-2)]">
                          {l.temWhatsapp ? "WhatsApp" : l.temInstagram ? "Instagram" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setEtapa(1)} className="btn-secundario">
                  ← Voltar
                </button>
                <button
                  onClick={() => setEtapa(3)}
                  disabled={marcados.size === 0}
                  className="btn-primario"
                >
                  Revisar {marcados.size} →
                </button>
              </div>
            </section>
          )}

          {/* -------------------------------------- etapa 3 */}
          {etapa === 3 && (
            <section className="cartao surgir p-5">
              <h2 className="mb-4 text-[17px] font-semibold">Revisar campanha</h2>

              <label className="mb-1 block text-[12.5px] text-[var(--texto-2)]">
                Nome da campanha
              </label>
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setNomeEditado(true);
                }}
                className="campo mb-4"
              />

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Empresas", selecionados.length],
                  ["Mensagens", selecionados.length],
                  ["Com WhatsApp", selecionados.filter((l) => l.temWhatsapp).length],
                  ["Tempo estimado", duracao.legivel],
                ].map(([r, v]) => (
                  <div key={String(r)} className="rounded-[10px] bg-[var(--superficie)] p-3">
                    <p className="text-[12px] text-[var(--texto-2)]">{r}</p>
                    <p className="mt-0.5 text-[17px] font-semibold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>

              {duracao.passaDoDia && (
                <p className="mb-4 rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-2.5 text-[13px] text-[var(--ambar)]">
                  {selecionados.length} contatos passam do teto de {f.envio.limiteDiario} por
                  dia. A fila continua nos dias seguintes — cerca de {duracao.dias} dias no
                  total.
                </p>
              )}

              <p className="mb-2 text-[13px] font-medium">Por que esses leads?</p>
              <ul className="mb-4 space-y-1 text-[13px] text-[var(--texto-2)]">
                <li>✓ Nunca foram contatados</li>
                <li>✓ Sem pedido de opt-out</li>
                {soZap && <li>✓ Possuem WhatsApp</li>}
                {segmento && <li>✓ Segmento: {segmento}</li>}
                {cidade && <li>✓ Cidade: {cidade}</li>}
                <li>
                  ✓ Notas de {Math.min(...selecionados.map((l) => l.nota))} a{" "}
                  {Math.max(...selecionados.map((l) => l.nota))}
                </li>
              </ul>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setEtapa(2)} className="btn-secundario">
                  ← Voltar
                </button>
                <button onClick={criar} disabled={ocupado} className="btn-primario btn-g">
                  Criar campanha
                </button>
              </div>
              <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
                Cria as mensagens em rascunho. Nada é enviado até você iniciar.
              </p>
            </section>
          )}
        </div>

        {/* ============================================ resumo lateral */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="cartao p-4">
            <h3 className="mb-3 text-[14px] font-semibold">Resumo</h3>
            {selecionados.length === 0 ? (
              <p className="text-[13px] text-[var(--texto-2)]">
                Nenhum lead selecionado ainda. Escolha o público e avance.
              </p>
            ) : (
              <dl className="space-y-2.5 text-[13px]">
                <div>
                  <dt className="text-[var(--texto-3)]">Selecionados</dt>
                  <dd className="text-[20px] font-semibold tabular-nums">
                    {selecionados.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--texto-3)]">Com WhatsApp</dt>
                  <dd className="tabular-nums">
                    📱 {selecionados.filter((l) => l.temWhatsapp).length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--texto-3)]">Segmento</dt>
                  <dd className="capitalize">{segmento || "Todos"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--texto-3)]">Cidade</dt>
                  <dd>{cidade || "Todas"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--texto-3)]">Duração estimada</dt>
                  <dd>
                    ⏱ {duracao.legivel}
                    {duracao.passaDoDia && (
                      <span className="block text-[12px] text-[var(--ambar)]">
                        ~{duracao.dias} dias pelo teto diário
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            )}

            {etapa !== 3 && selecionados.length > 0 && (
              <button onClick={() => setEtapa(3)} className="btn-primario mt-4 w-full">
                Revisar e criar
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ============================================ campanhas */}
      <h2 className="mb-3 mt-8 text-[17px] font-semibold">Suas campanhas</h2>
      {campanhas.length === 0 ? (
        <div className="cartao px-5 py-10 text-center text-[14px] text-[var(--texto-2)]">
          Nenhuma campanha ainda.
        </div>
      ) : (
        <ol className="space-y-3">
          {campanhas.map((c) => {
            const p = c.progresso;
            const icone =
              c.status === "rodando"
                ? "🟢"
                : c.status === "pausada"
                  ? "🟡"
                  : c.status === "concluida"
                    ? "✓"
                    : "○";
            return (
              <li key={c.id} className="cartao p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                      {icone} {c.nome}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
                      {p.enviadas}/{p.total} enviados
                      {p.respondidas > 0 && ` · ${p.respondidas} respostas`}
                      {p.erros > 0 && ` · ${p.erros} erro(s)`}
                    </p>
                  </div>
                  <span className="etiqueta etiqueta-neutra shrink-0">{c.status}</span>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--azul)] transition-[width] duration-500"
                    style={{ width: `${p.percentual}%` }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === "rascunho" && (
                    <button
                      onClick={() => acao(c.id, "iniciar")}
                      disabled={ocupado || p.total === 0}
                      className="btn-primario"
                    >
                      🚀 Iniciar
                    </button>
                  )}
                  {c.status === "rodando" && (
                    <button onClick={() => acao(c.id, "pausar")} disabled={ocupado} className="btn-secundario">
                      Pausar
                    </button>
                  )}
                  {c.status === "pausada" && (
                    <button onClick={() => acao(c.id, "iniciar")} disabled={ocupado} className="btn-primario">
                      Retomar
                    </button>
                  )}
                  <Link href="/disparos" className="btn-secundario">
                    {c.status === "concluida" ? "Ver resultados" : "Abrir"}
                  </Link>
                  {!["concluida", "cancelada"].includes(c.status) && (
                    <button
                      onClick={() => acao(c.id, "parar")}
                      disabled={ocupado}
                      className="btn-secundario ml-auto"
                    >
                      Encerrar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
