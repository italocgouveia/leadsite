"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Metricas, Periodo } from "@/lib/metricas";
import { ROTULO_INTENCAO, type Intencao } from "@/lib/classificar";

/**
 * Dashboard.
 *
 * Tudo aqui vem de `/api/metricas`, que lê o banco. Nenhum número é simulado —
 * se algo está zerado, é porque ainda não aconteceu.
 *
 * Atualiza sozinho a cada 15s enquanto a aba está visível. Escolhi polling em
 * vez de websocket porque o volume é baixo (um disparo a cada 90s no máximo) e
 * websocket em função serverless exige infraestrutura que este projeto não
 * tem. Quando a aba está oculta o polling para — não faz sentido consultar
 * banco para uma tela que ninguém está olhando.
 */

/** Espelho de /api/comercial/resumo. */
type ResumoComercial = {
  funil: { etapa: string; quantos: number; taxa: number | null }[];
  financeiro: {
    mrrAtual: number;
    mrrPotencial: number;
    setupFechado: number;
    setupPotencial: number;
    semValorDefinido: number;
  };
  nichos: {
    nicho: string;
    abordados: number;
    respostas: number;
    taxaResposta: number;
    solucao: string | null;
    confiavel: boolean;
  }[];
  melhorNicho: { nicho: string; taxaResposta: number; abordados: number } | null;
  oportunidades: {
    id: string;
    nome: string;
    nicho: string;
    etapa: string;
    score: number;
    emoji: string;
    dorConfirmada: string | null;
    hipotese: string | null;
    solucao: string | null;
    proximaAcao: { titulo: string; pergunta: string | null; urgencia: string };
    objecao: { nome: string; resposta: string } | null;
    diasParado: number;
  }[];
  totalOportunidades: number;
  parados: { id: string; nome: string; etapa: string; diasParado: number }[];
  followUps: { id: string; leadId: string; lead: string; motivo: string | null }[];
};

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

function Cartao({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div className="cartao p-4">
      <p className="text-[12.5px] text-[var(--texto-2)]">{rotulo}</p>
      <p
        className={`mt-1 text-[24px] font-semibold tabular-nums ${destaque ? "text-[var(--azul)]" : ""}`}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">{detalhe}</p>}
    </div>
  );
}

export default function Painel() {
  const [m, setM] = useState<Metricas | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [cidade, setCidade] = useState("");
  const [segmento, setSegmento] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  /**
   * Bloco comercial, de /api/comercial/resumo.
   *
   * Separado das métricas porque não responde aos filtros de período: pipeline,
   * MRR e ranking são estado ATUAL, não recorte de janela. Filtrar "MRR dos
   * últimos 7 dias" não significaria nada.
   */
  const [comercial, setComercial] = useState<ResumoComercial | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/comercial/resumo").then((x) => x.json());
        if (!r.erro) setComercial(r);
      } catch {
        // Bloco opcional: se falhar, o resto do painel continua de pé.
      }
    })();
  }, []);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ periodo });
    if (cidade) q.set("cidade", cidade);
    if (segmento) q.set("segmento", segmento);
    try {
      const r = await fetch(`/api/metricas?${q}`).then((x) => x.json());
      setM(r);
      setAtualizadoEm(new Date());
    } finally {
      setCarregando(false);
    }
  }, [periodo, cidade, segmento]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Atualização automática. Só roda com a aba visível: consultar o banco a
   * cada 15s para uma tela em segundo plano é gasto sem ninguém olhando.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    const t = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [carregar]);

  if (carregando || !m) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="esqueleto h-24" />
          ))}
        </div>
      </main>
    );
  }

  const totalFunil = m.funil.reduce((s, f) => s + f.quantidade, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold sm:text-[28px]">Painel</h1>
          <p className="mt-1 text-[13px] text-[var(--texto-3)]">
            {atualizadoEm
              ? `Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR")} · atualiza sozinho a cada 15s`
              : ""}
          </p>
        </div>
      </header>

      {/* ---------------------------------------------------- filtros */}
      <div className="surgir mb-6 flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            onClick={() => setPeriodo(p.valor)}
            className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
              periodo === p.valor
                ? "bg-[var(--azul)] text-white"
                : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        <input
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          placeholder="Cidade"
          className="campo min-w-0 max-w-[150px]"
        />
        <input
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          placeholder="Segmento"
          className="campo min-w-0 max-w-[150px]"
        />
      </div>

      {/* ---------------------------------------------------- leads */}
      <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
        Leads
      </h2>
      <section className="surgir mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cartao rotulo="Total" valor={m.leads.total} />
        <Cartao rotulo="Novos" valor={m.leads.novos} />
        <Cartao rotulo="Qualificados" valor={m.leads.qualificados} detalhe="nota ≥ 60" />
        <Cartao rotulo="Com WhatsApp" valor={m.leads.comWhatsapp} />
        <Cartao
          rotulo="Sem contato"
          valor={m.leads.semContato}
          detalhe={m.leads.optOut ? `${m.leads.optOut} opt-out` : undefined}
        />
        <Cartao rotulo="🔥 Quentes" valor={m.leads.quentes} />
        <Cartao rotulo="🟡 Médios" valor={m.leads.medios} />
        <Cartao rotulo="❄️ Frios" valor={m.leads.frios} />
        <Cartao rotulo="Analisados" valor={m.leads.analisados} />
        <Cartao rotulo="Pendentes na fila" valor={m.campanhas.pendentes} />
      </section>

      {/* ---------------------------------------------------- mensagens */}
      <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
        Mensagens
      </h2>
      <section className="surgir mb-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cartao rotulo="Enviadas" valor={m.mensagens.enviadas} />
        <Cartao
          rotulo="Entregues"
          valor={m.mensagens.provedorConfirmaEntrega ? m.mensagens.entregues : "—"}
          detalhe={m.mensagens.provedorConfirmaEntrega ? `${m.mensagens.taxaEntrega}%` : "provedor não confirma"}
        />
        <Cartao rotulo="Respondidas" valor={m.mensagens.respondidas} destaque />
        <Cartao
          rotulo="Taxa de resposta"
          valor={`${m.mensagens.taxaResposta}%`}
          detalhe={`sobre ${m.mensagens.baseDaTaxa}`}
          destaque
        />
        <Cartao rotulo="Erros" valor={m.mensagens.erros} />
        <Cartao rotulo="Respostas automáticas" valor={m.mensagens.automaticas} />
        <Cartao rotulo="Conversas aguardando você" valor={m.conversasAtivas} destaque />
      </section>

      {!m.mensagens.provedorConfirmaEntrega && m.mensagens.enviadas > 0 && (
        <p className="mb-6 rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-2.5 text-[12.5px] leading-relaxed text-[var(--ambar)]">
          O provedor ainda não confirmou nenhuma entrega, então a taxa de resposta usa
          as <strong>enviadas</strong> como base. Ligue o webhook para ter o número real.
        </p>
      )}

      {/* ---------------------------------------------------- vendas */}
      <h2 className="mb-2.5 mt-6 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
        Vendas
      </h2>
      <section className="surgir mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Cartao rotulo="🔥 Interessados" valor={m.vendas.interessados} destaque />
        <Cartao rotulo="Reuniões" valor={m.vendas.reunioes} />
        <Cartao rotulo="Propostas" valor={m.vendas.propostas} />
        <Cartao rotulo="Fechados" valor={m.vendas.fechados} />
        <Cartao
          rotulo="Taxa de interesse"
          valor={`${m.vendas.taxaInteresse}%`}
          detalhe="dos que responderam"
        />
        <Cartao
          rotulo="Taxa de conversão"
          valor={`${m.vendas.taxaConversao}%`}
          detalhe={`de ${m.vendas.contatados} contatados`}
        />
      </section>

      {(m.vendas.valorPipeline > 0 || m.vendas.valorFechado > 0) && (
        <section className="surgir mb-6 grid grid-cols-2 gap-3">
          <Cartao
            rotulo="Valor no pipeline"
            valor={`R$ ${m.vendas.valorPipeline.toLocaleString("pt-BR")}`}
          />
          <Cartao
            rotulo="Valor fechado"
            valor={`R$ ${m.vendas.valorFechado.toLocaleString("pt-BR")}`}
            destaque
          />
        </section>
      )}

      {/* ---------------------------------------------------- funil */}
      <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
        Funil
      </h2>
      <section className="cartao surgir mb-6 p-4">
        <ul className="space-y-2">
          {m.funil.map((f) => (
            <li key={f.valor} className="flex items-center gap-3">
              <span className="w-[132px] shrink-0 text-[13px]">{f.rotulo}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: totalFunil ? `${(f.quantidade / totalFunil) * 100}%` : "0%",
                    background: f.cor,
                  }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-[13px] tabular-nums">
                {f.quantidade}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/pipeline" className="mt-3 inline-block text-[13px] text-[var(--azul)]">
          Abrir kanban ›
        </Link>
      </section>

      {/* ---------------------------------------------------- intenções */}
      {m.intencoes.length > 0 && (
        <>
          <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
            Respostas por intenção
          </h2>
          <div className="surgir mb-6 flex flex-wrap gap-2">
            {m.intencoes.map(({ intencao, n }) => {
              const r = ROTULO_INTENCAO[intencao as Intencao];
              return (
                <span key={intencao} className="etiqueta etiqueta-neutra">
                  {r ? `${r.emoji} ${r.rotulo}` : intencao}: {n}
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* ---------------------------------------------------- segmentos */}
      <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
        Por segmento
      </h2>
      <section className="cartao surgir mb-6 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--linha)] text-left text-[11.5px] text-[var(--texto-3)]">
              <th className="px-4 py-2.5 font-medium">Segmento</th>
              <th className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th className="px-3 py-2.5 text-right font-medium">Contatados</th>
              <th className="px-3 py-2.5 text-right font-medium">Respostas</th>
              <th className="px-3 py-2.5 text-right font-medium">Interessados</th>
              <th className="px-4 py-2.5 text-right font-medium">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {m.segmentos.map((s) => (
              <tr key={s.segmento} className="border-b border-[var(--linha)] last:border-0">
                <td className="px-4 py-2.5 capitalize">
                  {s.segmento}
                  {s.amostraPequena && s.enviadas > 0 && (
                    <span
                      className="ml-1.5 text-[var(--texto-3)]"
                      title="Amostra pequena — a taxa ainda não é confiável"
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.leads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.enviadas}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.respostas}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.interessados}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {s.enviadas ? `${s.taxaResposta}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------- campanhas */}
      {m.rankingCampanhas.length > 0 && (
        <>
          <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
            Campanhas
          </h2>
          <section className="cartao surgir overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--linha)] text-left text-[11.5px] text-[var(--texto-3)]">
                  <th className="px-4 py-2.5 font-medium">Campanha</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                  <th className="px-3 py-2.5 text-right font-medium">Enviadas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Respostas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {m.rankingCampanhas.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--linha)] last:border-0">
                    <td className="px-4 py-2.5">
                      {c.nome}
                      {c.amostraPequena && c.enviadas > 0 && (
                        <span
                          className="ml-1.5 text-[var(--texto-3)]"
                          title="Amostra pequena — não compare com campanhas grandes"
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--texto-2)]">{c.status}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.enviadas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.respostas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.enviadas ? `${c.taxaResposta}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/**
       * BLOCO COMERCIAL.
       *
       * Vem inteiro de /api/comercial/resumo, que por sua vez chama os motores
       * que já existem (lib/comercial, lib/proxima-acao, lib/pontuacao). Nada é
       * recalculado aqui — a tela só desenha. Nenhuma chamada de IA.
       */}
      {comercial && (
        <>
          {/* ---------------------------------------------- financeiro */}
          <section className="cartao surgir mb-6 p-5">
            <h2 className="mb-3 text-[16px] font-semibold">💰 Financeiro</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { r: "MRR atual", v: comercial.financeiro.mrrAtual, cor: "text-[var(--verde,var(--azul))]", nota: "clientes pagando" },
                { r: "MRR potencial", v: comercial.financeiro.mrrPotencial, cor: "text-[var(--texto-2)]", nota: "propostas e negociações" },
                { r: "Setup fechado", v: comercial.financeiro.setupFechado, cor: "text-[var(--verde,var(--azul))]", nota: "já ganho" },
                { r: "Setup potencial", v: comercial.financeiro.setupPotencial, cor: "text-[var(--texto-2)]", nota: "em aberto" },
              ].map((i) => (
                <div key={i.r} className="rounded-[10px] bg-[var(--superficie)] px-3 py-3">
                  <p className={`text-[18px] font-semibold tabular-nums ${i.cor}`}>
                    R$ {i.v.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[12px] text-[var(--texto-2)]">{i.r}</p>
                  <p className="text-[11px] text-[var(--texto-3)]">{i.nota}</p>
                </div>
              ))}
            </div>
            {/**
             * O aviso existe porque os dois números NÃO se somam, e a soma é a
             * conta que qualquer um faz de cabeça ao ver dois valores lado a
             * lado. Um é caixa; o outro é promessa.
             */}
            <p className="mt-2.5 text-[12px] text-[var(--texto-3)]">
              Atual e potencial são contas separadas — não se somam. O MRR só conta cliente em
              implantação ou ativo; negócio fechado que ainda não começou não entra.
              {comercial.financeiro.semValorDefinido > 0 &&
                ` ${comercial.financeiro.semValorDefinido} negócio(s) ainda sem preço definido.`}
            </p>
          </section>

          {/* ---------------------------------------------- funil */}
          <section className="cartao surgir mb-6 p-5">
            <h2 className="mb-3 text-[16px] font-semibold">📊 Funil de conversão</h2>
            <div className="space-y-1.5">
              {comercial.funil.map((f) => (
                <div key={f.etapa} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[13px] text-[var(--texto-2)]">{f.etapa}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-[6px] bg-[var(--superficie)]">
                    <div
                      className="h-full bg-[var(--azul)]"
                      style={{
                        width: `${
                          comercial.funil[0].quantos
                            ? Math.max(2, (f.quantos / comercial.funil[0].quantos) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-[13px] font-medium tabular-nums">
                    {f.quantos}
                  </span>
                  {/* Sem denominador não existe taxa. "—", nunca "0%". */}
                  <span className="w-14 shrink-0 text-right text-[12.5px] tabular-nums text-[var(--texto-3)]">
                    {f.taxa === null ? "—" : `${f.taxa}%`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------- oportunidades */}
          <section className="cartao surgir mb-6 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">🔥 Melhores oportunidades</h2>
              <span className="text-[12.5px] text-[var(--texto-3)]">
                {comercial.totalOportunidades} no total
              </span>
            </div>
            {comercial.oportunidades.length === 0 ? (
              <p className="text-[13px] text-[var(--texto-3)]">
                Nenhuma oportunidade aberta agora.
              </p>
            ) : (
              <div className="space-y-2.5">
                {comercial.oportunidades.map((o, i) => (
                  <div key={o.id} className="rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[13.5px] font-medium">
                        <span className="text-[var(--texto-3)]">#{i + 1}</span> {o.nome}
                        <span className="font-normal text-[var(--texto-3)]"> · {o.nicho}</span>
                      </p>
                      <span className="text-[13px] tabular-nums">
                        {o.emoji} {o.score}/100
                      </span>
                    </div>
                    {/* Fato e hipótese ficam visualmente distintos, sempre. */}
                    <p className="mt-1 text-[12.5px] leading-relaxed">
                      {o.dorConfirmada ? (
                        <>
                          <span className="text-[var(--verde,var(--azul))]">✅ Dor confirmada:</span>{" "}
                          {o.dorConfirmada}
                        </>
                      ) : o.hipotese ? (
                        <>
                          <span className="text-[var(--texto-3)]">💡 Hipótese:</span> {o.hipotese}
                        </>
                      ) : null}
                    </p>
                    {o.solucao && (
                      <p className="mt-0.5 text-[12.5px] text-[var(--texto-2)]">🛠 {o.solucao}</p>
                    )}
                    <p className="mt-1 text-[12.5px] text-[var(--azul)]">
                      🎯 {o.proximaAcao.titulo}
                    </p>
                    {o.objecao && (
                      <p className="mt-0.5 text-[12px] text-[var(--ambar,var(--texto-2))]">
                        🧠 Objeção: {o.objecao.nome}
                      </p>
                    )}
                    <Link
                      href={`/lead/${o.id}`}
                      className="mt-1.5 inline-block text-[12.5px] text-[var(--azul)] hover:underline"
                    >
                      Abrir →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------------------------------------------- nichos */}
          <section className="cartao surgir mb-6 p-5">
            <h2 className="mb-1 text-[16px] font-semibold">🏆 Desempenho por nicho</h2>
            <p className="mb-3 text-[12.5px] text-[var(--texto-3)]">
              {comercial.melhorNicho
                ? `Melhor até agora, com os dados disponíveis: ${comercial.melhorNicho.nicho} (${comercial.melhorNicho.taxaResposta}% em ${comercial.melhorNicho.abordados} abordagens).`
                : "Dados ainda insuficientes para determinar o melhor nicho."}
            </p>
            {comercial.nichos.length === 0 ? (
              <p className="text-[13px] text-[var(--texto-3)]">
                Ainda não há abordagens suficientes para comparar nichos.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="text-left text-[12px] text-[var(--texto-3)]">
                    <tr>
                      <th className="px-2 py-1.5">Nicho</th>
                      <th className="px-2 py-1.5 text-right">Abordados</th>
                      <th className="px-2 py-1.5 text-right">Respostas</th>
                      <th className="px-2 py-1.5 text-right">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comercial.nichos.map((n) => (
                      <tr key={n.nicho} className="border-t border-[var(--linha)]">
                        <td className="px-2 py-2">
                          {n.nicho}
                          {n.solucao && (
                            <span className="block text-[11.5px] text-[var(--texto-3)]">
                              💡 {n.solucao}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{n.abordados}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{n.respostas}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {n.taxaResposta}%
                          {/* Amostra pequena vira ruído: marcar é obrigatório. */}
                          {!n.confiavel && (
                            <span
                              title="Menos de 20 abordagens — amostra pequena demais para concluir"
                              className="ml-1 text-[var(--ambar,var(--texto-3))]"
                            >
                              ⚠️
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---------------------------------------------- o que fazer agora */}
          {(comercial.parados.length > 0 || comercial.followUps.length > 0) && (
            <section className="cartao surgir mb-6 p-5">
              <h2 className="mb-3 text-[16px] font-semibold">⏳ Precisa de atenção</h2>
              {comercial.followUps.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 text-[13px] font-medium">
                    📌 Follow-ups vencidos ({comercial.followUps.length})
                  </p>
                  {comercial.followUps.map((f) => (
                    <p key={f.id} className="text-[12.5px] text-[var(--texto-2)]">
                      <Link href={`/lead/${f.leadId}`} className="text-[var(--azul)] hover:underline">
                        {f.lead}
                      </Link>
                      {f.motivo && ` — ${f.motivo}`}
                    </p>
                  ))}
                </div>
              )}
              {comercial.parados.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium">
                    Leads parados ({comercial.parados.length})
                  </p>
                  {comercial.parados.map((p) => (
                    <p key={p.id} className="text-[12.5px] text-[var(--texto-2)]">
                      <Link href={`/lead/${p.id}`} className="text-[var(--azul)] hover:underline">
                        {p.nome}
                      </Link>{" "}
                      — {p.etapa}, {p.diasParado} dias sem mudança
                    </p>
                  ))}
                  <p className="mt-1.5 text-[11.5px] text-[var(--texto-3)]">
                    Só sinalização — nada é enviado automaticamente.
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
