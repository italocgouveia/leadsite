"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lead } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { avaliar, ehOportunidade } from "@/lib/oportunidade";
import ModalProposta from "@/components/modal-proposta";
import BuscaRapida from "@/components/busca-rapida";
import BotaoExportar from "@/components/botao-exportar";
import ExcluirLead from "@/components/excluir-lead";

/**
 * A lista de trabalho do dia, de UM produto só.
 *
 * A versão anterior misturava tudo numa tela só, com um filtro de produto no
 * meio de outros seis botões idênticos — e, pior, os cards não diziam qual
 * produto era qual. Dava pra filtrar por "Chatbot" e não ter nada na tela
 * confirmando o que você estava vendo.
 *
 * Agora o produto é a TELA, não um filtro. Vender site e vender chatbot são
 * dias de trabalho diferentes: discurso diferente, lead diferente, ritmo
 * diferente. Cada aba carrega só o seu.
 *
 * Sobrou um filtro secundário só (nível + WhatsApp), e ele vem rotulado.
 */

export type Foco = "site" | "chatbot";

const TEXTOS: Record<
  Foco,
  { titulo: string; subtitulo: string; vazio: string; cruzado: string }
> = {
  site: {
    titulo: "Vender site",
    subtitulo: "Empresas sem presença própria na internet.",
    vazio: "Nenhuma empresa sem site pendente. Busque mais abaixo.",
    cruzado: "Também dá chatbot",
  },
  chatbot: {
    titulo: "Vender chatbot",
    subtitulo: "Empresas com site de pé e movimento — o gargalo é responder.",
    vazio:
      "Nenhum lead de chatbot ainda. Eles aparecem quando a busca traz empresas que JÁ têm site e WhatsApp.",
    cruzado: "Também precisa de site",
  },
};

function semAcento(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Devolve o lead à lista na posição de score que ele tinha.
 *
 * Empurrar para o fim seria mais simples, mas ao desfazer um descarte o lead
 * apareceria longe de onde estava e você não acharia de novo — a lista é
 * ordenada por score, e o "Desfazer" só serve se ele voltar para o lugar.
 */
function reinserir(lista: Lead[], lead: Lead): Lead[] {
  return [...lista, lead].sort((a, b) => b.score - a.score);
}

export default function ListaOportunidades({ foco }: { foco: Foco }) {
  const copia = TEXTOS[foco];

  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [proposta, setProposta] = useState<Lead | null>(null);
  const [recemAchados, setRecemAchados] = useState<number | null>(null);

  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState<"todos" | "alta" | "boa">("todos");
  const [soWhatsapp, setSoWhatsapp] = useState(false);

  /** Último descarte, para o "Desfazer". Guarda o lead inteiro, não só o id. */
  const [descartado, setDescartado] = useState<Lead | null>(null);
  const [naFila, setNaFila] = useState<string | null>(null);
  /** Seleção em massa: prospecção em volume é trabalho de lote, não de clique. */
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const relogioDesfazer = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/list");
      const data = await res.json();
      const lista: Lead[] = data.leads ?? [];
      setLeads(
        lista
          .filter((l) => {
            if (!ehOportunidade(l) || l.etapa !== "novo") return false;
            // O pacote entra nas DUAS abas: tem as duas vendas dentro.
            const p = avaliar(l).produto;
            return p === "site-e-chatbot" || p === foco;
          })
          .sort((a, b) => b.score - a.score),
      );
    } finally {
      setCarregando(false);
    }
  }, [foco]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Tira o lead da fila de hoje.
   *
   * Marca `perdido`, não apaga: o lead continua no banco e aparece na coluna
   * "Perdido" do Pipeline, de onde dá para arrastar de volta. Descartar aqui é
   * dizer "não vou abordar", não "esse negócio deixou de existir" — e o custo
   * de errar tem que ser baixo, senão ninguém usa o botão.
   *
   * A lista some na hora e a requisição vai depois; se o servidor recusar, o
   * lead volta para o lugar.
   */
  async function descartar(lead: Lead) {
    setLeads((atual) => atual.filter((l) => l.id !== lead.id));
    setDescartado(lead);

    if (relogioDesfazer.current) window.clearTimeout(relogioDesfazer.current);
    relogioDesfazer.current = window.setTimeout(() => setDescartado(null), 7000);

    const res = await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lead.id], etapa: "perdido", visto: true, noCrm: true }),
    });

    if (!res.ok) {
      setLeads((atual) => reinserir(atual, lead));
      setDescartado(null);
    }
  }

  async function desfazer() {
    const lead = descartado;
    if (!lead) return;
    setDescartado(null);
    if (relogioDesfazer.current) window.clearTimeout(relogioDesfazer.current);

    setLeads((atual) => reinserir(atual, lead));
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lead.id], etapa: "novo", visto: false }),
    });
  }

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /**
   * Cria rascunhos na automação. NÃO envia nada — os textos entram como
   * rascunho para você revisar em /automacao antes de qualquer disparo.
   *
   * A API devolve os PULADOS com motivo (já contatado, sem WhatsApp, marcado
   * como não contatar). Mostrar isso importa: em lote, o silêncio sobre o que
   * não entrou é como você acha que mandou 40 e mandou 12.
   */
  async function paraAutomacao(ids: string[]) {
    if (ids.length === 0) return;
    const r = await fetch("/api/automacao/mensagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: ids }),
    }).then((x) => x.json());

    const pulados: { nome: string; motivo: string }[] = r.pulados ?? [];
    setNaFila(
      `${r.criadas} rascunho(s) criado(s).` +
        (pulados.length
          ? ` ${pulados.length} pulado(s): ${pulados.slice(0, 3).map((p) => `${p.nome} (${p.motivo})`).join("; ")}${pulados.length > 3 ? "…" : ""}`
          : ""),
    );
    setMarcados(new Set());
    setTimeout(() => setNaFila(null), 9000);
  }

  const termo = semAcento(texto.trim());
  const visiveis = leads.filter((l) => {
    if (nivel !== "todos" && avaliar(l).nivel !== nivel) return false;
    if (soWhatsapp && !l.whatsapp) return false;
    if (!termo) return true;
    // Busca na categoria TRADUZIDA: a tela mostra "Farmácia" e o banco guarda
    // "pharmacy" — digitar "farm" não achava nada.
    return semAcento(
      `${l.nome} ${categoriaSingular(l.categoria)} ${l.cidade ?? ""}`,
    ).includes(termo);
  });

  const filtrando = termo !== "" || nivel !== "todos" || soWhatsapp;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[24px] font-semibold sm:text-[28px]">{copia.titulo}</h1>
          <BotaoExportar ids={visiveis.map((l) => l.id)} />
        </div>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)] sm:text-[15px]">
          {carregando
            ? "Analisando sua base…"
            : leads.length === 0
              ? copia.subtitulo
              : `${copia.subtitulo} ${leads.length} para abordar.`}
        </p>
      </header>

      <BuscaRapida
        aoConcluir={async (achados) => {
          await carregar();
          setRecemAchados(achados);
          setTimeout(() => setRecemAchados(null), 5000);
        }}
      />

      {recemAchados !== null && (
        <p className="surgir mb-5 rounded-[10px] bg-[var(--azul-fraco)] px-4 py-2.5 text-[14px] text-[var(--azul)]">
          {recemAchados === 0
            ? "A busca não trouxe empresas com contato. Tente outro ramo ou cidade."
            : `${recemAchados} empresa${recemAchados > 1 ? "s" : ""} adicionada${recemAchados > 1 ? "s" : ""} à base. O que for de ${foco === "site" ? "chatbot" : "site"} aparece na outra aba.`}
        </p>
      )}

      {!carregando && leads.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Filtrar por nome, ramo ou cidade…"
            className="campo"
          />

          {/**
           * Rotulado, e numa linha só. Antes eram três dimensões de filtro
           * (nível, produto, WhatsApp) empilhadas como sete pílulas iguais —
           * sem saber o que era o quê, ninguém usava nenhuma.
           */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
              Prioridade
            </span>
            {(
              [
                ["todos", "Todas"],
                ["alta", "Alta"],
                ["boa", "Boa"],
              ] as ["todos" | "alta" | "boa", string][]
            ).map(([v, r]) => (
              <button
                key={v}
                onClick={() => setNivel(v)}
                className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
                  nivel === v
                    ? "bg-[var(--azul)] text-white"
                    : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                }`}
              >
                {r}
              </button>
            ))}

            <button
              onClick={() => setSoWhatsapp((v) => !v)}
              className={`ml-auto rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
                soWhatsapp
                  ? "bg-[var(--verde-fraco)] text-[var(--verde)]"
                  : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
              }`}
            >
              Só com WhatsApp
            </button>

            {filtrando && (
              <span className="w-full text-[13px] text-[var(--texto-3)] sm:w-auto">
                {visiveis.length} de {leads.length}
              </span>
            )}
          </div>
        </div>
      )}

      {/**
       * Barra de lote. Só aparece com algo marcado — em repouso ela seria mais
       * um elemento competindo com a lista.
       */}
      {marcados.size > 0 && (
        <div className="cartao surgir mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-[14px] font-medium">
            {marcados.size} selecionado{marcados.size > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => paraAutomacao([...marcados])}
            className="btn-primario"
          >
            Mandar para automação
          </button>
          <button onClick={() => setMarcados(new Set())} className="btn-secundario ml-auto">
            Limpar
          </button>
        </div>
      )}

      {!carregando && visiveis.length > 0 && (
        <button
          onClick={() =>
            setMarcados(
              marcados.size === visiveis.filter((l) => l.whatsapp).length
                ? new Set()
                : new Set(visiveis.filter((l) => l.whatsapp).map((l) => l.id)),
            )
          }
          className="mb-3 text-[13px] text-[var(--azul)] hover:underline"
        >
          {marcados.size > 0 ? "Desmarcar todos" : `Selecionar todos com WhatsApp (${visiveis.filter((l) => l.whatsapp).length})`}
        </button>
      )}

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="esqueleto h-28" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="cartao px-5 py-14 text-center">
          <p className="text-[15px]">{copia.vazio}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {visiveis.map((lead, i) => {
            const o = avaliar(lead);
            return (
              <li key={lead.id} className="cartao cartao-interativo p-4">
                {/**
                 * Empilha no celular. A versão anterior punha os botões numa
                 * coluna fixa à direita: em tela estreita o nome do lead
                 * espremia em duas letras por linha.
                 */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {lead.whatsapp ? (
                      <input
                        type="checkbox"
                        checked={marcados.has(lead.id)}
                        onChange={() => alternar(lead.id)}
                        aria-label={`Selecionar ${lead.nome}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--azul)]"
                      />
                    ) : (
                      <span className="mt-0.5 w-4 shrink-0 text-[14px] tabular-nums text-[var(--texto-3)]">
                        {i + 1}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/lead/${lead.id}`}
                        className="block text-[15px] font-semibold leading-snug hover:text-[var(--azul)]"
                      >
                        {lead.nome}
                      </Link>
                      <p className="mt-0.5 text-[13px] capitalize text-[var(--texto-3)]">
                        {categoriaSingular(lead.categoria)} · {lead.cidade}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`etiqueta etiqueta-${o.nivel}`}>{o.rotulo}</span>
                        {/* Só marca o pacote: nas outras linhas o produto é a aba. */}
                        {o.produto === "site-e-chatbot" && (
                          <span className="etiqueta etiqueta-produto-site-e-chatbot">
                            {copia.cruzado}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-[13px] text-[var(--texto-2)]">{o.resumo}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch md:flex-row md:items-center">
                    <button
                      onClick={() => setProposta(lead)}
                      className="btn-primario flex-1 sm:flex-none"
                    >
                      Enviar proposta
                    </button>
                    {lead.whatsapp && (
                      <button
                        onClick={() => paraAutomacao([lead.id])}
                        className="btn-secundario"
                        title="Cria rascunho na automação para você revisar"
                      >
                        Automação
                      </button>
                    )}
                    {lead.whatsapp && (
                      <a
                        href={lead.whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secundario"
                      >
                        WhatsApp
                      </a>
                    )}
                    {/**
                     * Descartar fica discreto e por último: é a ação que você
                     * usa quando a linha NÃO serve, então não pode disputar
                     * espaço com a que faz dinheiro.
                     */}
                    {/* Descartar tira da fila; excluir apaga de vez. Os dois
                        ficam juntos, mas só o X é de uso rotineiro. */}
                    <ExcluirLead
                      id={lead.id}
                      nome={lead.nome}
                      aoExcluir={() => setLeads((l) => l.filter((x) => x.id !== lead.id))}
                    />
                    <button
                      onClick={() => descartar(lead)}
                      title={`Descartar ${lead.nome} — sai da fila e vai para "Perdido"`}
                      aria-label={`Descartar ${lead.nome}`}
                      className="btn-descartar"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!carregando && leads.length > 0 && visiveis.length === 0 && (
        <div className="cartao px-5 py-14 text-center">
          <p className="text-[15px]">Nenhum lead com esse filtro.</p>
          <button
            onClick={() => {
              setTexto("");
              setNivel("todos");
              setSoWhatsapp(false);
            }}
            className="btn-secundario mt-3"
          >
            Limpar filtro
          </button>
        </div>
      )}

      {/**
       * Barra de desfazer. Sem ela, descartar exigiria confirmação em toda
       * linha — e confirmar dezenas de vezes por dia é justamente o tipo de
       * atrito que faz a ferramenta ser abandonada. Erro barato > pergunta cara.
       */}
      {naFila && (
        <p className="surgir mb-5 rounded-[10px] bg-[var(--azul-fraco)] px-4 py-2.5 text-[14px] text-[var(--azul)]">
          {naFila}
        </p>
      )}

      {descartado && (
        <div
          role="status"
          className="cartao fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-md items-center gap-3 px-4 py-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
        >
          <p className="min-w-0 flex-1 truncate text-[14px]">
            <span className="text-[var(--texto-2)]">Descartado: </span>
            {descartado.nome}
          </p>
          <button
            onClick={desfazer}
            className="shrink-0 text-[14px] font-medium text-[var(--azul)] hover:underline"
          >
            Desfazer
          </button>
        </div>
      )}

      {proposta && (
        <ModalProposta
          lead={proposta}
          aoFechar={() => setProposta(null)}
          aoEnviar={() => {
            setLeads((l) => l.filter((x) => x.id !== proposta.id));
            setProposta(null);
          }}
        />
      )}
    </main>
  );
}
