"use client";

import type { Conversa } from "@/lib/db/schema";

const ROTULO_AUTOR: Record<string, string> = {
  automatico: "Resposta automática",
  campanha: "Campanha",
  humano: "Você",
};

function formatarHora(data: string | Date) {
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ThreadConversa({ mensagens }: { mensagens: Conversa[] }) {
  if (mensagens.length === 0) {
    return <p className="p-6 text-center text-[13px] text-[var(--texto-3)]">Nenhuma mensagem ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {mensagens.map((m) => {
        const enviada = m.direcao === "enviada";
        return (
          <div key={m.id} className={`flex ${enviada ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-[12px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                enviada
                  ? "bg-[var(--azul)] text-white"
                  : "bg-[var(--superficie-2)] text-[var(--texto)]"
              }`}
            >
              {enviada && m.autor && (
                <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-white/70">
                  {ROTULO_AUTOR[m.autor] ?? m.autor}
                </p>
              )}
              <p className="whitespace-pre-wrap">{m.texto}</p>
              <p
                className={`mt-1 text-right text-[11px] ${
                  enviada ? "text-white/70" : "text-[var(--texto-3)]"
                }`}
              >
                {formatarHora(m.criadoEm)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
