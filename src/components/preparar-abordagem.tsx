"use client";

import { useMemo, useState } from "react";
import type { Lead } from "@/lib/db/schema";
import { montarAbordagem, textoDaAbordagem } from "@/lib/abordagem-montada";
import { MATERIAIS, ROTULO_CANAL_MATERIAL } from "@/lib/materiais";
import { Etiqueta } from "@/components/central";

/**
 * ✨ PREPARAR ABORDAGEM — a prévia obrigatória do §17.
 *
 * Nada aqui envia. O botão copia; quem manda é você, pelo WhatsApp Web, pelo
 * Instagram ou pelo telefone. O disparo automático é outro caminho, continua
 * usando a mensagem universal e não passa por este componente.
 *
 * As quatro partes aparecem separadas de propósito. Um texto único convida a
 * colar sem ler; separado, você percebe quando a pergunta não encaixa naquele
 * negócio — e é a pergunta que faz o outro responder.
 */
export default function PrepararAbordagem({ lead }: { lead: Lead }) {
  const [aberto, setAberto] = useState(false);
  const [material, setMaterial] = useState<string>("");
  const [copiado, setCopiado] = useState(false);

  const a = useMemo(() => montarAbordagem(lead, material || undefined), [lead, material]);
  const texto = textoDaAbordagem(a);

  const copiar = async () => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* sem permissão: o texto continua selecionável na tela. */
    }
  };

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="btn-secundario">
        ✨ PREPARAR ABORDAGEM
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-[10px] bg-[var(--superficie)] px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium">Abordagem preparada</p>
        <Etiqueta tom="acao">{ROTULO_CANAL_MATERIAL[a.canal]}</Etiqueta>
      </div>

      <select
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        className="campo mt-2.5 w-full py-1.5 text-[12.5px]"
      >
        <option value="">
          escolha automática {a.materialId ? `(usando: ${a.materialId})` : ""}
        </option>
        {MATERIAIS.filter((m) => m.categoria === "primeiro-contato").map((m) => (
          <option key={m.id} value={m.id}>
            {m.titulo}
          </option>
        ))}
      </select>

      {texto ? (
        <>
          <div className="mt-3 space-y-2.5">
            {a.abertura && (
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                  Abertura
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{a.abertura}</p>
              </div>
            )}
            {a.valor && (
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                  Proposta de valor
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{a.valor}</p>
              </div>
            )}
            {a.pergunta && (
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                  Pergunta / chamada
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-[var(--acao)]">{a.pergunta}</p>
              </div>
            )}
          </div>

          {/**
           * O QUE NÃO FOI DITO. Sem isto, a prévia parece completa quando na
           * verdade omitiu uma frase por falta de dado — e você mandaria uma
           * abordagem mais fraca sem saber por quê.
           */}
          {a.faltando.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--texto-3)]">
              Frases omitidas por falta de dado: {a.faltando.join(", ")}. O texto sai sem elas —
              nada foi preenchido com suposição.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void copiar()} className="btn-primario">
              {copiado ? "COPIADO ✓" : "COPIAR PARA MANDAR À MÃO"}
            </button>
            <button onClick={() => setAberto(false)} className="btn-secundario">
              FECHAR
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--texto-3)]">
            Este botão copia. Nada é enviado daqui — nem agora, nem depois.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12.5px] text-[var(--texto-3)]">
          Não há dados suficientes para montar uma abordagem honesta para este lead. Falta:{" "}
          {a.faltando.join(", ")}. Enriqueça o cadastro antes de abordar.
        </p>
      )}
    </div>
  );
}
