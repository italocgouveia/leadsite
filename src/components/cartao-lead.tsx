"use client";

import Link from "next/link";
import type { Lead } from "@/lib/db/schema";
import { avaliar } from "@/lib/oportunidade";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Card de decisão, não de consulta.
 *
 * Regra: em 2 segundos você responde "vale a pena abordar?". Por isso mostra
 * só nome, ramo, cidade, avaliação, nível de oportunidade e os três sinais
 * que decidem (site, Instagram, WhatsApp). O resto vive na página do lead.
 */
export default function CartaoLead({
  lead,
  aoProposta,
  selecionado,
  aoSelecionar,
}: {
  lead: Lead;
  aoProposta: () => void;
  selecionado?: boolean;
  aoSelecionar?: () => void;
}) {
  const o = avaliar(lead);
  const precisaSite = lead.statusSite !== "tem-site";

  return (
    <article
      className={`cartao cartao-interativo flex flex-col p-4 ${
        selecionado ? "border-[var(--azul)] ring-1 ring-[var(--azul)]" : ""
      }`}
    >
      <div className="mb-1 flex items-start gap-2">
        <Link
          href={`/lead/${lead.id}`}
          className="min-w-0 flex-1 text-[15px] font-semibold leading-snug hover:text-[var(--azul)]"
        >
          {lead.nome}
        </Link>
        {aoSelecionar && (
          <input
            type="checkbox"
            checked={selecionado}
            onChange={aoSelecionar}
            aria-label={`Selecionar ${lead.nome}`}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--azul)]"
          />
        )}
      </div>

      <p className="text-[13px] capitalize text-[var(--texto-2)]">{categoriaSingular(lead.categoria)}</p>

      <p className="mt-0.5 text-[13px] text-[var(--texto-3)]">
        {lead.cidade}
        {lead.estado ? ` · ${lead.estado}` : ""}
        {lead.nota != null && (
          <>
            {" · "}
            <span className="text-[var(--ambar)]">
              {lead.nota}
              {lead.avaliacoes ? ` (${lead.avaliacoes})` : ""}
            </span>
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`etiqueta etiqueta-${o.nivel}`}>{o.rotulo}</span>
        {/* O QUE vender importa tanto quanto SE vale a pena abordar. */}
        <span className={`etiqueta etiqueta-produto-${o.produto}`} title={o.oferta.motivo}>
          {o.oferta.rotulo}
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-[13px]">
        <Sinal ok={!precisaSite} bom="Tem site" ruim="Sem site" inverter />
        {lead.instagram && <Sinal ok bom="Instagram" />}
        {lead.whatsapp && <Sinal ok bom="WhatsApp" />}
        {!lead.whatsapp && !lead.telefone && <Sinal ok={false} ruim="Sem telefone" />}
      </ul>

      <div className="mt-4 flex gap-2">
        <button onClick={aoProposta} className="btn-primario flex-1">
          Enviar proposta
        </button>
        <Link href={`/lead/${lead.id}`} className="btn-secundario">
          Ver
        </Link>
      </div>
    </article>
  );
}

function Sinal({
  ok,
  bom,
  ruim,
  inverter,
}: {
  ok: boolean;
  bom?: string;
  ruim?: string;
  inverter?: boolean;
}) {
  // "Sem site" é bom pra você e ruim pro cliente — por isso o inverter.
  const positivo = inverter ? !ok : ok;
  const texto = ok ? bom : ruim;
  if (!texto) return null;

  return (
    <li
      className={`flex items-center gap-1.5 ${
        positivo ? "text-[var(--texto-2)]" : "text-[var(--texto-2)]"
      }`}
    >
      <span
        className={positivo ? "text-[var(--verde)]" : "text-[var(--vermelho)]"}
        aria-hidden
      >
        {positivo ? "✓" : "✕"}
      </span>
      {texto}
    </li>
  );
}
