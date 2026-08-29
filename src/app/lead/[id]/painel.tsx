"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ETAPAS, type Lead, type Etapa, type ModeloSite, type Conversa } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { avaliar } from "@/lib/oportunidade";
import ModalProposta from "@/components/modal-proposta";
import QuemDecide from "@/components/quem-decide";
import ClienteOculto from "@/components/cliente-oculto";
import ExcluirLead from "@/components/excluir-lead";
import Abas from "@/components/abas";
import ThreadConversa from "@/components/thread-conversa";

type SiteResumo = { id: string; slug: string; publicado: boolean } | null;

type Evento = { id: string; tipo: string; descricao: string; criadoEm: string };
type MensagemCampanha = {
  id: string;
  texto: string;
  status: string;
  origem: string;
  enviadaEm: string | null;
  criadoEm: string;
  campanhaNome: string | null;
};

type Aba = "geral" | "conversas" | "atividades" | "campanhas";

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

  const [aba, setAba] = useState<Aba>("geral");
  const [thread, setThread] = useState<Conversa[] | null>(null);
  const [textoResposta, setTextoResposta] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [mensagensCampanha, setMensagensCampanha] = useState<MensagemCampanha[] | null>(null);
  const [atendimentoHumano, setAtendimentoHumano] = useState(lead.atendimentoHumano);

  useEffect(() => {
    if (aba === "conversas" && thread === null) {
      fetch(`/api/conversas/${lead.id}`)
        .then((r) => r.json())
        .then((d: { mensagens: Conversa[] }) => setThread(d.mensagens))
        .catch(() => setThread([]));
      fetch(`/api/conversas/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "marcar-lida" }),
      }).catch(() => {});
    }
    if ((aba === "atividades" || aba === "campanhas") && eventos === null) {
      fetch(`/api/leads/${lead.id}/timeline`)
        .then((r) => r.json())
        .then((d: { eventos: Evento[]; mensagensCampanha: MensagemCampanha[] }) => {
          setEventos(d.eventos);
          setMensagensCampanha(d.mensagensCampanha);
        })
        .catch(() => {
          setEventos([]);
          setMensagensCampanha([]);
        });
    }
  }, [aba, thread, eventos, lead.id]);

  async function enviarResposta() {
    if (!textoResposta.trim()) return;
    setEnviandoResposta(true);
    try {
      const r = await fetch(`/api/conversas/${lead.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoResposta }),
      });
      if (r.ok) {
        setTextoResposta("");
        const d = await fetch(`/api/conversas/${lead.id}`).then((r2) => r2.json());
        setThread(d.mensagens);
      }
    } finally {
      setEnviandoResposta(false);
    }
  }

  async function alternarAtendimentoHumano() {
    const novo = !atendimentoHumano;
    setAtendimentoHumano(novo);
    await fetch(`/api/conversas/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: novo ? "assumir" : "devolver" }),
    });
  }

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

      <Abas<Aba>
        ativa={aba}
        aoTrocar={setAba}
        abas={[
          { valor: "geral", rotulo: "Visão geral" },
          { valor: "conversas", rotulo: "Conversas" },
          { valor: "atividades", rotulo: "Atividades" },
          { valor: "campanhas", rotulo: "Campanhas" },
        ]}
      />

      {aba === "conversas" && (
        <section className="cartao surgir mb-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--linha)] px-5 py-3">
            <h2 className="text-[15px] font-semibold">Conversa</h2>
            <button onClick={alternarAtendimentoHumano} className="btn-secundario">
              {atendimentoHumano ? "Devolver para automação" : "Assumir conversa"}
            </button>
          </div>
          {thread === null ? (
            <p className="p-5 text-[13px] text-[var(--texto-3)]">Carregando…</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <ThreadConversa mensagens={thread} />
            </div>
          )}
          <div className="border-t border-[var(--linha)] p-3">
            <div className="flex gap-2">
              <textarea
                value={textoResposta}
                onChange={(e) => setTextoResposta(e.target.value)}
                placeholder="Escreva uma mensagem…"
                rows={1}
                className="campo resize-none"
              />
              <button
                onClick={enviarResposta}
                disabled={enviandoResposta || !textoResposta.trim()}
                className="btn-primario"
              >
                Enviar
              </button>
            </div>
          </div>
        </section>
      )}

      {aba === "atividades" && (
        <section className="cartao surgir mb-6 p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Atividades</h2>
          {eventos === null ? (
            <p className="text-[13px] text-[var(--texto-3)]">Carregando…</p>
          ) : eventos.length === 0 ? (
            <p className="text-[13px] text-[var(--texto-3)]">Nada registrado ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {eventos.map((e) => (
                <li key={e.id} className="text-[13px]">
                  <span className="text-[var(--texto-3)]">
                    {new Date(e.criadoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {" — "}
                  <span className="text-[var(--texto)]">{e.descricao}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "campanhas" && (
        <section className="cartao surgir mb-6 p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Campanhas</h2>
          {mensagensCampanha === null ? (
            <p className="text-[13px] text-[var(--texto-3)]">Carregando…</p>
          ) : mensagensCampanha.length === 0 ? (
            <p className="text-[13px] text-[var(--texto-3)]">Este lead nunca entrou numa campanha.</p>
          ) : (
            <ul className="space-y-3">
              {mensagensCampanha.map((m) => (
                <li key={m.id} className="border-b border-[var(--linha)] pb-3 last:border-0">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[13px] font-medium text-[var(--texto)]">
                      {m.campanhaNome ?? "Campanha"}
                    </span>
                    <span className="etiqueta etiqueta-neutra">{m.status}</span>
                  </div>
                  <p className="text-[13px] text-[var(--texto-2)]">{m.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "geral" && (
        <>
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

      {/**
       * Excluir fica no fim, sozinho e sem cor. É a única ação desta tela que
       * não tem volta — perto dos botões de venda, viraria clique por engano.
       */}
      <div className="mt-8 flex justify-end">
        <ExcluirLead
          id={lead.id}
          nome={lead.nome}
          estilo="texto"
          aoExcluir={() => router.push("/meus-leads")}
        />
      </div>
        </>
      )}

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
