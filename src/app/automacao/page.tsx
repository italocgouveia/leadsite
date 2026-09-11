"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemo } from "@/lib/demo-automacao/contexto";
import { Barra, Etiqueta } from "@/components/central";
import { ROTULO_INTENCAO, DEMO_CONTACT_LIMIT, type Intencao } from "@/lib/demo-automacao/motor";

/**
 * 📊 VISÃO GERAL — o painel que o cliente vê primeiro.
 *
 * Os números vêm de `getMetrics(estado)`, calculados sobre os dez contatos a
 * cada mudança. Nenhum é digitado: quando a simulação roda, eles sobem
 * sozinhos, e é isso que se mostra.
 *
 * A "economia estimada" é aritmética sobre a demonstração e está rotulada
 * como tal. Não é medida de nada real.
 */
export default function VisaoGeralPage() {
  const { estado, metricas: m, apresentacao, iniciar, digitandoEm } = useDemo();
  const router = useRouter();

  /**
   * INICIAR aqui leva para as conversas. O movimento da demonstração é a
   * conversa acontecendo; ficar na visão geral vendo número subir é a
   * versão fraca do mesmo momento.
   */
  const iniciarEVer = () => {
    iniciar();
    router.push("/automacao/conversas");
  };

  /** Os últimos toques da simulação, para a visão geral também ter vida. */
  const recentes = [...estado.contatos]
    .filter((c) => c.mensagens.length > 0)
    .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade))
    .slice(0, 5);

  const porIntencao = new Map<Intencao, number>();
  for (const c of estado.contatos) {
    if (c.mensagens.length) porIntencao.set(c.intencao, (porIntencao.get(c.intencao) ?? 0) + 1);
  }

  /**
   * Cada número com o que ele significa para o negócio — "7 atendimentos
   * respondidos", não "7". Sem o contexto, o cartão é uma estatística; com
   * ele, é uma consequência da operação que o cliente está vendo rodar.
   */
  const cartoes = [
    { r: "Conversas monitoradas", v: m.monitorados },
    { r: "Atendimentos respondidos", v: m.respondidasPelaIA, destaque: true },
    { r: "Clientes interessados", v: m.interessados },
    { r: "Pediram orçamento", v: m.orcamentos },
    { r: "Agendamentos", v: m.agendamentos },
    { r: "Transferidos para humano", v: m.aguardandoHumano + m.humano },
    { r: "Tempo médio de resposta da IA", v: m.tempoMedio },
  ];

  const MINUTOS_POR_CONVERSA = 4;
  const minutos = m.respondidasPelaIA * MINUTOS_POR_CONVERSA;

  return (
    <main>
      {!estado.rodando && m.ciclos === 0 && (
        <section className="cartao mb-5 p-6 text-center">
          <p className="text-[18px] font-semibold">Imagine que estes sejam {DEMO_CONTACT_LIMIT} dos seus clientes.</p>
          <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-[var(--texto-3)]">
            Cada um manda uma mensagem. A IA recebe, entende o que a pessoa quer, responde,
            classifica o interesse e — quando precisa — passa para uma pessoa.
          </p>
          <button onClick={iniciarEVer} className="btn-primario mt-4">▶ INICIAR DEMONSTRAÇÃO</button>
        </section>
      )}

      {/* ───────────── ao vivo ───────────── */}
      {(estado.rodando || m.ciclos > 0) && (
        <section className="cartao mb-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium">
              {estado.rodando ? <span className="text-[var(--verde)]">● </span> : null}
              {estado.rodando ? "Acontecendo agora" : "Últimas conversas"}
            </p>
            <Link href="/automacao/conversas" className="text-[12px] text-[var(--acao)] underline">abrir conversas →</Link>
          </div>
          <ul className="mt-2 divide-y divide-[var(--linha)]">
            {recentes.map((c) => {
              const ultima = c.mensagens.at(-1);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                  <span className="shrink-0 font-medium">{c.nome}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--texto-3)]">
                    {digitandoEm === c.id ? <span className="text-[var(--acao)]">IA está digitando…</span> : <>{ultima?.autor === "ia" ? "🤖 " : ""}{ultima?.texto}</>}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-[var(--texto-3)]">{ROTULO_INTENCAO[c.intencao]}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {cartoes.map((c) => (
          <div
            key={c.r}
            className={`rounded-[12px] px-4 py-4 ${c.destaque ? "bg-[var(--acao-fraco)] ring-1 ring-[var(--acao)]/25" : "cartao"}`}
          >
            <p className={`${apresentacao ? "text-[30px]" : "text-[26px]"} font-semibold leading-none tabular-nums ${c.destaque ? "text-[var(--acao)]" : ""}`}>
              {c.v}
            </p>
            <p className="mt-2 text-[10.5px] font-medium uppercase leading-tight tracking-wider text-[var(--texto-3)]">{c.r}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="cartao p-5">
          <p className="text-[15px] font-semibold">O que a IA fez com os {DEMO_CONTACT_LIMIT} atendimentos</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">Dados simulados — a demonstração gera estes números.</p>
          <div className="space-y-2">
            <Barra rotulo="Clientes monitorados" valor={m.monitorados} de={m.monitorados} />
            <Barra rotulo="Conversas iniciadas" valor={m.conversasIniciadas} de={m.monitorados} />
            <Barra rotulo="Respondidas pela IA" valor={m.respondidasPelaIA} de={m.monitorados} />
            <Barra rotulo="Interessados" valor={m.interessados} de={m.monitorados} cor="var(--verde)" />
            <Barra rotulo="Solicitaram orçamento" valor={m.orcamentos} de={m.monitorados} cor="var(--verde)" />
            <Barra rotulo="Agendamentos" valor={m.agendamentos} de={m.monitorados} cor="var(--verde)" />
            <Barra rotulo="Transferidos para humano" valor={m.aguardandoHumano + m.humano} de={m.monitorados} cor="var(--ambar)" />
          </div>
        </section>

        <section className="cartao p-5">
          <p className="text-[15px] font-semibold">O que os clientes perguntam</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">A IA classifica cada mensagem por intenção.</p>
          <div className="space-y-2">
            {[...porIntencao.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([i, q]) => <Barra key={i} rotulo={ROTULO_INTENCAO[i]} valor={q} de={m.conversasIniciadas || 1} />)}
          </div>
        </section>
      </div>

      <section className="cartao mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">Economia estimada de atendimento</p>
          <Etiqueta tom="alerta">estimativa da demonstração</Etiqueta>
        </div>
        <p className="mt-2 text-[13px] text-[var(--texto-2)]">
          <strong className="tabular-nums text-[var(--acao)]">{m.respondidasPelaIA}</strong> conversas automatizadas ×{" "}
          <strong>{MINUTOS_POR_CONVERSA} min</strong> por atendimento manual ={" "}
          <strong className="tabular-nums">{Math.floor(minutos / 60)}h{String(minutos % 60).padStart(2, "0")}</strong> que uma pessoa não precisou gastar.
        </p>
        <p className="mt-1.5 text-[11.5px] text-[var(--texto-3)]">
          Os {MINUTOS_POR_CONVERSA} minutos são uma suposição da demonstração, não uma medição. Nenhum valor em dinheiro é mostrado porque não há dado real por trás.
        </p>
      </section>

      {!apresentacao && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/automacao/conversas" className="btn-primario">VER CONVERSAS</Link>
          <Link href="/automacao/contatos" className="btn-secundario">VER OS {DEMO_CONTACT_LIMIT} CONTATOS</Link>
          <Link href="/automacao/fluxos" className="btn-secundario">COMO A IA DECIDE</Link>
        </div>
      )}
    </main>
  );
}
