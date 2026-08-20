"use client";

import { useState } from "react";

/**
 * Baixa CSV dos leads que estão na tela AGORA.
 *
 * Manda os ids em vez de repetir os filtros no servidor: o que você vê é
 * exatamente o que sai no arquivo, sem risco de a tela e a exportação
 * discordarem quando um filtro mudar de um lado só.
 */
export default function BotaoExportar({ ids }: { ids: string[] }) {
  const [baixando, setBaixando] = useState(false);

  async function exportar() {
    if (baixando || ids.length === 0) return;
    setBaixando(true);
    try {
      const res = await fetch("/api/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(String(res.status));

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      // Sem o revoke o blob fica na memória da aba até recarregar.
      URL.revokeObjectURL(url);
    } catch {
      alert("Não consegui gerar o CSV. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      onClick={exportar}
      disabled={baixando || ids.length === 0}
      title={ids.length === 0 ? "Nenhum lead para exportar" : undefined}
      className="flex items-center gap-2 rounded-[8px] border border-[var(--linha)] bg-[var(--superficie)] px-3 py-1.5 text-[13px] font-medium text-[var(--texto-2)] transition hover:text-[var(--texto)] disabled:opacity-40"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
      </svg>
      {baixando ? "Gerando…" : `Exportar CSV (${ids.length})`}
    </button>
  );
}
