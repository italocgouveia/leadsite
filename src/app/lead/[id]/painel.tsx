"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ETAPAS, type Lead, type Etapa, type ModeloSite } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { avaliar } from "@/lib/oportunidade";
import ModalProposta from "@/components/modal-proposta";
import QuemDecide from "@/components/quem-decide";
import ClienteOculto from "@/components/cliente-oculto";

type SiteResumo = { id: string; slug: string; publicado: boolean } | null;

/**
 * Página do lead: responde "por que vale a pena?" e deixa a proposta a um
 * clique. Tudo que é configuração fica embaixo, fora do caminho.
 */
export default function PainelLead({ lead, site }: { lead: Lead; site: SiteResumo }) {
  const router = useRouter();
  const o = avaliar(lead);

  const [propostaAberta, setPropostaAberta] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(lead.etapa);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  const [extra, setExtra] = useState({
    precos: lead.precos ?? "",
    horarios: lead.horarios ?? "",
    pagamento: lead.pagamento ?? "",
    notas: lead.notas ?? "",
  });
  const [salvo, setSalvo] = useState(false);

  const busca = encodeURIComponent(`${lead.nome} ${lead.cidade ?? ""}`);
  const urlPrevia =
    site?.publicado && typeof window !== "undefined"
      ? `${window.location.origin}/s/${site.slug}`
      : null;

  async function mudarEtapa(nova: Etapa) {
    setEtapa(nova);
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lead.id], etapa: nova, noCrm: true }),
    });
    router.refresh();
  }

  async function salvarExtra() {
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lead.id], ...extra }),
    });
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1800);
    router.refresh();
  }

  async function gerarSite(modelo: ModeloSite = "simples") {
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/sites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, modelo, regerar: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Falha ao gerar");
      router.push(`/sites/${data.site.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
      setGerando(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-20 lg:pt-10">
      <Link href="/" className="mb-5 inline-block text-[14px] text-[var(--azul)]">
        ‹ Voltar
      </Link>

      <header className="surgir mb-6">
        <h1 className="text-[28px] font-semibold leading-tight">{lead.nome}</h1>
        <p className="mt-1.5 text-[15px] capitalize text-[var(--texto-2)]">
          {categoriaSingular(lead.categoria)}
        </p>
        <p className="mt-0.5 text-[14px] text-[var(--texto-3)]">
          {lead.bairro ? `${lead.bairro}, ` : ""}
          {lead.cidade}
          {lead.estado ? ` · ${lead.estado}` : ""}
          {lead.nota != null && (
            <span className="text-[var(--ambar)]">
              {" · "}
              {lead.nota}
              {lead.avaliacoes ? ` (${lead.avaliacoes} avaliações)` : ""}
            </span>
          )}
        </p>
      </header>

      {/* --- ação principal, sempre à vista --- */}
      <section className="cartao surgir mb-6 p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className={`etiqueta etiqueta-${o.nivel}`}>{o.rotulo}</span>
          <span className="text-[13px] text-[var(--texto-2)]">{o.servico}</span>
        </div>

        <button
          onClick={() => setPropostaAberta(true)}
          className="btn-primario btn-g w-full"
        >
          Enviar proposta
        </button>

        <div className="mt-3 flex flex-wrap gap-2">
          {lead.whatsapp && (
            <a href={lead.whatsapp} target="_blank" rel="noreferrer" className="btn-whatsapp">
              WhatsApp
            </a>
          )}
          {lead.instagram && (
            <a href={lead.instagram} target="_blank" rel="noreferrer" className="btn-secundario">
              Instagram
            </a>
          )}
          {lead.mapsUrl && (
            <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className="btn-secundario">
              Google Maps
            </a>
          )}
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noreferrer" className="btn-secundario">
              Site atual
            </a>
          )}
          <a
            href={`https://www.google.com/search?q=${busca}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secundario"
          >
            Pesquisar
          </a>
        </div>
      </section>

      {/* --- por que vale a pena --- */}
      <section className="cartao surgir mb-6 p-5">
        <h2 className="mb-4 text-[16px] font-semibold">Por que esse lead é interessante?</h2>
        <ul className="space-y-2.5">
          {o.motivos.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[14px]">
              <span
                className={`mt-px shrink-0 ${m.bom ? "text-[var(--verde)]" : "text-[var(--vermelho)]"}`}
                aria-hidden
              >
                {m.bom ? "✓" : "✕"}
              </span>
              <span className={m.bom ? "" : "text-[var(--texto)]"}>{m.texto}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* --- status --- */}
      <QuemDecide lead={lead} />

      <ClienteOculto lead={lead} />

      <section className="cartao surgir mb-6 p-5">
        <h2 className="mb-3 text-[16px] font-semibold">Status</h2>
        <div className="flex flex-wrap gap-1.5">
          {ETAPAS.map((e) => (
            <button
              key={e.valor}
              onClick={() => mudarEtapa(e.valor)}
              className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
                etapa === e.valor
                  ? "bg-[var(--azul)] text-white"
                  : "bg-[var(--fundo-2)] text-[var(--texto-2)] hover:text-[var(--texto)]"
              }`}
            >
              {e.rotulo}
            </button>
          ))}
        </div>
      </section>

      {/* --- site demonstrativo: função secundária --- */}
      <section className="cartao surgir mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">Site demonstrativo</h2>
            <p className="mt-0.5 text-[13px] text-[var(--texto-2)]">
              {site
                ? site.publicado
                  ? "Publicado — o link entra na proposta automaticamente."
                  : "Em rascunho. Publique para poder enviar o link."
                : "Opcional. Mostrar a prévia costuma aumentar a resposta."}
            </p>
          </div>
          <div className="flex gap-2">
            {site && (
              <Link href={`/sites/${site.id}`} className="btn-secundario">
                Abrir
              </Link>
            )}
            <button
              onClick={() => gerarSite()}
              disabled={gerando}
              className="btn-secundario"
            >
              {gerando ? "Gerando…" : site ? "Gerar de novo" : "Gerar site"}
            </button>
          </div>
        </div>
        {erro && <p className="mt-3 text-[13px] text-[var(--vermelho)]">{erro}</p>}
      </section>

      {/* --- detalhes, escondidos por padrão --- */}
      <section className="cartao surgir p-5">
        <button
          onClick={() => setDetalhesAbertos((v) => !v)}
          className="flex w-full items-center justify-between text-[15px] font-medium"
        >
          Dados para o site
          <span className="text-[var(--texto-3)]">{detalhesAbertos ? "−" : "+"}</span>
        </button>

        {detalhesAbertos && (
          <div className="mt-5 space-y-4">
            <p className="text-[13px] text-[var(--texto-2)]">
              Opcional. O que ficar em branco não aparece no site — nada é inventado.
            </p>

            {(
              [
                ["precos", "Preços", "Um por linha. Ex: Corte - R$ 45", 3],
                ["horarios", "Horário", "Ex: Terça a sábado, 9h às 19h", 2],
                ["pagamento", "Pagamento", "Ex: Pix, cartão e dinheiro", 2],
                ["notas", "Suas anotações", "Só para você, não entra no site", 3],
              ] as [keyof typeof extra, string, string, number][]
            ).map(([k, rotulo, dica, linhas]) => (
              <div key={k}>
                <label className="mb-1 block text-[13px] font-medium">{rotulo}</label>
                <p className="mb-1.5 text-[12px] text-[var(--texto-3)]">{dica}</p>
                <textarea
                  value={extra[k]}
                  onChange={(e) => setExtra({ ...extra, [k]: e.target.value })}
                  rows={linhas}
                  className="campo resize-y"
                />
              </div>
            ))}

            <button onClick={salvarExtra} className="btn-secundario">
              {salvo ? "Salvo!" : "Salvar"}
            </button>
          </div>
        )}
      </section>

      {propostaAberta && (
        <ModalProposta
          lead={lead}
          urlPrevia={urlPrevia}
          aoFechar={() => setPropostaAberta(false)}
          aoEnviar={() => {
            setEtapa("proposta");
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
