"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Indicadores, Abas, Etiqueta, Barra, FatoEInferencia, Vazio } from "@/components/central";

/**
 * 🎯 CENTRAL DE PROSPECÇÃO — o cockpit.
 *
 * A pergunta que esta tela responde, sem exigir navegação nenhuma:
 *
 *   quem eu abordo agora · por qual canal · o que eu vendo para ela ·
 *   por que ela · o que eu falo · e o que faço se responder
 *
 * O QUE ELA NÃO FAZ
 *
 * Não lidera com o tamanho da base. "1.293 leads" é verdade e não serve para
 * nada: diz quantas linhas existem no banco, não com quantas empresas dá para
 * falar. E não tem régua própria — quem decide quem é oportunidade é
 * `avaliarOportunidadeComercial`, a mesma função que a campanha consulta.
 *
 * DUAS APIS, NENHUMA NOVA
 *
 * `/api/disparo/oportunidades` traz o funil de aquisição e os leads;
 * `/api/comercial/resumo` traz o funil de VENDA (abordados → responderam →
 * proposta) e os follow-ups. São perguntas diferentes sobre o mesmo negócio,
 * e a Central é o único lugar onde as duas aparecem juntas.
 *
 * Nada aqui envia mensagem. O botão de campanha cria RASCUNHOS.
 */

type Aba = "melhores" | "whatsapp" | "instagram" | "enriquecer";

type Motivo = { texto: string; pontos: number; tipo: "fato" | "inferencia" };

type LeadCentral = {
  id: string;
  nome: string;
  segmento: string;
  cidade: string | null;
  canal: "ambos" | "whatsapp" | "instagram" | "site" | "sem-canal";
  canalRotulo: string;
  instagramUsername: string | null;
  instagramUrl: string | null;
  instagramStatus: string | null;
  website: string | null;
  whatsappUrl: string | null;
  telefoneFormatado: string | null;
  sistema: string | null;
  modulos: string[];
  porteEstimadoRotulo: string;
  scoreComercial: number;
  scoreContatabilidade: number;
  alcanceRotulo: string;
  decisao: "quero-vender" | "vale-abordar" | "nao-prioritario";
  decisaoRotulo: string;
  probabilidade: number;
  positivos: Motivo[];
  negativos: Motivo[];
  dor2:
    | { tipo: "confirmada"; texto: string }
    | { tipo: "provavel"; texto: string; sinais: string[] }
    | { tipo: "nenhuma" };
  temSite: boolean;
  contatoRotulo: string;
  telefoneOrigem: string | null;
  enriquecimentoPrioridade: "alta" | "media" | "baixa" | null;
  enriquecimentoMotivo: string;
  oportunidade: {
    elegivel: boolean;
    bloqueios: string[];
    temPotencialDeSolucao: boolean;
    aguardandoCanal: boolean;
    reabreSozinha: boolean;
  };
};

type Funil = {
  total: number;
  comPotencialDeSolucao: number;
  oportunidadesReais: number;
  prontasParaWhatsapp: number;
  prontasParaInstagram: number;
  melhores: number;
  aguardandoCanal: number;
  reabremSozinhas: number;
  bloqueios: { motivo: string; quantidade: number }[];
};

type Resposta = {
  leads: LeadCentral[];
  funil: Funil;
  canais: { praca: string };
  segmentos: { nome: string; total: number }[];
};

/** O funil de VENDA, de /api/comercial/resumo. Outro assunto, outra API. */
type Comercial = {
  indicadores: {
    abordados: number;
    responderam: number;
    interessados: number;
    propostas: number;
    ganhos: number;
  };
  funil: { etapa: string; quantos: number; taxa: number | null }[];
  followUps: { id: string; leadId: string; lead: string; motivo?: string | null }[];
};

const ABAS: { id: Aba; rotulo: string; ajuda: string; conta: (f: Funil) => number }[] = [
  { id: "melhores", rotulo: "🔥 Melhores", ajuda: "os dois canais e vale vender", conta: (f) => f.melhores },
  { id: "whatsapp", rotulo: "📱 WhatsApp", ajuda: "podem entrar em campanha hoje", conta: (f) => f.prontasParaWhatsapp },
  { id: "instagram", rotulo: "📸 Instagram", ajuda: "abordagem manual, uma a uma", conta: (f) => f.prontasParaInstagram },
  { id: "enriquecer", rotulo: "🌐 Enriquecer", ajuda: "boas empresas sem canal", conta: (f) => f.aguardandoCanal },
];

const STATUS_IG = [
  { valor: "abordado", rotulo: "ABORDADO" },
  { valor: "respondeu", rotulo: "RESPONDEU" },
  { valor: "sem-interesse", rotulo: "SEM INTERESSE" },
  { valor: "cliente", rotulo: "CLIENTE" },
];

const PRIORIDADE_ENRIQ: Record<string, string> = {
  alta: "🔥 alta",
  media: "🟡 média",
  baixa: "⚪ baixa",
};

export default function CentralPage() {
  const [aba, setAba] = useState<Aba>("melhores");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [com, setCom] = useState<Comercial | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // ---- filtros do radar ----
  const [soPequenos, setSoPequenos] = useState(true);
  const [soComSistema, setSoComSistema] = useState(true);
  const [soNaoContatados, setSoNaoContatados] = useState(false);
  const [soNaPraca, setSoNaPraca] = useState(true);
  const [segmento, setSegmento] = useState("");
  const [mostrarDescartados, setMostrarDescartados] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ aba, quantidade: "200" });
      q.set("somenteWhatsapp", "0");
      q.set("incluirContatados", "1");
      if (!mostrarDescartados) q.set("esconderDescartados", "1");
      if (soPequenos) q.set("somentePequenos", "1");
      if (soComSistema) q.set("comPotencialSistema", "1");
      if (soNaoContatados) q.set("naoContatado", "1");
      if (soNaPraca) q.set("somenteNaPraca", "1");
      if (segmento) q.set("segmento", segmento);

      setDados(await fetch(`/api/disparo/oportunidades?${q}`).then((r) => r.json()));
    } finally {
      setCarregando(false);
    }
  }, [aba, soPequenos, soComSistema, soNaoContatados, soNaPraca, segmento, mostrarDescartados]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  /** O funil de venda muda devagar — busca uma vez, não a cada filtro. */
  useEffect(() => {
    void (async () => {
      try {
        setCom(await fetch("/api/comercial/resumo").then((r) => r.json()));
      } catch {
        /* a Central funciona sem ele; os cartões de venda ficam em zero. */
      }
    })();
  }, []);

  const trocarAba = useCallback((nova: Aba) => {
    setAba(nova);
    setConfirmando(false);
    setAviso(null);
  }, []);

  const marcarInstagram = useCallback(async (id: string, status: string) => {
    setDados((d) =>
      d ? { ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, instagramStatus: status } : l)) } : d,
    );
    await fetch("/api/instagram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, status }),
    });
  }, []);

  const prontos = useMemo(
    () =>
      (dados?.leads ?? []).filter(
        (l) => l.oportunidade.elegivel && (l.canal === "whatsapp" || l.canal === "ambos"),
      ),
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
          nome: `Central — ${data}`,
          leadIds: prontos.slice(0, 300).map((l) => l.id),
          filtro: { origem: "central", aba },
        }),
      }).then((x) => x.json());

      setConfirmando(false);
      setAviso(
        r.campanha?.id
          ? `Rascunhos criados para ${prontos.length} empresa(s). Nada foi enviado — revise e aprove em /disparos.`
          : (r.erro ?? "Não foi possível criar a campanha."),
      );
    } finally {
      setCriando(false);
    }
  }, [prontos, aba]);

  const f = dados?.funil;
  const praca = dados?.canais.praca?.split("/")[0] ?? "a praça";
  const lista = dados?.leads ?? [];
  /** O melhor movimento do momento: o primeiro da lista já vem ordenado. */
  const destaque = lista.find((l) => l.oportunidade.elegivel) ?? lista[0] ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">Central de prospecção</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Encontre oportunidades, escolha a melhor abordagem e transforme leads em conversas.
        </p>
      </header>

      {/**
       * OS SETE NÚMEROS. Os quatro primeiros são aquisição (quem dá para
       * abordar); os três últimos são venda (o que já está em movimento). Os
       * dois funis são perguntas diferentes e vêm de APIs diferentes — juntá-los
       * numa fileira só é o que faz esta tela ser um cockpit e não um relatório.
       */}
      {f && (
        <div className="mb-5">
          <Indicadores
            itens={[
              { rotulo: "🔥 Oportunidades quentes", valor: f.melhores, destaque: true, ajuda: "os dois canais e classificação 'quero vender'", onClick: () => trocarAba("melhores") },
              { rotulo: "📱 WhatsApp prontos", valor: f.prontasParaWhatsapp, ajuda: "passam em todas as travas de campanha", onClick: () => trocarAba("whatsapp") },
              { rotulo: "📸 Instagram", valor: f.prontasParaInstagram, ajuda: "abordagem manual", onClick: () => trocarAba("instagram") },
              { rotulo: "🌐 Precisam enriquecer", valor: f.aguardandoCanal, ajuda: "boa empresa, canal ainda não encontrado", onClick: () => trocarAba("enriquecer") },
              { rotulo: "🔁 Follow-ups", valor: com?.followUps.length ?? 0, ajuda: "vencidos ou para hoje" },
              { rotulo: "💬 Responderam", valor: com?.indicadores.responderam ?? 0, ajuda: "conversa aberta, esperando você" },
              { rotulo: "🎯 Propostas", valor: com?.indicadores.propostas ?? 0, ajuda: "aguardando retorno" },
            ]}
          />
        </div>
      )}

      {/**
       * §38 — a tela não maquia o problema. Se a base é grande e a fatia
       * abordável é pequena, ela diz isso com todas as letras, e diz o que
       * fazer a respeito.
       */}
      {f && (
        <p className="mb-5 rounded-[10px] bg-[var(--superficie)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--texto-2)]">
          Você tem <strong className="tabular-nums">{f.total}</strong> empresas cadastradas, e{" "}
          <strong className="tabular-nums text-[var(--acao)]">{f.oportunidadesReais}</strong> com
          canal utilizável neste momento.{" "}
          {f.aguardandoCanal > 0 && (
            <>
              Outras <strong className="tabular-nums">{f.aguardandoCanal}</strong> são boas empresas
              esperando um canal aparecer —{" "}
              <button onClick={() => trocarAba("enriquecer")} className="text-[var(--acao)] underline">
                enriquecer
              </button>
              .
            </>
          )}
          {f.reabremSozinhas > 0 && (
            <> ⏳ {f.reabremSozinhas} voltam quando a janela de recontato fechar.</>
          )}
        </p>
      )}

      {/* ─────────────── seu próximo melhor movimento ─────────────── */}
      {destaque && (
        <section className="cartao mb-6 p-5">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Seu próximo melhor movimento
          </p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[19px] font-semibold">{destaque.nome}</h2>
            <span className="text-[13px] tabular-nums text-[var(--texto-3)]">
              prioridade <strong className="text-[var(--acao)]">{destaque.probabilidade}/100</strong>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Etiqueta>📍 {destaque.cidade ?? "cidade não informada"}</Etiqueta>
            <Etiqueta>🏪 {destaque.segmento}</Etiqueta>
            <Etiqueta tom={destaque.oportunidade.elegivel ? "acao" : "neutro"}>
              {destaque.canalRotulo}
            </Etiqueta>
            <Etiqueta tom={destaque.decisao === "quero-vender" ? "bom" : "neutro"}>
              {destaque.decisaoRotulo}
            </Etiqueta>
          </div>

          {destaque.sistema && (
            <div className="mt-3.5">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                💰 O que eu vendo
              </p>
              <p className="mt-1 text-[14px]">{destaque.sistema}</p>
              {destaque.modulos.length > 0 && (
                <p className="mt-0.5 text-[12px] text-[var(--texto-3)]">
                  {destaque.modulos.join(" · ")}
                </p>
              )}
            </div>
          )}

          {destaque.dor2.tipo !== "nenhuma" && (
            <div className="mt-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                💡 {destaque.dor2.tipo === "confirmada" ? "Dor confirmada" : "Dor provável"}
              </p>
              <p
                className={`mt-1 text-[13px] ${
                  destaque.dor2.tipo === "confirmada" ? "text-[var(--verde)]" : "text-[var(--texto-2)]"
                }`}
              >
                {destaque.dor2.texto}
              </p>
            </div>
          )}

          <div className="mt-3.5">
            <FatoEInferencia
              fatos={destaque.positivos.filter((m) => m.tipo === "fato").map((m) => m.texto)}
              inferencias={destaque.positivos.filter((m) => m.tipo === "inferencia").map((m) => m.texto)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/lead/${destaque.id}`} className="btn-primario">
              ABRIR LEAD
            </Link>
            {destaque.whatsappUrl && (
              <a href={destaque.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                ABRIR WHATSAPP
              </a>
            )}
            {destaque.instagramUrl && (
              <a href={destaque.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                VER INSTAGRAM
              </a>
            )}
            {destaque.website && (
              <a href={destaque.website} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                VER SITE
              </a>
            )}
            <Link href="/materiais" className="btn-secundario">
              COMO ABORDAR
            </Link>
          </div>
        </section>
      )}

      {/* ─────────────────────── radar ─────────────────────── */}
      <div className="mb-3">
        <Abas
          abas={ABAS.map((a) => ({ id: a.id, rotulo: a.rotulo, ajuda: a.ajuda, contagem: f ? a.conta(f) : undefined }))}
          atual={aba}
          aoTrocar={trocarAba}
        />
      </div>
      <p className="mb-3 text-[12px] text-[var(--texto-3)]">
        {ABAS.find((a) => a.id === aba)?.ajuda}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soPequenos} onChange={(e) => setSoPequenos(e.target.checked)} />
          🏪 pequenos/locais
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soComSistema} onChange={(e) => setSoComSistema(e.target.checked)} />
          🛠 com sistema aplicável
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soNaoContatados} onChange={(e) => setSoNaoContatados(e.target.checked)} />
          🚫 nunca contatados
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soNaPraca} onChange={(e) => setSoNaPraca(e.target.checked)} />
          📍 só {praca}
        </label>
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="campo w-56 py-1.5 text-[12.5px]"
        >
          <option value="">todos os nichos</option>
          {(dados?.segmentos ?? [])
            .slice(0, 40)
            .map((s) => (
              <option key={s.nome} value={s.nome}>
                {s.nome} ({s.total})
              </option>
            ))}
        </select>
      </div>

      <details className="mb-4">
        <summary className="cursor-pointer text-[11.5px] text-[var(--texto-3)]">filtros avançados</summary>
        <div className="mt-2 space-y-1.5 pl-1">
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <input
              type="checkbox"
              checked={mostrarDescartados}
              onChange={(e) => setMostrarDescartados(e.target.checked)}
            />
            mostrar também os descartados (rede, sem encaixe, já encerrados)
          </label>
          {f && f.bloqueios.length > 0 && (
            <p className="text-[11.5px] leading-relaxed text-[var(--texto-3)]">
              fora da operação:{" "}
              {f.bloqueios.slice(0, 6).map((b) => `${b.quantidade} ${b.motivo.toLowerCase()}`).join(" · ")}
            </p>
          )}
        </div>
      </details>

      {/* ───────────────── preparar campanha ───────────────── */}
      {aba === "whatsapp" && (
        <div className="mb-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
          <p className="text-[13px]">
            <strong className="tabular-nums">{prontos.length}</strong> empresa
            {prontos.length === 1 ? "" : "s"} pronta{prontos.length === 1 ? "" : "s"} para campanha agora
          </p>
          {!confirmando && (
            <button onClick={() => setConfirmando(true)} disabled={prontos.length === 0} className="btn-primario mt-2.5">
              PREPARAR CAMPANHA
            </button>
          )}
          {confirmando && (
            <div className="mt-3 rounded-[10px] bg-[var(--superficie-2)] px-3.5 py-3">
              <p className="text-[13px] font-medium">
                Criar rascunhos para {prontos.length} empresa{prontos.length === 1 ? "" : "s"}?
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-[var(--texto-2)]">
                <li>✓ Só entram empresas com WhatsApp plausível e sistema aplicável</li>
                <li>✓ Rede, franquia e ramo de grande porte já foram excluídos</li>
                <li>✓ Quem pediu para não ser contatado nunca entra</li>
                <li>✓ Contato recente, mensagem viva e duplicata também barram</li>
                <li>✓ Cada trava é revalidada no servidor, mensagem por mensagem</li>
                <li className="text-[var(--texto-3)]">
                  → Isto cria RASCUNHOS. Nada é enviado até você aprovar em /disparos.
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={criarCampanha} disabled={criando} className="btn-primario">
                  {criando ? "Criando…" : `CRIAR ${prontos.length} RASCUNHO(S)`}
                </button>
                <button onClick={() => setConfirmando(false)} className="btn-secundario">
                  CANCELAR
                </button>
              </div>
            </div>
          )}
          {aviso && <p className="mt-2 text-[12.5px] text-[var(--acao)]">{aviso}</p>}
        </div>
      )}

      {aba === "enriquecer" && f && (
        <div className="mb-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
          <p className="text-[13px]">
            <strong className="tabular-nums">{f.aguardandoCanal}</strong> boas empresas sem canal de contato
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--texto-3)]">
            Elas têm ramo, porte e encaixe de sistema — falta o contato. As fontes gratuitas (mapa
            aberto e site próprio) encontram poucas: a maioria destes cadastros não publica contato
            em lugar nenhum. Esta é uma fila de trabalho priorizada, não uma promessa.
          </p>
        </div>
      )}

      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && lista.length === 0 && (
        <Vazio
          titulo="Nenhuma empresa nesta aba com os filtros atuais."
          detalhe={
            aba === "melhores"
              ? "O corte de 🔥 é estreito de propósito: exige os dois canais e classificação 'quero vender'. Tente 📱 WhatsApp ou 📸 Instagram."
              : "Afrouxe um filtro, ou use a aba 🌐 Enriquecer para trabalhar quem ainda não tem canal."
          }
        />
      )}

      {/* ─────────────────────── cartões ─────────────────────── */}
      <ul className="space-y-2.5">
        {lista.map((l) => (
          <li key={l.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-[var(--texto-3)]">
                  {l.decisaoRotulo}
                </p>
                <p className="text-[15px] font-medium">{l.nome}</p>
              </div>
              <span className="text-[12px] tabular-nums text-[var(--texto-3)]">
                comercial {l.scoreComercial} · contato {l.scoreContatabilidade} · prioridade{" "}
                <strong className="text-[var(--acao)]">{l.probabilidade}/100</strong>
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Etiqueta>🏪 {l.segmento}</Etiqueta>
              {l.cidade && <Etiqueta>📍 {l.cidade}</Etiqueta>}
              <Etiqueta tom={l.oportunidade.elegivel ? "acao" : "neutro"}>{l.canalRotulo}</Etiqueta>
              <Etiqueta titulo="Estado do contato — formato nunca prova conta de WhatsApp">
                {l.contatoRotulo}
              </Etiqueta>
              {l.telefoneOrigem && <Etiqueta titulo="Origem do número">via {l.telefoneOrigem}</Etiqueta>}
            </div>

            {l.sistema && (
              <p className="mt-2 text-[13px] text-[var(--texto-2)]">
                💰 {l.sistema}
                {l.modulos.length > 0 && (
                  <span className="text-[var(--texto-3)]"> — {l.modulos.slice(0, 5).join(", ")}</span>
                )}
              </p>
            )}

            {l.dor2.tipo === "confirmada" && (
              <p className="mt-1 text-[12.5px] text-[var(--verde)]">✅ Dor confirmada: {l.dor2.texto}</p>
            )}
            {l.dor2.tipo === "provavel" && (
              <p className="mt-1 text-[12.5px] text-[var(--texto-3)]">
                💡 Dor provável: {l.dor2.texto}
                <span className="opacity-70"> — {l.dor2.sinais.join(", ")}</span>
              </p>
            )}

            <div className="mt-2.5">
              <FatoEInferencia
                fatos={l.positivos.filter((m) => m.tipo === "fato").map((m) => m.texto)}
                inferencias={l.positivos.filter((m) => m.tipo === "inferencia").map((m) => m.texto)}
              />
            </div>

            {aba === "enriquecer" && (
              <p className="mt-2 text-[12.5px]">
                {PRIORIDADE_ENRIQ[l.enriquecimentoPrioridade ?? ""] ?? "⚪ sem prioridade"} ·{" "}
                <span className="text-[var(--texto-3)]">{l.enriquecimentoMotivo}</span>
              </p>
            )}

            {!l.oportunidade.elegivel && l.oportunidade.bloqueios.length > 0 && (
              <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                {l.oportunidade.reabreSozinha ? "⏳" : "🚫"} {l.oportunidade.bloqueios.join(" · ")}
                {l.oportunidade.reabreSozinha && " — volta à fila sozinha"}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/lead/${l.id}`} className="btn-secundario">
                ABRIR LEAD
              </Link>
              {l.whatsappUrl && (
                <a href={l.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                  WHATSAPP
                </a>
              )}
              {l.website && (
                <a href={l.website} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                  SITE
                </a>
              )}
              {(l.canal === "instagram" || l.canal === "ambos") && l.instagramUrl && (
                <>
                  <a href={l.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                    @{l.instagramUsername}
                  </a>
                  {STATUS_IG.map((s) => (
                    <button
                      key={s.valor}
                      onClick={() =>
                        void marcarInstagram(l.id, l.instagramStatus === s.valor ? "nao-abordado" : s.valor)
                      }
                      className={`rounded-[10px] px-3 py-1.5 text-[12px] transition ${
                        l.instagramStatus === s.valor
                          ? "bg-[var(--acao-fraco)] font-medium text-[var(--acao)]"
                          : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                      }`}
                    >
                      {s.rotulo}
                    </button>
                  ))}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* ──────────── funil de venda: onde se perde gente ──────────── */}
      {com && com.funil.length > 0 && (
        <section className="cartao mt-6 p-5">
          <p className="text-[15px] font-semibold">Funil de venda</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">
            Depois da abordagem. A distância entre dois degraus é onde a prospecção perde gente.
          </p>
          <div className="space-y-2">
            {com.funil.map((e) => (
              <Barra key={e.etapa} rotulo={e.etapa} valor={e.quantos} de={com.funil[0].quantos || 1} />
            ))}
          </div>
        </section>
      )}

      {f && (
        <p className="mt-6 text-[11.5px] text-[var(--texto-3)]">
          base completa: {f.total} cadastros · {f.comPotencialDeSolucao} com potencial de solução ·{" "}
          {f.oportunidadesReais} abordáveis hoje
        </p>
      )}
    </main>
  );
}
