"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Painel de calibração da pontuação.
 *
 * Responde "esse critério está funcionando?" sem abrir o banco. Critério com
 * cobertura zero aparece marcado — foi assim que se descobriu que "volume de
 * avaliações" valia 15 pontos que ninguém na base podia ganhar.
 *
 * Também lista os leads de ALTA oportunidade com CONTATO RUIM: são os que a
 * régua antiga jogava fora e que agora viram fila de enriquecimento.
 */

type Criterio = {
  criterio: string;
  pontos: string;
  usa: string;
  quantos: number;
  pct: number;
};

type Dados = {
  total: number;
  criterios: Criterio[];
  distribuicao: {
    oportunidade: Record<string, number>;
    contato: Record<string, number>;
    percentis: { min: number; p25: number; mediana: number; p85: number; max: number };
  };
  segmentos: { segmento: string; potencial: string; leads: number }[];
  paraEnriquecer: {
    id: string;
    nome: string;
    segmento: string;
    cidade: string | null;
    oportunidade: number;
    contato: number;
    canais: string[];
  }[];
};

const EMOJI_FAIXA: Record<string, string> = {
  "muito-alta": "🔥",
  alta: "⚡",
  media: "🟡",
  baixa: "❄️",
  excelente: "📱",
  bom: "📞",
  possivel: "✉️",
  dificil: "🔎",
};

export default function Calibracao() {
  const [d, setD] = useState<Dados | null>(null);

  useEffect(() => {
    fetch("/api/calibracao")
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  if (!d) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="esqueleto h-64" />
      </main>
    );
  }

  const pctDe = (n: number) => Math.round((n / (d.total || 1)) * 100);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6">
        <h1 className="text-[24px] font-semibold sm:text-[28px]">Calibração da pontuação</h1>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
          Cobertura real de cada critério sobre {d.total} leads. Critério sem dado não
          pode valer ponto.
        </p>
      </header>

      {/* ---------------------------------------- critérios */}
      <section className="cartao surgir mb-6 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--linha)] text-left text-[11.5px] text-[var(--texto-3)]">
              <th className="px-4 py-2.5 font-medium">Critério</th>
              <th className="px-3 py-2.5 font-medium">Pontos</th>
              <th className="px-3 py-2.5 text-right font-medium">Cobertura</th>
              <th className="px-4 py-2.5 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {d.criterios.map((c) => (
              <tr key={c.criterio} className="border-b border-[var(--linha)] last:border-0">
                <td className="px-4 py-2.5">{c.criterio}</td>
                <td className="px-3 py-2.5 tabular-nums text-[var(--texto-2)]">
                  {c.pontos === "REMOVIDO" ? (
                    <span className="text-[var(--vermelho)]">removido</span>
                  ) : (
                    c.pontos
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {c.pct}% <span className="text-[var(--texto-3)]">({c.quantos})</span>
                </td>
                <td className="px-4 py-2.5">
                  {c.pct === 0 ? (
                    <span className="text-[var(--ambar)]">⚠ sem dados na base</span>
                  ) : c.pct < 15 ? (
                    <span className="text-[var(--texto-3)]">cobertura baixa</span>
                  ) : (
                    <span className="text-[var(--verde)]">ok</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------- distribuição */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="cartao surgir p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Oportunidade</h2>
          <ul className="space-y-2 text-[13px]">
            {Object.entries(d.distribuicao.oportunidade).map(([f, n]) => (
              <li key={f} className="flex items-center gap-2">
                <span className="w-[105px] shrink-0">
                  {EMOJI_FAIXA[f]} {f}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--azul)]"
                    style={{ width: `${pctDe(n)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {n} · {pctDe(n)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-[var(--texto-3)]">
            Percentis: min {d.distribuicao.percentis.min} · mediana{" "}
            {d.distribuicao.percentis.mediana} · p85 {d.distribuicao.percentis.p85} · máx{" "}
            {d.distribuicao.percentis.max}
          </p>
        </section>

        <section className="cartao surgir p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Contactabilidade</h2>
          <ul className="space-y-2 text-[13px]">
            {Object.entries(d.distribuicao.contato).map(([f, n]) => (
              <li key={f} className="flex items-center gap-2">
                <span className="w-[105px] shrink-0">
                  {EMOJI_FAIXA[f]} {f}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--superficie-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--verde)]"
                    style={{ width: `${pctDe(n)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {n} · {pctDe(n)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---------------------------------------- enriquecer */}
      <h2 className="mb-2 mt-7 text-[17px] font-semibold">
        🔎 Enriquecer contato ({d.paraEnriquecer.length})
      </h2>
      <p className="mb-3 text-[13px] text-[var(--texto-2)]">
        Alta oportunidade com contato difícil. A régua antiga rebaixava estes leads a
        &quot;frio&quot; por falta de WhatsApp — são justamente os que vale caçar o
        contato.
      </p>
      {d.paraEnriquecer.length === 0 ? (
        <div className="cartao px-5 py-10 text-center text-[14px] text-[var(--texto-2)]">
          Nenhum lead nessa situação.
        </div>
      ) : (
        <section className="cartao surgir overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--linha)] text-left text-[11.5px] text-[var(--texto-3)]">
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Segmento</th>
                <th className="px-3 py-2.5 text-right font-medium">Oport.</th>
                <th className="px-3 py-2.5 text-right font-medium">Contato</th>
                <th className="px-4 py-2.5 font-medium">Canais</th>
              </tr>
            </thead>
            <tbody>
              {d.paraEnriquecer.slice(0, 40).map((l) => (
                <tr key={l.id} className="border-b border-[var(--linha)] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/lead/${l.id}`} className="hover:text-[var(--azul)]">
                      {l.nome}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-[var(--texto-2)]">{l.segmento}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--azul)]">
                    {l.oportunidade}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ambar)]">
                    {l.contato}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--texto-3)]">
                    {l.canais.join(", ") || "nenhum"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------------------------------------- segmentos */}
      <h2 className="mb-3 mt-7 text-[17px] font-semibold">Potencial por segmento</h2>
      <section className="cartao surgir overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--linha)] text-left text-[11.5px] text-[var(--texto-3)]">
              <th className="px-4 py-2.5 font-medium">Segmento</th>
              <th className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th className="px-4 py-2.5 font-medium">Potencial</th>
            </tr>
          </thead>
          <tbody>
            {d.segmentos.map((s) => (
              <tr key={s.segmento} className="border-b border-[var(--linha)] last:border-0">
                <td className="px-4 py-2.5 capitalize">{s.segmento}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.leads}</td>
                <td className="px-4 py-2.5">
                  {s.potencial === "alto" ? (
                    <span className="text-[var(--verde)]">alto (40 pts)</span>
                  ) : s.potencial === "medio" ? (
                    <span className="text-[var(--ambar)]">médio (24 pts)</span>
                  ) : (
                    <span className="text-[var(--texto-3)]">avaliar (12 pts)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
