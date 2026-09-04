"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ETAPAS, type Lead, type Etapa } from "@/lib/db/schema";
import { CartaoFunil, Coluna } from "@/components/pipeline-coluna";
import ModalProposta from "@/components/modal-proposta";
import BotaoExportar from "@/components/botao-exportar";

/**
 * Kanban rola na horizontal no celular, não empilha.
 *
 * Empilhado, as seis etapas viravam uma lista vertical de 3 metros e a ideia
 * do funil — ver as colunas lado a lado — desaparecia. Com `snap` a coluna
 * para alinhada ao arrastar o dedo, que é como todo quadro de tarefas se
 * comporta no aparelho. A partir de `xl` cabem as seis e o scroll some.
 *
 * (O arraste entre colunas continua sendo do mouse: HTML5 drag-and-drop não
 * funciona por toque. No celular a troca de etapa se faz por "Meus leads".)
 */
const FAIXA =
  "flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-3 xl:overflow-visible";
const COLUNA = "w-[80vw] max-w-[300px] shrink-0 snap-start sm:w-[280px] xl:w-auto xl:flex-1";

/**
 * Pipeline: as seis etapas lado a lado, arrastando card entre colunas.
 *
 * "Meus leads" continua sendo a lista rápida para trabalhar um por um. Esta
 * tela é a visão do funil inteiro — serve para ver onde o trabalho empacou,
 * não para substituir a lista.
 *
 * Carrega TODOS os leads, não só os marcados `noCrm`. O funil que esconde
 * metade da base não mostra o funil.
 */
export default function Pipeline() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<Lead | null>(null);
  const [termo, setTermo] = useState("");

  /**
   * Instante de referencia para "dias parado", definido APOS a montagem.
   *
   * Nao pode sair de `Date.now()` no render do card: chamada impura diverge
   * entre servidor e cliente na hidratacao. Ate o efeito rodar, o card apenas
   * omite o tempo parado.
   */
  const [agora, setAgora] = useState<number | undefined>(undefined);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<Etapa | null>(null);

  // Guarda a última etapa conhecida para desfazer sem depender do estado novo.
  const anteriorRef = useRef<Map<string, Etapa>>(new Map());

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/list");
      const data = await res.json();
      setLeads(data.leads ?? []);
      // Aqui, e nao no render: dentro do callback nao ha divergencia de hidratacao.
      setAgora(Date.now());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Move otimista: a coluna muda na hora, a requisição vai depois. Se o
   * servidor recusar, volta pro lugar — arrastar tem que parecer instantâneo.
   */
  async function mover(id: string, etapa: Etapa) {
    const anterior = leads.find((l) => l.id === id)?.etapa;
    if (!anterior || anterior === etapa) return;
    anteriorRef.current.set(id, anterior);

    setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, etapa } : l)));

    const res = await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], etapa, noCrm: true }),
    });

    if (!res.ok) {
      const volta = anteriorRef.current.get(id);
      if (volta) {
        setLeads((atual) =>
          atual.map((l) => (l.id === id ? { ...l, etapa: volta } : l)),
        );
      }
    }
  }

  const busca = termo.trim().toLowerCase();
  const visiveis = busca
    ? leads.filter(
        (l) =>
          l.nome.toLowerCase().includes(busca) ||
          (l.cidade ?? "").toLowerCase().includes(busca) ||
          (l.categoria ?? "").toLowerCase().includes(busca),
      )
    : leads;

  return (
    <main className="px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold sm:text-[28px]">Pipeline</h1>
          <p className="mt-1 text-[14px] text-[var(--texto-2)]">
            {carregando
              ? "Montando o funil…"
              : `${visiveis.length} lead${visiveis.length === 1 ? "" : "s"} no funil. Arraste entre as colunas.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Filtrar por nome, cidade ou ramo"
            className="campo min-w-0 flex-1 sm:max-w-[260px]"
          />
          <BotaoExportar ids={visiveis.map((l) => l.id)} />
        </div>
      </header>

      {carregando ? (
        <div className={FAIXA}>
          {ETAPAS.map((e) => (
            <div key={e.valor} className={`esqueleto h-64 rounded-[18px] ${COLUNA}`} />
          ))}
        </div>
      ) : (
        <div className={FAIXA}>
          {ETAPAS.map((etapa) => {
            const daColuna = visiveis.filter((l) => l.etapa === etapa.valor);
            return (
              <Coluna
                key={etapa.valor}
                etapa={etapa.valor}
                rotulo={etapa.rotulo}
                leads={daColuna}
                alvo={colunaAlvo === etapa.valor}
                className={COLUNA}
                aoEntrar={setColunaAlvo}
                aoSair={() => setColunaAlvo(null)}
                aoSoltar={(destino) => {
                  setColunaAlvo(null);
                  if (arrastando) void mover(arrastando, destino);
                  setArrastando(null);
                }}
              >
                {daColuna.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-[var(--texto-3)]">
                    Vazio
                  </p>
                ) : (
                  daColuna.map((lead) => (
                    <CartaoFunil
                      key={lead.id}
                      lead={lead}
                      agora={agora}
                      arrastando={arrastando === lead.id}
                      aoIniciarArraste={() => setArrastando(lead.id)}
                      aoTerminarArraste={() => {
                        setArrastando(null);
                        setColunaAlvo(null);
                      }}
                      aoAbrir={() => setAberto(lead)}
                      aoExcluir={() =>
                        setLeads((atual) => atual.filter((x) => x.id !== lead.id))
                      }
                    />
                  ))
                )}
              </Coluna>
            );
          })}
        </div>
      )}

      {aberto && (
        <ModalProposta
          lead={aberto}
          aoFechar={() => setAberto(null)}
          aoEnviar={() => {
            setLeads((l) =>
              l.map((x) => (x.id === aberto.id ? { ...x, etapa: "mensagem-enviada" } : x)),
            );
            setAberto(null);
          }}
        />
      )}
    </main>
  );
}
