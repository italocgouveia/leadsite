"use client";

import { useState } from "react";
import { PERGUNTAS } from "@/lib/assistente";
import { Etiqueta } from "@/components/central";

/**
 * 🤖 O ASSISTENTE, na tela do lead.
 *
 * As perguntas da lista vêm primeiro e são respondidas pelo próprio sistema —
 * instantâneas, gratuitas e sem chance de invenção. A caixa de pergunta livre
 * fica embaixo, porque é a exceção, não o caminho principal.
 *
 * A etiqueta de FONTE é obrigatória: você precisa saber, olhando, se aquilo
 * saiu de uma função determinística ou de um modelo de linguagem. As duas
 * coisas merecem confianças diferentes.
 */

type Resposta = {
  resposta: string;
  fonte: "sistema" | "ia" | "indisponivel" | "erro";
  dossie?: { confirmado: string[]; hipoteses: string[]; desconhecido: string[] };
};

const ROTULO_FONTE: Record<Resposta["fonte"], { texto: string; tom: "bom" | "alerta" | "neutro" }> = {
  sistema: { texto: "✓ resposta do sistema", tom: "bom" },
  ia: { texto: "🤖 gerado por IA — confira", tom: "alerta" },
  indisponivel: { texto: "IA não configurada", tom: "neutro" },
  erro: { texto: "modelo indisponível", tom: "neutro" },
};

export default function AssistenteLead({ leadId }: { leadId: string }) {
  const [aberto, setAberto] = useState(false);
  const [r, setR] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [livre, setLivre] = useState("");

  const perguntar = async (corpo: Record<string, string>) => {
    setCarregando(true);
    setR(null);
    try {
      setR(
        await fetch("/api/assistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, ...corpo }),
        }).then((x) => x.json()),
      );
    } finally {
      setCarregando(false);
    }
  };

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="btn-secundario">
        🤖 ASSISTENTE
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-[10px] bg-[var(--superficie)] px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium">🤖 Assistente comercial</p>
        <button onClick={() => setAberto(false)} className="text-[12px] text-[var(--texto-3)]">
          fechar
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PERGUNTAS.map((p) => (
          <button
            key={p.id}
            onClick={() => void perguntar({ perguntaId: p.id })}
            className="rounded-full bg-[var(--superficie-2)] px-3 py-1.5 text-[12px] transition hover:bg-[var(--linha)]"
          >
            {p.pergunta}
          </button>
        ))}
      </div>

      {carregando && <p className="mt-3 text-[12.5px] text-[var(--texto-3)]">pensando…</p>}

      {r && (
        <div className="mt-3">
          <Etiqueta tom={ROTULO_FONTE[r.fonte].tom}>{ROTULO_FONTE[r.fonte].texto}</Etiqueta>
          <pre className="mt-2 whitespace-pre-wrap rounded-[10px] bg-[var(--superficie-2)] px-3.5 py-3 font-sans text-[13px] leading-relaxed">
            {r.resposta}
          </pre>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (livre.trim().length >= 3) void perguntar({ texto: livre.trim() });
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={livre}
          onChange={(e) => setLivre(e.target.value)}
          placeholder="pergunta livre (usa IA)…"
          className="campo flex-1 py-1.5 text-[12.5px]"
        />
        <button type="submit" disabled={carregando || livre.trim().length < 3} className="btn-secundario">
          PERGUNTAR
        </button>
      </form>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--texto-3)]">
        O assistente só enxerga o que está no cadastro deste lead, e recebe fato e hipótese
        separados. Ele não pesquisa, não navega e não pode afirmar o que o sistema não sabe.
      </p>
    </div>
  );
}
