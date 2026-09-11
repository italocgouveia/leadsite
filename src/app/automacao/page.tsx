"use client";

import Link from "next/link";
import { useDemo } from "@/lib/demo-automacao/contexto";
import { Barra, Etiqueta } from "@/components/central";
import { ROTULO_INTENCAO, type Intencao } from "@/lib/demo-automacao/motor";

/**
 * 📊 VISÃO GERAL — o painel que o cliente vê primeiro.
 *
 * Os números vêm de `indicadores(estado)`, calculados sobre os 100 contatos
 * fictícios a cada mudança. Nenhum é digitado: quando a simulação roda, eles
 * sobem sozinhos, e é isso que se mostra.
 *
 * A "economia estimada" é aritmética sobre a demonstração e está rotulada
 * como tal. Não é medida de nada real, e a tela diz isso.
 */
export default function VisaoGeralPage() {
  const { estado, metricas: m, apresentacao, iniciar } = useDemo();

  const porIntencao = new Map<Intencao, number>();
  for (const c of estado.contatos) porIntencao.set(c.intencao, (porIntencao.get(c.intencao) ?? 0) + 1);

  const cartoes = [
    { r: "Contatos monitorados", v: m.monitorados, destaque: false },
    { r: "Conversas em andamento", v: m.emConversa, destaque: true },
    { r: "Respondidas pela IA", v: m.respondidasPelaIA, destaque: false },
    { r: "Aguardando humano", v: m.aguardandoHumano, destaque: false },
    { r: "Interessados", v: m.interessados, destaque: false },
    { r: "Agendamentos", v: m.agendamentos, destaque: false },
    { r: "Fora do horário", v: m.foraDoHorario, destaque: false },
    { r: "Tempo médio de resposta", v: m.tempoMedio, destaque: false },
  ];

  /** Minutos que um humano gastaria por conversa. Suposição da demonstração. */
  const MINUTOS_POR_CONVERSA = 4;
  const minutosEconomizados = m.respondidasPelaIA * MINUTOS_POR_CONVERSA;

  return (
    <main>
      {/* ───────────── o funil de apresentação ───────────── */}
      {!estado.rodando && m.ciclos === 0 && (
        <section className="cartao mb-5 p-5 text-center">
          <p className="text-[17px] font-semibold">Imagine que estes sejam seus 100 clientes.</p>
          <p className="mx-auto mt-1.5 max-w-lg text-[13px] text-[var(--texto-3)]">
            Cada um mandou uma mensagem. A IA recebe, entende o que a pessoa quer, responde,
            classifica o interesse e — quando precisa — passa para uma pessoa.
          </p>
          <button onClick={iniciar} className="btn-primario mt-4">
            ▶ SIMULAR ATENDIMENTO
          </button>
        </section>
      )}

      <section className={`grid gap-2 ${apresentacao ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
        {cartoes.map((c) => (
          <div
            key={c.r}
            className={`rounded-[12px] px-4 py-4 ${
              c.destaque ? "bg-[var(--acao-fraco)] ring-1 ring-[var(--acao)]/25" : "cartao"
            }`}
          >
            <p
              className={`text-[26px] font-semibold leading-none tabular-nums ${
                c.destaque ? "text-[var(--acao)]" : ""
              }`}
            >
              {c.v}
            </p>
            <p className="mt-2 text-[11.5px] leading-tight text-[var(--texto-3)]">{c.r}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* ───────────── o funil ───────────── */}
        <section className="cartao p-5">
          <p className="text-[15px] font-semibold">O que aconteceu com os 100</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">
            Dados simulados — a demonstração gera estes números.
          </p>
          <div className="space-y-2">
            <Barra rotulo="Contatos" valor={m.monitorados} de={m.monitorados} />
            <Barra rotulo="Em conversa" valor={m.emConversa} de={m.monitorados} />
            <Barra rotulo="Respondidas pela IA" valor={m.respondidasPelaIA} de={m.monitorados} />
            <Barra rotulo="Interessados" valor={m.interessados} de={m.monitorados} cor="var(--verde)" />
            <Barra rotulo="Agendamentos" valor={m.agendamentos} de={m.monitorados} cor="var(--verde)" />
            <Barra rotulo="Pediram humano" valor={m.aguardandoHumano + m.humano} de={m.monitorados} cor="var(--ambar)" />
          </div>
        </section>

        {/* ───────────── o que perguntam ───────────── */}
        <section className="cartao p-5">
          <p className="text-[15px] font-semibold">O que os clientes perguntam</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">
            A IA classifica cada mensagem por intenção.
          </p>
          <div className="space-y-2">
            {[...porIntencao.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([i, q]) => (
                <Barra key={i} rotulo={ROTULO_INTENCAO[i]} valor={q} de={m.monitorados} />
              ))}
          </div>
        </section>
      </div>

      {/* ───────────── economia ───────────── */}
      <section className="cartao mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">Economia estimada de atendimento</p>
          <Etiqueta tom="alerta">estimativa da demonstração</Etiqueta>
        </div>
        <p className="mt-2 text-[13px] text-[var(--texto-2)]">
          <strong className="tabular-nums text-[var(--acao)]">{m.respondidasPelaIA}</strong> conversas
          automatizadas × <strong>{MINUTOS_POR_CONVERSA} min</strong> por atendimento manual ={" "}
          <strong className="tabular-nums">
            {Math.floor(minutosEconomizados / 60)}h{String(minutosEconomizados % 60).padStart(2, "0")}
          </strong>{" "}
          que uma pessoa não precisou gastar.
        </p>
        <p className="mt-1.5 text-[11.5px] text-[var(--texto-3)]">
          Os {MINUTOS_POR_CONVERSA} minutos são uma suposição da demonstração, não uma medição. Nenhum
          valor em dinheiro é mostrado porque não há dado real por trás.
        </p>
      </section>

      {!apresentacao && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/automacao/conversas" className="btn-primario">
            VER CONVERSAS
          </Link>
          <Link href="/automacao/contatos" className="btn-secundario">
            VER OS 100 CONTATOS
          </Link>
          <Link href="/automacao/fluxos" className="btn-secundario">
            COMO A IA DECIDE
          </Link>
        </div>
      )}
    </main>
  );
}
