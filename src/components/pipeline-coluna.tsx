"use client";

import Link from "next/link";
import { ETAPAS_FUNIL, type Lead, type Etapa } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import ExcluirLead from "@/components/excluir-lead";

const COR_TEMP: Record<string, string> = {
  quente: "bg-[var(--vermelho-fraco)] text-[var(--vermelho)]",
  morno: "bg-[var(--ambar-fraco)] text-[var(--ambar)]",
  frio: "bg-[var(--azul-fraco)] text-[var(--azul)]",
};

/**
 * A cor da coluna vem de ETAPAS_FUNIL, não de um mapa paralelo aqui.
 * Antes eram duas listas para manter em sincronia, e acrescentar etapa
 * quebrava o tipo em vez de só faltar cor.
 */
function corDaEtapa(etapa: Etapa): string {
  return ETAPAS_FUNIL.find((e) => e.valor === etapa)?.cor ?? "var(--linha-forte)";
}

export function CartaoFunil({
  lead,
  aoAbrir,
  arrastando,
  aoIniciarArraste,
  aoTerminarArraste,
  aoExcluir,
}: {
  lead: Lead;
  aoAbrir: () => void;
  arrastando: boolean;
  aoIniciarArraste: () => void;
  aoTerminarArraste: () => void;
  aoExcluir?: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        // Precisa setar algum dado, senão o Firefox nem inicia o arraste.
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        aoIniciarArraste();
      }}
      onDragEnd={aoTerminarArraste}
      className={`cartao cartao-borda cursor-grab p-3.5 transition active:cursor-grabbing ${
        arrastando ? "opacity-40" : "cartao-interativo cartao-brilho"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <button
          onClick={aoAbrir}
          className="min-w-0 flex-1 truncate text-left text-[14px] font-medium leading-tight hover:text-[var(--azul)]"
        >
          {lead.nome}
        </button>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--verde)]">
          {lead.score}
        </span>
      </div>

      <p className="mb-2.5 truncate text-[12px] text-[var(--texto-2)]">
        {categoriaSingular(lead.categoria)} · {lead.cidade}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${COR_TEMP[lead.temperatura]}`}
        >
          {lead.temperatura}
        </span>

        {lead.whatsapp && (
          <a
            href={lead.whatsapp}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--verde)] hover:bg-[var(--verde-fraco)]"
          >
            WhatsApp
          </a>
        )}

        {lead.instagram && (
          <a
            href={lead.instagram}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--ambar)] hover:bg-[var(--ambar-fraco)]"
          >
            Instagram
          </a>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/lead/${lead.id}`}
            className="text-[11px] text-[var(--azul)] hover:opacity-70"
          >
            Ver ›
          </Link>
          {aoExcluir && (
            <span onClick={(e) => e.stopPropagation()}>
              <ExcluirLead id={lead.id} nome={lead.nome} aoExcluir={aoExcluir} />
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

export function Coluna({
  etapa,
  rotulo,
  leads,
  alvo,
  className = "",
  children,
  aoSoltar,
  aoEntrar,
  aoSair,
}: {
  etapa: Etapa;
  rotulo: string;
  leads: Lead[];
  alvo: boolean;
  /** Largura vem de fora: quem sabe se é celular ou desktop é a página. */
  className?: string;
  children: React.ReactNode;
  aoSoltar: (etapa: Etapa) => void;
  aoEntrar: (etapa: Etapa) => void;
  aoSair: () => void;
}) {
  return (
    <section
      onDragOver={(e) => {
        // Sem o preventDefault o navegador recusa o drop. É o erro clássico.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        aoEntrar(etapa);
      }}
      onDragLeave={(e) => {
        /**
         * `dragleave` sobe dos filhos. Sem esta checagem, passar o mouse por
         * cima de um card DENTRO da coluna já apagava o realce — a coluna
         * piscava a cada card que o cursor cruzava.
         *
         * `relatedTarget` é para onde o ponteiro foi. Se ainda está dentro
         * desta coluna, não saiu de verdade.
         */
        const indo = e.relatedTarget as Node | null;
        if (indo && e.currentTarget.contains(indo)) return;
        aoSair();
      }}
      onDrop={(e) => {
        e.preventDefault();
        aoSoltar(etapa);
      }}
      className={`coluna-funil flex flex-col rounded-[18px] p-3 transition-colors ${className} ${
        alvo ? "coluna-funil-alvo" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: corDaEtapa(etapa) }}
        />
        <h2 className="text-[13px] font-medium">{rotulo}</h2>
        <span className="ml-auto rounded-full bg-[var(--superficie-2)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--texto-2)]">
          {leads.length}
        </span>
      </div>

      <div className="min-h-[120px] space-y-2">{children}</div>
    </section>
  );
}
