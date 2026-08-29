"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ETAPAS, type Lead, type Etapa } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { avaliar, ehOportunidade } from "@/lib/oportunidade";
import ModalProposta from "@/components/modal-proposta";
import BotaoExportar from "@/components/botao-exportar";
import ExcluirLead from "@/components/excluir-lead";

type Filtro = "todos" | Etapa;

const ROTULO: Record<Etapa, string> = Object.fromEntries(
  ETAPAS.map((e) => [e.valor, e.rotulo]),
) as Record<Etapa, string>;

/**
 * Ação de proposta da tabela.
 *
 * O rótulo muda com a etapa: mandar a primeira proposta e reenviar para quem
 * já recebeu são coisas diferentes, e antes as duas linhas mostravam a mesma
 * palavra. Quem já recebeu fica em segundo plano — o olho procura o que falta
 * fazer, não o que já foi feito.
 */
function BotaoProposta({ lead, aoAbrir }: { lead: Lead; aoAbrir: () => void }) {
  const jaEnviou = lead.etapa === "proposta" || lead.etapa === "fechado";
  const canal = lead.whatsapp ? "WhatsApp" : lead.instagram ? "Instagram" : "texto";

  return (
    <button
      onClick={aoAbrir}
      title={
        jaEnviou
          ? `Reenviar proposta para ${lead.nome}`
          : `Montar proposta de ${lead.nome} (${canal})`
      }
      className={`btn-proposta ${jaEnviou ? "btn-proposta-feito" : ""}`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {jaEnviou ? (
          <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
        ) : (
          <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />
        )}
      </svg>
      {jaEnviou ? "Reenviar" : "Proposta"}
    </button>
  );
}

export default function MeusLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [proposta, setProposta] = useState<Lead | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/list");
      const data = await res.json();
      setLeads((data.leads ?? []).sort((a: Lead, b: Lead) => b.score - a.score));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Os quatro números que importam. Nada de gráfico. */
  const resumo = {
    encontrados: leads.length,
    oportunidades: leads.filter((l) => ehOportunidade(l) && l.etapa === "novo").length,
    propostas: leads.filter((l) => l.etapa === "proposta").length,
    clientes: leads.filter((l) => l.etapa === "fechado").length,
  };

  const visiveis = filtro === "todos" ? leads : leads.filter((l) => l.etapa === filtro);

  const trabalhados = leads
    .filter((l) => l.etapa !== "novo")
    .sort(
      (a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime(),
    )
    .slice(0, 3);

  async function mudarEtapa(id: string, etapa: Etapa) {
    setLeads((l) => l.map((x) => (x.id === id ? { ...x, etapa } : x)));
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], etapa, noCrm: true }),
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-7 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold sm:text-[28px]">Meus leads</h1>
        <BotaoExportar ids={visiveis.map((l) => l.id)} />
      </header>

      <section className="surgir mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Leads encontrados", resumo.encontrados],
          ["Oportunidades", resumo.oportunidades],
          ["Propostas enviadas", resumo.propostas],
          ["Clientes", resumo.clientes],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="cartao p-4">
            <p className="text-[13px] text-[var(--texto-2)]">{rotulo}</p>
            <p className="mt-1 text-[26px] font-semibold tabular-nums">{valor}</p>
          </div>
        ))}
      </section>

      {trabalhados.length > 0 && (
        <section className="surgir mb-8">
          <h2 className="mb-3 text-[15px] font-semibold">Continue de onde parou</h2>
          <div className="flex flex-wrap gap-2">
            {trabalhados.map((l) => (
              <Link
                key={l.id}
                href={`/lead/${l.id}`}
                className="cartao cartao-interativo px-3.5 py-2.5 text-[14px]"
              >
                {l.nome}
                <span className="ml-2 text-[12px] text-[var(--texto-3)]">
                  {ROTULO[l.etapa]}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["todos", `Todos (${leads.length})`],
            ...ETAPAS.map(
              (e) =>
                [e.valor, `${e.rotulo} (${leads.filter((l) => l.etapa === e.valor).length})`] as [
                  Filtro,
                  string,
                ],
            ),
          ] as [Filtro, string][]
        ).map(([v, r]) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
              filtro === v
                ? "bg-[var(--azul)] text-white"
                : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="esqueleto h-14" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="cartao py-16 text-center">
          <p className="text-[15px]">Nenhum lead aqui.</p>
          <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
            <Link href="/" className="text-[var(--azul)]">
              Buscar empresas
            </Link>
          </p>
        </div>
      ) : (
        <div className="cartao hidden overflow-x-auto md:block">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-[var(--linha)] text-left text-[12px] text-[var(--texto-3)]">
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Cidade</th>
                <th className="px-3 py-2.5 font-medium">Oportunidade</th>
                <th className="px-3 py-2.5 text-center font-medium">Site</th>
                <th className="px-3 py-2.5 text-center font-medium">Zap</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((lead) => {
                const o = avaliar(lead);
                return (
                  <tr
                    key={lead.id}
                    className="border-b border-[var(--linha)] last:border-0 hover:bg-[var(--superficie-2)]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/lead/${lead.id}`}
                        className="font-medium hover:text-[var(--azul)]"
                      >
                        {lead.nome}
                      </Link>
                      <span className="block text-[12px] capitalize text-[var(--texto-3)]">
                        {categoriaSingular(lead.categoria)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--texto-2)]">{lead.cidade}</td>
                    <td className="px-3 py-2.5">
                      <span className={`etiqueta etiqueta-${o.nivel}`}>
                        {o.nivel === "alta" ? "Alta" : o.nivel === "boa" ? "Boa" : "Média"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {lead.statusSite === "tem-site" ? (
                        <span className="text-[var(--verde)]">✓</span>
                      ) : (
                        <span className="text-[var(--vermelho)]">✕</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {lead.whatsapp ? (
                        <span className="text-[var(--verde)]">✓</span>
                      ) : (
                        <span className="text-[var(--texto-3)]">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={lead.etapa}
                        onChange={(e) => mudarEtapa(lead.id, e.target.value as Etapa)}
                        aria-label={`Etapa de ${lead.nome}`}
                        className="select-etapa"
                      >
                        {ETAPAS.map((e) => (
                          <option key={e.valor} value={e.valor}>
                            {e.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <BotaoProposta lead={lead} aoAbrir={() => setProposta(lead)} />
                        <ExcluirLead
                          id={lead.id}
                          nome={lead.nome}
                          aoExcluir={() => setLeads((l) => l.filter((x) => x.id !== lead.id))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/**
       * Mesma informação em cartões no celular.
       *
       * Tabela de 7 colunas em tela de 375px não tem conserto: ou vira rolagem
       * horizontal (e ninguém acha a coluna de ação) ou espreme a ponto de o
       * nome do lead quebrar letra por letra. Duplicar a marcação aqui é o
       * preço de a tela funcionar no aparelho em que ela mais é usada.
       */}
      {!carregando && visiveis.length > 0 && (
        <ul className="space-y-2.5 md:hidden">
          {visiveis.map((lead) => {
            const o = avaliar(lead);
            return (
              <li key={lead.id} className="cartao p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/lead/${lead.id}`}
                      className="block text-[15px] font-medium leading-snug"
                    >
                      {lead.nome}
                    </Link>
                    <p className="mt-0.5 truncate text-[12.5px] capitalize text-[var(--texto-3)]">
                      {categoriaSingular(lead.categoria)} · {lead.cidade}
                    </p>
                  </div>
                  <span className={`etiqueta etiqueta-${o.nivel} shrink-0`}>
                    {o.nivel === "alta" ? "Alta" : o.nivel === "boa" ? "Boa" : "Média"}
                  </span>
                </div>

                <p className="mt-2 text-[12.5px] text-[var(--texto-2)]">{o.resumo}</p>

                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={lead.etapa}
                    onChange={(e) => mudarEtapa(lead.id, e.target.value as Etapa)}
                    aria-label={`Etapa de ${lead.nome}`}
                    className="select-etapa min-w-0 flex-1"
                  >
                    {ETAPAS.map((e) => (
                      <option key={e.valor} value={e.valor}>
                        {e.rotulo}
                      </option>
                    ))}
                  </select>
                  <BotaoProposta lead={lead} aoAbrir={() => setProposta(lead)} />
                  <ExcluirLead
                    id={lead.id}
                    nome={lead.nome}
                    aoExcluir={() => setLeads((l) => l.filter((x) => x.id !== lead.id))}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {proposta && (
        <ModalProposta
          lead={proposta}
          aoFechar={() => setProposta(null)}
          aoEnviar={() => {
            setLeads((l) =>
              l.map((x) => (x.id === proposta.id ? { ...x, etapa: "mensagem-enviada" } : x)),
            );
            setProposta(null);
          }}
        />
      )}
    </main>
  );
}
