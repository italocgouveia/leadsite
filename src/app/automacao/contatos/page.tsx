"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";
import { ROTULO_INTENCAO, ROTULO_ETAPA } from "@/lib/demo-automacao/motor";

/**
 * 👥 CONTATOS — os dez, em tabela.
 *
 * "Imagine que estes sejam 10 dos seus clientes." A tabela existe para essa
 * frase: o cliente vê a lista inteira, com nome fictício e telefone (00), e
 * entende que cada linha é uma conversa que a IA cuida.
 */

type Filtro = "todos" | "ia" | "interessados" | "orcamento" | "agendamento" | "humano" | "aguardando";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "ia", rotulo: "🤖 IA atendendo" },
  { id: "interessados", rotulo: "🔥 Interessados" },
  { id: "orcamento", rotulo: "💰 Orçamento" },
  { id: "agendamento", rotulo: "📅 Agendamento" },
  { id: "humano", rotulo: "👤 Humano" },
  { id: "aguardando", rotulo: "⏳ Aguardando" },
];

const INTERESSE = { alto: "🔥 Alto", medio: "🟡 Médio", baixo: "⚪ Baixo", indefinido: "—" } as const;

function tempo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (diff < 1) return "agora";
  if (diff < 60) return `${Math.floor(diff)} min`;
  return `${Math.floor(diff / 60)} h`;
}

export default function ContatosPage() {
  const { estado, apresentacao } = useDemo();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return estado.contatos
      .filter((c) => {
        if (filtro === "ia") return c.mensagens.length > 0 && !c.atendimentoHumano && c.etapa !== "encerrado";
        if (filtro === "interessados") return c.interesse === "alto";
        if (filtro === "orcamento") return c.intencao === "preco";
        if (filtro === "agendamento") return c.etapa === "agendado";
        if (filtro === "humano") return c.atendimentoHumano || c.intencao === "humano";
        if (filtro === "aguardando") return c.mensagens.length === 0 || c.aguardandoIA;
        return true;
      })
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo))
      .sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));
  }, [estado.contatos, filtro, busca]);

  const status = (c: (typeof lista)[number]) =>
    c.atendimentoHumano ? "👤 Humano" : c.aguardandoIA ? "⏳ Aguardando" : c.mensagens.length ? "🤖 IA" : "Monitorado";

  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full px-3 py-1.5 text-[12px] transition ${filtro === f.id ? "bg-[var(--acao)] font-medium text-[#04201d]" : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"}`}
          >
            {f.rotulo}
          </button>
        ))}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar cliente…" className="campo ml-auto w-48 py-1.5 text-[12.5px]" />
      </div>

      <p className="mb-3 text-[12px] text-[var(--texto-3)]">{lista.length} de {estado.contatos.length} · dados simulados</p>

      <div className="cartao overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--linha)] text-left text-[10.5px] uppercase tracking-wider text-[var(--texto-3)]">
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Intenção</th>
              <th className="px-3 py-2.5 font-medium">Interesse</th>
              <th className="px-3 py-2.5 font-medium">Etapa</th>
              <th className="px-3 py-2.5 font-medium">Última interação</th>
              <th className="px-3 py-2.5 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-b border-[var(--linha)] last:border-0 hover:bg-[var(--superficie)]">
                <td className="px-4 py-2.5">
                  <Link href="/automacao/conversas" className="font-medium hover:underline">{c.nome}</Link>
                  {!apresentacao && <p className="text-[11px] tabular-nums text-[var(--texto-3)]">{c.telefone}</p>}
                </td>
                <td className="px-3 py-2.5 text-[var(--texto-2)]">{status(c)}</td>
                <td className="px-3 py-2.5">{c.mensagens.length ? ROTULO_INTENCAO[c.intencao] : <span className="text-[var(--texto-3)]">—</span>}</td>
                <td className="px-3 py-2.5">{INTERESSE[c.interesse]}</td>
                <td className="px-3 py-2.5">
                  <Etiqueta tom={c.etapa === "agendado" || c.etapa === "interessado" || c.etapa === "negociacao" ? "bom" : c.etapa === "humano" ? "alerta" : c.etapa === "em-conversa" ? "acao" : "neutro"}>
                    {ROTULO_ETAPA[c.etapa]}
                  </Etiqueta>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-[var(--texto-3)]">
                  {c.mensagens.at(-1)?.texto ?? "—"} <span className="tabular-nums">· {tempo(c.ultimaAtividade)}</span>
                </td>
                <td className="px-3 py-2.5 text-[var(--texto-2)]">{c.atendimentoHumano ? "👤 Atendente" : c.mensagens.length ? "🤖 IA" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
