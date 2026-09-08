"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * 🎯 MODO CAÇA — a tela operacional de prospecção.
 *
 * Junta as três filas comerciais num lugar só, porque na prática são o mesmo
 * trabalho visto por canais diferentes:
 *
 *   🔥 AMBOS      WhatsApp + Instagram. Olhar primeiro.
 *   📱 WHATSAPP   prontos para entrar em campanha automática.
 *   📸 INSTAGRAM  abordagem manual, com ou sem WhatsApp.
 *
 * Reaproveita `/api/disparo/oportunidades` — o MESMO motor do painel e da
 * campanha. Nenhuma regra de seleção mora aqui: uma segunda régua na tela
 * divergiria da fila no primeiro ajuste, que é justamente o defeito que esta
 * reestruturação veio corrigir.
 *
 * Nada nesta tela envia mensagem. O botão de campanha cria RASCUNHOS pela rota
 * que /disparos já usa; o envio continua sendo decisão separada, com aprovação.
 */

type Fila = "ambos" | "whatsapp" | "instagram";

type LeadCaca = {
  id: string;
  nome: string;
  segmento: string;
  cidade: string | null;
  canal: "ambos" | "whatsapp" | "instagram" | "sem-canal";
  canalRotulo: string;
  instagramUsername: string | null;
  instagramUrl: string | null;
  instagramStatus: string | null;
  sistema: string | null;
  dor: string | null;
  porteEstimadoRotulo: string;
  scoreComercial: number;
  scoreContatabilidade: number;
  scoreFinal: number;
  porQue: { criterio: string; pontos: number }[];
  prontoParaProspeccao: boolean;
  alcance: "local" | "regional" | "fora";
  alcanceRotulo: string;
  temSite: boolean;
  semSiteConfirmado: boolean;
};

type Resposta = {
  leads: LeadCaca[];
  canais: {
    acionaveis: number;
    whatsapp: number;
    instagram: number;
    ambos: number;
    semCanal: number;
    total: number;
    pequenosLocais: number;
    comSistemaAplicavel: number;
    naPraca: number;
    naRegiao: number;
    foraDaPraca: number;
    praca: string;
    descartes: { motivo: string; rotulo: string; quantidade: number }[];
  };
};

const ABAS: { id: Fila; rotulo: string; ajuda: string }[] = [
  { id: "ambos", rotulo: "🔥 Melhores", ajuda: "WhatsApp + Instagram — olhe primeiro" },
  { id: "whatsapp", rotulo: "📱 WhatsApp", ajuda: "podem entrar em campanha automática" },
  { id: "instagram", rotulo: "📸 Instagram", ajuda: "abordagem manual, uma a uma" },
];

const STATUS_IG = [
  { valor: "abordado", rotulo: "ABORDADO" },
  { valor: "respondeu", rotulo: "RESPONDEU" },
  { valor: "sem-interesse", rotulo: "SEM INTERESSE" },
  { valor: "cliente", rotulo: "CLIENTE" },
];

export default function CacadaPage() {
  const [fila, setFila] = useState<Fila>("ambos");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  // ---- filtros do modo caça ----
  const [soPequenos, setSoPequenos] = useState(true);
  const [soComSistema, setSoComSistema] = useState(true);
  const [soNaoContatados, setSoNaoContatados] = useState(false);
  /**
   * LIGADO por padrão: a operação é local. Medido — sem este filtro, 19 dos 20
   * primeiros da lista eram de outra cidade, porque os leads antigos espalhados
   * pelo Brasil têm telefone e os novos de Uberlândia quase não têm.
   */
  const [soNaPraca, setSoNaPraca] = useState(true);
  const [segmento, setSegmento] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ fila, quantidade: "200" });
      /**
       * `somenteWhatsapp=0` sempre: quem decide o canal aqui é a aba, não este
       * filtro antigo — deixá-lo ligado esconderia a fila do Instagram inteira.
       */
      q.set("somenteWhatsapp", "0");
      q.set("incluirContatados", "1");
      if (soPequenos) q.set("somentePequenos", "1");
      if (soComSistema) q.set("comPotencialSistema", "1");
      if (soNaoContatados) q.set("naoContatado", "1");
      if (soNaPraca) q.set("somenteNaPraca", "1");
      if (segmento) q.set("segmento", segmento);

      setDados(await fetch(`/api/disparo/oportunidades?${q}`).then((r) => r.json()));
    } finally {
      setCarregando(false);
    }
  }, [fila, soPequenos, soComSistema, soNaoContatados, soNaPraca, segmento]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const marcarInstagram = useCallback(async (id: string, status: string) => {
    setDados((d) =>
      d
        ? {
            ...d,
            leads: d.leads.map((l) => (l.id === id ? { ...l, instagramStatus: status } : l)),
          }
        : d,
    );
    await fetch("/api/instagram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, status }),
    });
  }, []);

  /**
   * Cria a campanha pela MESMA rota que /disparos usa. Só entram leads da aba
   * de WhatsApp que passam em `prontoParaProspeccao` — a tela não inventa
   * elegibilidade, ela filtra pelo que o motor já respondeu.
   */
  const prontos = useMemo(
    () => (dados?.leads ?? []).filter((l) => l.prontoParaProspeccao),
    [dados],
  );

  const criarCampanha = useCallback(async () => {
    if (!prontos.length) return;
    setCriando(true);
    setAviso(null);
    try {
      const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      const r = await fetch("/api/campanhas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: `Caça — ${data}`,
          leadIds: prontos.slice(0, 300).map((l) => l.id),
          filtro: { origem: "modo-caca", fila },
        }),
      }).then((x) => x.json());

      setAviso(
        r.campanha?.id
          ? `Campanha criada com ${prontos.length} leads. Nada foi enviado — revise e aprove em /disparos.`
          : (r.erro ?? "Não foi possível criar a campanha."),
      );
    } finally {
      setCriando(false);
    }
  }, [prontos, fila]);

  const c = dados?.canais;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">🎯 Modo caça</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
            As empresas que dá para abordar hoje, por canal. Nenhuma mensagem sai daqui.
          </p>
        </div>
        <Link href="/disparos" className="text-[13px] text-[var(--azul)] underline">
          ir para /disparos
        </Link>
      </div>

      {c && (
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            /**
             * "Na praça" vem primeiro e em destaque: é o número que a operação
             * local realmente usa. Acionável a 600 km é informação, não alvo.
             */
            { r: `📍 Em ${c.praca.split("/")[0]}`, v: c.naPraca, destaque: true },
            { r: "🔥 Ambos os canais", v: c.ambos },
            { r: "📱 WhatsApp", v: c.whatsapp },
            { r: "✅ Acionáveis (total)", v: c.acionaveis },
          ].map((i) => (
            <div
              key={i.r}
              className={`rounded-[10px] px-2.5 py-2.5 text-center ${
                i.destaque ? "bg-[var(--azul-fraco)]" : "bg-[var(--superficie)]"
              }`}
            >
              <p
                className={`text-[19px] font-semibold tabular-nums ${
                  i.destaque ? "text-[var(--azul)]" : ""
                }`}
              >
                {i.v}
              </p>
              <p className="text-[11px] leading-tight text-[var(--texto-3)]">{i.r}</p>
            </div>
          ))}
        </section>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setFila(a.id)}
            title={a.ajuda}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
              fila === a.id
                ? "bg-[var(--azul)] text-white"
                : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soPequenos} onChange={(e) => setSoPequenos(e.target.checked)} />
          🏪 pequenos/locais
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={soComSistema}
            onChange={(e) => setSoComSistema(e.target.checked)}
          />
          🛠 com sistema aplicável
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={soNaoContatados}
            onChange={(e) => setSoNaoContatados(e.target.checked)}
          />
          🚫 nunca contatados
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soNaPraca} onChange={(e) => setSoNaPraca(e.target.checked)} />
          📍 só {dados?.canais.praca ?? "a praça"}
        </label>
        <input
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          placeholder="nicho (ex.: oficina mecânica)"
          className="w-56 rounded-[10px] bg-[var(--superficie)] px-3 py-1.5 text-[12.5px]"
        />
      </div>

      {/**
       * Redes, franquias e leads sem canal já saem no motor. A linha abaixo diz
       * quantos foram excluídos e por quê — para a lista curta não parecer erro.
       */}
      {c && c.descartes.length > 0 && (
        <p className="mb-4 text-[11.5px] text-[var(--texto-3)]">
          excluídos da operação: {c.descartes.map((d) => `${d.quantidade} ${d.rotulo.toLowerCase()}`).join(" · ")}
        </p>
      )}

      {fila === "whatsapp" && (
        <div className="mb-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
          <p className="text-[13px]">
            <strong className="tabular-nums">{prontos.length}</strong> prontos para disparo agora
            {dados && dados.leads.length > prontos.length && (
              <span className="text-[var(--texto-3)]">
                {" "}
                · {dados.leads.length - prontos.length} têm WhatsApp mas estão bloqueados (contato
                recente, mensagem viva ou já adiante no funil)
              </span>
            )}
          </p>
          <button
            onClick={criarCampanha}
            disabled={criando || prontos.length === 0}
            className="btn-primario mt-2.5"
          >
            {criando ? "Criando…" : `ADICIONAR ${prontos.length} À CAMPANHA`}
          </button>
          {aviso && <p className="mt-2 text-[12.5px] text-[var(--azul)]">{aviso}</p>}
        </div>
      )}

      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && (dados?.leads.length ?? 0) === 0 && (
        <p className="rounded-[10px] bg-[var(--superficie)] px-4 py-3 text-[13px] text-[var(--texto-3)]">
          Nenhuma empresa nesta fila com os filtros atuais.
        </p>
      )}

      <ul className="space-y-2.5">
        {(dados?.leads ?? []).map((l) => (
          <li key={l.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-medium">
                {l.canal === "ambos" ? "🔥 " : l.canal === "whatsapp" ? "📱 " : "📸 "}
                {l.nome}
              </p>
              <span className="text-[12px] tabular-nums text-[var(--texto-3)]">
                comercial {l.scoreComercial} · contato {l.scoreContatabilidade} · final{" "}
                <strong className="text-[var(--texto-2)]">{l.scoreFinal}</strong>
              </span>
            </div>

            <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
              {l.segmento}
              {l.cidade ? ` · ${l.cidade}` : ""} · {l.alcanceRotulo} · 🏪 {l.porteEstimadoRotulo} ·{" "}
              {l.semSiteConfirmado ? "🌐 sem site" : l.temSite ? "🌐 tem site" : "🌐 site não conferido"}
              {l.prontoParaProspeccao && (
                <span className="text-[var(--azul)]"> · ✅ pronto para disparo</span>
              )}
            </p>

            {l.sistema && <p className="mt-1.5 text-[13px] text-[var(--texto-2)]">🛠 {l.sistema}</p>}
            {l.dor && <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">💡 {l.dor}</p>}
            {l.porQue.length > 0 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--texto-3)]">
                {l.porQue.map((x) => `${x.pontos > 0 ? "+" : ""}${x.pontos} ${x.criterio}`).join(" · ")}
              </p>
            )}

            {/* Ações de Instagram só onde fazem sentido — e nunca disparam nada. */}
            {(l.canal === "instagram" || l.canal === "ambos") && l.instagramUrl && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={l.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secundario"
                >
                  ABRIR @{l.instagramUsername}
                </a>
                {STATUS_IG.map((s) => (
                  <button
                    key={s.valor}
                    onClick={() =>
                      void marcarInstagram(
                        l.id,
                        l.instagramStatus === s.valor ? "nao-abordado" : s.valor,
                      )
                    }
                    className={`rounded-[10px] px-3 py-1.5 text-[12px] transition ${
                      l.instagramStatus === s.valor
                        ? "bg-[var(--azul-fraco)] font-medium text-[var(--azul)]"
                        : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                    }`}
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
