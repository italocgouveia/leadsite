"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemo } from "@/lib/demo-automacao/contexto";

/**
 * O cabeçalho comum das telas de automação: sub-navegação, os três estados
 * verdes, os controles da demonstração e o selo que nunca sai.
 *
 * O SELO NÃO É OPCIONAL. Uma demonstração convincente é precisamente o
 * cenário em que alguém pode confundir o fictício com o real — e a operação
 * real deste CRM envia mensagem de WhatsApp de verdade. O selo fica em toda
 * tela e sobrevive ao modo apresentação, que esconde o resto.
 */

const ABAS = [
  { href: "/automacao", rotulo: "Visão geral" },
  { href: "/automacao/conversas", rotulo: "Conversas IA" },
  { href: "/automacao/contatos", rotulo: "Contatos" },
  { href: "/automacao/fluxos", rotulo: "Fluxos" },
  { href: "/automacao/configuracoes", rotulo: "Configurações" },
];

export default function CabecalhoAutomacao() {
  const caminho = usePathname();
  const { estado, metricas, apresentacao, iniciar, parar, alternarIA, alternarApresentacao, reiniciar } = useDemo();

  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">🤖 Automação IA</h1>
          <p className="mt-1 text-[13px] text-[var(--texto-3)]">
            {apresentacao ? "Atendimento automático 24h, com uma pessoa a um clique." : "Seu assistente de IA responde seus clientes enquanto você cuida do negócio."}
          </p>
        </div>
        <span
          title="Conversas e contatos desta área são fictícios e não interferem na operação real."
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ambar-fraco)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ambar)]"
        >
          🧪 MODO DEMONSTRAÇÃO
        </span>
      </div>

      {/* ───────────── os estados ───────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
        <span className={estado.iaAtiva ? "text-[var(--verde)]" : "text-[var(--texto-3)]"}>
          {estado.iaAtiva ? "🟢 IA ativa" : "⚪ IA pausada"}
        </span>
        <span className="text-[var(--verde)]">🟢 WhatsApp conectado</span>
        <span className={estado.rodando ? "text-[var(--verde)]" : "text-[var(--texto-3)]"}>
          {estado.rodando ? "🟢 Atendimento automático" : "⚪ Atendimento em espera"}
        </span>
        <span className="tabular-nums text-[var(--texto-2)]">{metricas.monitorados} contatos monitorados</span>
      </div>

      {/* ───────────── controles ───────────── */}
      <div className="mt-3 flex flex-wrap gap-2">
        {estado.rodando ? (
          <button onClick={parar} className="btn-secundario">
            ⏸ PAUSAR
          </button>
        ) : (
          <button onClick={iniciar} className="btn-primario">
            ▶ INICIAR DEMONSTRAÇÃO
          </button>
        )}
        <button onClick={alternarIA} className="btn-secundario">
          {estado.iaAtiva ? "PAUSAR IA" : "RETOMAR IA"}
        </button>
        <button
          onClick={alternarApresentacao}
          className={apresentacao ? "btn-primario" : "btn-secundario"}
          title="Esconde o técnico e destaca o resultado, para mostrar ao cliente"
        >
          {apresentacao ? "🎬 APRESENTANDO" : "🎬 MODO APRESENTAÇÃO"}
        </button>
        {!apresentacao && (
          <button onClick={reiniciar} className="btn-secundario" title="Volta os 10 contatos ao estado inicial">
            REINICIAR DEMONSTRAÇÃO
          </button>
        )}
      </div>

      {/* ───────────── sub-navegação ───────────── */}
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-[var(--linha)]">
        {ABAS.map((a) => {
          const ativo = caminho === a.href;
          return (
            <Link
              key={a.href}
              href={a.href}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] transition ${
                ativo
                  ? "border-[var(--acao)] font-medium text-[var(--texto)]"
                  : "border-transparent text-[var(--texto-3)] hover:text-[var(--texto-2)]"
              }`}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </nav>

      {!apresentacao && (
        <p className="mt-2 text-[11px] text-[var(--texto-3)]">
          Dados simulados. Nada daqui chega ao banco, à fila ou ao WhatsApp.
        </p>
      )}
    </header>
  );
}
