"use client";

import { useState } from "react";
import { Etiqueta } from "@/components/central";

/**
 * 🔎 ANALISAR SITE — o botão do §18.
 *
 * Mostra o que a home publica, o que disso pode virar canal, e o que a análise
 * NÃO conseguiu concluir. As oportunidades vêm em três níveis separados — fato,
 * hipótese e desconhecido — porque juntá-los é como "o site não tem botão de
 * WhatsApp" vira "você está perdendo clientes" na frente do cliente.
 *
 * Nada aqui grava. O que a análise sugere aparece marcado como sugestão, com o
 * motivo de ter sido aceita ou recusada.
 */

type Sinal = { id: string; fato: string; presente: boolean };
type Achado = { campo: string; valor: string; aceito: boolean; motivo: string };
type Oportunidade = { titulo: string; fato: string; hipotese: string; desconhecido: string };

type Resposta = {
  analise:
    | { ok: false; motivo: string; url: string }
    | {
        ok: true;
        url: string;
        host: string;
        whatsapp: string | null;
        instagram: string | null;
        telefones: string[];
        email: string | null;
        redes: string[];
        servicos: string[];
        sinais: Sinal[];
      };
  oportunidades: Oportunidade[];
  achados: Achado[];
};

export default function AnaliseSite({ leadId, temSite }: { leadId: string; temSite: boolean }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (!temSite) return null;

  const analisar = async () => {
    setCarregando(true);
    setR(null);
    try {
      setR(
        await fetch("/api/analise-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId }),
        }).then((x) => x.json()),
      );
    } finally {
      setCarregando(false);
    }
  };

  if (!r) {
    return (
      <button onClick={() => void analisar()} disabled={carregando} className="btn-secundario">
        {carregando ? "Analisando…" : "🔎 ANALISAR SITE"}
      </button>
    );
  }

  if (!r.analise.ok) {
    return (
      <div className="mt-3 w-full rounded-[10px] bg-[var(--superficie)] px-4 py-3">
        <p className="text-[13px]">🔎 Análise do site</p>
        <p className="mt-1 text-[12.5px] text-[var(--texto-3)]">{r.analise.motivo}</p>
        <button onClick={() => void analisar()} className="btn-secundario mt-2.5">
          TENTAR DE NOVO
        </button>
      </div>
    );
  }

  const a = r.analise;
  const presentes = a.sinais.filter((s) => s.presente);
  const ausentes = a.sinais.filter((s) => !s.presente);

  return (
    <div className="mt-3 w-full rounded-[10px] bg-[var(--superficie)] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium">🔎 Análise de {a.host}</p>
        <button onClick={() => setR(null)} className="text-[12px] text-[var(--texto-3)]">
          fechar
        </button>
      </div>

      {/* ─────────── canais encontrados ─────────── */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {a.whatsapp && <Etiqueta tom="bom">📱 WhatsApp no site</Etiqueta>}
        {a.instagram && <Etiqueta tom="bom">📸 {a.instagram.replace(/^https?:\/\//, "")}</Etiqueta>}
        {a.telefones.length > 0 && <Etiqueta tom="bom">📞 {a.telefones.length} telefone(s)</Etiqueta>}
        {a.email && <Etiqueta tom="bom">✉️ {a.email}</Etiqueta>}
        {a.redes.map((x) => (
          <Etiqueta key={x}>{x}</Etiqueta>
        ))}
      </div>

      {/* ─────────── o que a sugestão faria ─────────── */}
      {r.achados.length > 0 && (
        <div className="mt-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            O que poderia entrar no cadastro
          </p>
          <ul className="mt-1 space-y-1">
            {r.achados.map((x) => (
              <li key={`${x.campo}-${x.valor}`} className="text-[12px]">
                <span className={x.aceito ? "text-[var(--verde)]" : "text-[var(--texto-3)]"}>
                  {x.aceito ? "✓" : "⊘"} {x.campo}: {x.valor}
                </span>
                <span className="text-[var(--texto-3)]"> — {x.motivo}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-[var(--texto-3)]">
            Esta tela não grava nada. A gravação é feita pelo enriquecimento supervisionado.
          </p>
        </div>
      )}

      {/* ─────────── sinais observados ─────────── */}
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Encontrado na página
          </p>
          <ul className="mt-1 space-y-0.5">
            {presentes.map((s) => (
              <li key={s.id} className="text-[12px] text-[var(--texto-2)]">
                ✓ {s.fato}
              </li>
            ))}
            {presentes.length === 0 && (
              <li className="text-[12px] text-[var(--texto-3)]">nada identificado</li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Ausente na página
          </p>
          <ul className="mt-1 space-y-0.5">
            {ausentes.slice(0, 8).map((s) => (
              <li key={s.id} className="text-[12px] text-[var(--texto-3)]">
                ⚠ {s.fato}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ─────────── oportunidades, em três níveis ─────────── */}
      {r.oportunidades.length > 0 && (
        <div className="mt-4">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Oportunidades detectadas
          </p>
          <ul className="mt-1.5 space-y-2.5">
            {r.oportunidades.map((o) => (
              <li key={o.titulo} className="rounded-[10px] bg-[var(--superficie-2)] px-3 py-2.5">
                <p className="text-[13px] font-medium">{o.titulo}</p>
                <p className="mt-1 text-[12px] text-[var(--texto-2)]">
                  <strong className="text-[var(--verde)]">Fato:</strong> {o.fato}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--texto-2)]">
                  <strong className="text-[var(--ambar)]">Hipótese:</strong> {o.hipotese}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--texto-3)]">
                  <strong>Não sabemos:</strong> {o.desconhecido}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
