"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Indicadores, Etiqueta, Vazio } from "@/components/central";
import { NICHOS_QUENTES, NICHOS_DO_MAPA } from "@/lib/nichos-quentes";

/**
 * 👥 ENCONTRAR CLIENTES — a tela de aquisição, e só ela.
 *
 * O QUE MUDOU AQUI, E POR QUÊ
 *
 * Esta tela já foi um cockpit com quatro abas dentro: melhores, WhatsApp,
 * Instagram e enriquecer. Funcionava, e mesmo assim estava errado — obrigava
 * a entrar aqui e clicar de novo para chegar em coisas que são áreas
 * diferentes do trabalho. Priorizar virou `/radar`, descobrir canal virou
 * `/enriquecimento`, e o que sobrou nesta página é uma coisa só: trazer
 * empresa nova para dentro.
 *
 * A BUSCA REAL. O formulário chama `/api/leads/search`, que já existe e já
 * grava — a mesma rota que a tela de busca antiga usa. Nenhum coletor novo,
 * nenhuma segunda régua.
 *
 * O RESULTADO É REVISADO ANTES DE VIRAR CAMPANHA. A busca grava os
 * cadastros; o que ela NÃO faz é montar campanha sozinha. Para isso existe o
 * botão de preparar, que passa pela confirmação.
 */

type Motivo = { texto: string; pontos: number; tipo: "fato" | "inferencia" };

type LeadAchado = {
  id: string;
  nome: string;
  segmento: string;
  cidade: string | null;
  canal: "ambos" | "whatsapp" | "instagram" | "site" | "sem-canal";
  canalRotulo: string;
  decisaoRotulo: string;
  probabilidade: number;
  sistema: string | null;
  positivos: Motivo[];
  whatsappUrl: string | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
  website: string | null;
  telefoneFormatado: string | null;
  oportunidade: { elegivel: boolean; bloqueios: string[]; aguardandoCanal: boolean };
};

type Funil = {
  total: number;
  oportunidadesReais: number;
  prontasParaWhatsapp: number;
  prontasParaInstagram: number;
  melhores: number;
  aguardandoCanal: number;
};

type Painel = {
  leads: LeadAchado[];
  funil: Funil;
  canais: { praca: string; whatsapp: number; instagram: number; semCanal: number; total: number };
  segmentos: { nome: string; total: number }[];
};

type ResultadoBusca = {
  leads?: { id: string; nome: string }[];
  totalEncontrado?: number;
  totalContatavel?: number;
  aviso?: string;
  erro?: string;
};

export default function EncontrarClientesPage() {
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("Uberlândia");
  const [estado, setEstado] = useState("MG");
  const [quantidade, setQuantidade] = useState(20);

  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState<ResultadoBusca | null>(null);

  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [soNaPraca, setSoNaPraca] = useState(true);
  const [soComCanal, setSoComCanal] = useState(true);
  const [segmento, setSegmento] = useState("");

  const [confirmando, setConfirmando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ quantidade: "60" });
      q.set("somenteWhatsapp", "0");
      q.set("incluirContatados", "1");
      if (soComCanal) q.set("esconderDescartados", "1");
      if (soNaPraca) q.set("somenteNaPraca", "1");
      if (segmento) q.set("segmento", segmento);
      setPainel(await fetch(`/api/disparo/oportunidades?${q}`).then((r) => r.json()));
    } finally {
      setCarregando(false);
    }
  }, [soNaPraca, soComCanal, segmento]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const buscar = useCallback(async () => {
    if (nicho.trim().length < 2 || cidade.trim().length < 2) return;
    setBuscando(true);
    setBusca(null);
    try {
      const r: ResultadoBusca = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: nicho.trim(),
          cidade: cidade.trim(),
          estado: estado.trim(),
          quantidade,
        }),
      }).then((x) => x.json());
      setBusca(r);
      await carregar();
    } catch {
      setBusca({ erro: "A busca falhou. O mapa aberto é mantido por voluntários e cai com frequência — tente de novo em um minuto." });
    } finally {
      setBuscando(false);
    }
  }, [nicho, cidade, estado, quantidade, carregar]);

  const prontos = useMemo(
    () =>
      (painel?.leads ?? []).filter(
        (l) => l.oportunidade.elegivel && (l.canal === "whatsapp" || l.canal === "ambos"),
      ),
    [painel],
  );

  const prepararCampanha = useCallback(async () => {
    if (!prontos.length) return;
    setCriando(true);
    setAviso(null);
    try {
      const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      const r = await fetch("/api/campanhas/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: `Prospecção — ${data}`,
          leadIds: prontos.slice(0, 300).map((l) => l.id),
          filtro: { origem: "encontrar-clientes" },
        }),
      }).then((x) => x.json());
      setConfirmando(false);
      setAviso(
        r.campanha?.id
          ? `Rascunhos criados para ${prontos.length} empresa(s). Nada foi enviado — revise e aprove em Envio de mensagens.`
          : (r.erro ?? "Não foi possível criar a campanha."),
      );
    } finally {
      setCriando(false);
    }
  }, [prontos]);

  const f = painel?.funil;
  const c = painel?.canais;
  const lista = painel?.leads ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">Encontrar clientes</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Traga empresas novas para a base e veja quais já dá para abordar.
        </p>
      </header>

      {/* ─────────────────── a busca ─────────────────── */}
      <section className="cartao mb-5 p-5">
        <p className="text-[15px] font-semibold">O que você quer encontrar?</p>
        <p className="mt-0.5 text-[12px] text-[var(--texto-3)]">
          Ex.: oficinas, barbearias, clínicas odontológicas, pet shops, restaurantes
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void buscar();
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="min-w-[220px] flex-1">
            <label className="text-[11px] text-[var(--texto-3)]">Nicho</label>
            {/**
             * Lista + digitação livre, e não só uma das duas.
             *
             * A lista existe porque "que nicho eu busco?" é a pergunta que
             * trava a tela, e porque a maioria dos termos que vêm à cabeça
             * (transportadora, contabilidade) rende quase nada nesta fonte. A
             * digitação continua porque a lista não pode virar uma cerca: o
             * coletor aceita qualquer termo, e às vezes o certo é um que
             * ninguém previu.
             */}
            <input
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              list="nichos-sugeridos"
              placeholder="oficina mecânica"
              className="campo mt-0.5 w-full py-1.5 text-[13px]"
            />
            <datalist id="nichos-sugeridos">
              {NICHOS_QUENTES.map((n) => (
                <option key={n.termo} value={n.termo}>
                  {n.porque}
                </option>
              ))}
            </datalist>
          </div>
          <div className="w-40">
            <label className="text-[11px] text-[var(--texto-3)]">Cidade</label>
            <input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="campo mt-0.5 w-full py-1.5 text-[13px]"
            />
          </div>
          <div className="w-20">
            <label className="text-[11px] text-[var(--texto-3)]">UF</label>
            <input
              value={estado}
              onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
              className="campo mt-0.5 w-full py-1.5 text-[13px]"
            />
          </div>
          <div className="w-24">
            <label className="text-[11px] text-[var(--texto-3)]">Quantas</label>
            <input
              type="number"
              min={1}
              max={60}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.min(60, Math.max(1, Number(e.target.value) || 20)))}
              className="campo mt-0.5 w-full py-1.5 text-[13px] tabular-nums"
            />
          </div>
          <button type="submit" disabled={buscando || nicho.trim().length < 2} className="btn-primario">
            {buscando ? "Buscando…" : "🔎 ENCONTRAR"}
          </button>
        </form>

        {/**
         * OS NICHOS COM O NÚMERO MEDIDO AO LADO.
         *
         * Não é enfeite: "restaurante 16" e "transportadora 1" dizem, antes do
         * clique, o que esperar da busca. Uma lista sem esse número trata os
         * dois como equivalentes e transforma a diferença numa surpresa ruim
         * depois de trinta segundos de espera.
         */}
        <div className="mt-3">
          <p className="text-[11px] text-[var(--texto-3)]">
            Rendem mais nesta fonte — o número é quantos têm contato publicado hoje em{" "}
            {c?.praca?.split("/")[0] ?? "Uberlândia"}:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NICHOS_DO_MAPA.map((n) => (
              <button
                key={n.termo}
                onClick={() => setNicho(n.termo)}
                title={n.porque}
                className={`rounded-full px-2.5 py-1 text-[12px] transition ${
                  nicho === n.termo
                    ? "bg-[var(--acao)] font-medium text-[#04201d]"
                    : "bg-[var(--superficie-2)] hover:bg-[var(--linha)]"
                }`}
              >
                {n.rotulo}
                <span className="ml-1.5 tabular-nums opacity-60">{n.contataveis}</span>
              </button>
            ))}
          </div>

          {/**
           * O AVISO QUE EVITA A BUSCA FRUSTRADA.
           *
           * Estes ramos compram bem — transportadora vive de cotação por
           * WhatsApp — e o mapa aberto conhece 9 delas na cidade, com 1
           * contato. Deixar isso implícito seria oferecer uma busca que volta
           * vazia e parecer defeito do sistema.
           */}
          <details className="mt-2.5">
            <summary className="cursor-pointer text-[11px] text-[var(--texto-3)]">
              nichos que compram bem mas o mapa mal conhece
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {NICHOS_QUENTES.filter((n) => n.fonte === "receita").map((n) => (
                <button
                  key={n.termo}
                  onClick={() => setNicho(n.termo)}
                  title={`${n.porque} — ${n.mapeados} mapeados, ${n.contataveis} com contato`}
                  className="rounded-full bg-[var(--superficie)] px-2.5 py-1 text-[12px] text-[var(--texto-3)] transition hover:bg-[var(--superficie-2)]"
                >
                  {n.rotulo}
                  <span className="ml-1.5 tabular-nums opacity-60">{n.contataveis}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--texto-3)]">
              O mapa aberto é cartografia: mapeia quem tem fachada. Transportadora, contabilidade e
              despachante atendem por telefone num galpão ou numa sala, e ninguém os desenha. Esses
              ramos têm CNAE próprio na Receita Federal — é de lá que eles viriam em volume, e o
              importador ainda não existe.
            </p>
          </details>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[var(--texto-3)]">
          A fonte é o mapa aberto (OpenStreetMap), grátis e sem chave. Ele cobre bem comércio de
          rua — oficina, restaurante, salão, pet shop — e mal cobre ramo de serviço, que quase
          ninguém mapeia. Contato aparece em poucos: 111 dos 1.426 estabelecimentos de Uberlândia.
        </p>

        {busca && (
          <div className="mt-3 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
            {busca.erro ? (
              <p className="text-[12.5px] text-[var(--vermelho)]">{busca.erro}</p>
            ) : (
              <>
                <p className="text-[13px]">
                  <strong className="tabular-nums">{busca.leads?.length ?? 0}</strong> empresa(s)
                  gravada(s)
                  {busca.totalEncontrado != null && (
                    <span className="text-[var(--texto-3)]">
                      {" "}
                      · {busca.totalEncontrado} mapeada(s) · {busca.totalContatavel ?? 0} com contato
                    </span>
                  )}
                </p>
                {busca.aviso && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--texto-3)]">{busca.aviso}</p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* ─────────────────── o que temos ─────────────────── */}
      {f && c && (
        <div className="mb-5">
          <Indicadores
            itens={[
              { rotulo: "🔥 Melhores", valor: f.melhores, destaque: true, ajuda: "os dois canais e vale vender" },
              { rotulo: "✅ Abordáveis", valor: f.oportunidadesReais },
              { rotulo: "📱 WhatsApp", valor: c.whatsapp },
              { rotulo: "📸 Instagram", valor: c.instagram },
              { rotulo: "🌐 Sem canal", valor: c.semCanal, ajuda: "vá para Enriquecimento" },
              { rotulo: "Base", valor: c.total },
              { rotulo: "📍 Praça", valor: c.praca?.split("/")[0] ?? "—" },
            ]}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soComCanal} onChange={(e) => setSoComCanal(e.target.checked)} />
          só com canal utilizável
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soNaPraca} onChange={(e) => setSoNaPraca(e.target.checked)} />
          📍 só {c?.praca?.split("/")[0] ?? "a praça"}
        </label>
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="campo w-56 py-1.5 text-[12.5px]"
        >
          <option value="">todos os nichos</option>
          {(painel?.segmentos ?? []).slice(0, 40).map((s) => (
            <option key={s.nome} value={s.nome}>
              {s.nome} ({s.total})
            </option>
          ))}
        </select>
        <Link href="/radar" className="text-[12.5px] text-[var(--acao)] underline">
          priorizar no radar →
        </Link>
      </div>

      {/* ─────────────── preparar prospecção ─────────────── */}
      {prontos.length > 0 && (
        <div className="mb-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
          <p className="text-[13px]">
            <strong className="tabular-nums">{prontos.length}</strong> empresa
            {prontos.length === 1 ? "" : "s"} pronta{prontos.length === 1 ? "" : "s"} para campanha
          </p>
          {!confirmando ? (
            <button onClick={() => setConfirmando(true)} className="btn-primario mt-2.5">
              PREPARAR PROSPECÇÃO
            </button>
          ) : (
            <div className="mt-3 rounded-[10px] bg-[var(--superficie-2)] px-3.5 py-3">
              <p className="text-[13px] font-medium">
                Criar rascunhos para {prontos.length} empresa{prontos.length === 1 ? "" : "s"}?
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-[var(--texto-2)]">
                <li>✓ Só entram empresas com WhatsApp plausível e sistema aplicável</li>
                <li>✓ Rede, franquia e ramo de grande porte já foram excluídos</li>
                <li>✓ Quem pediu para não ser contatado nunca entra</li>
                <li>✓ Contato recente, mensagem viva e duplicata também barram</li>
                <li className="text-[var(--texto-3)]">
                  → Isto cria RASCUNHOS. Nada é enviado até você aprovar.
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={prepararCampanha} disabled={criando} className="btn-primario">
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

      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && lista.length === 0 && (
        <Vazio
          titulo={
            (c?.total ?? 0) === 0
              ? "A base está vazia."
              : "Nenhuma empresa com esses filtros."
          }
          detalhe={
            (c?.total ?? 0) === 0
              ? "Use a busca acima para trazer as primeiras. Comece por um nicho que o mapa cobre bem: oficina, restaurante, salão, pet shop."
              : "Afrouxe um filtro, ou veja quem está sem canal em Enriquecimento."
          }
        />
      )}

      <ul className="space-y-2.5">
        {lista.map((l) => (
          <li key={l.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-[var(--texto-3)]">
                  {l.decisaoRotulo}
                </p>
                <p className="text-[15px] font-medium">{l.nome}</p>
                <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
                  {l.segmento}
                  {l.cidade ? ` · ${l.cidade}` : ""}
                </p>
              </div>
              <span className="text-[12px] tabular-nums text-[var(--texto-3)]">
                prioridade <strong className="text-[var(--acao)]">{l.probabilidade}/100</strong>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Etiqueta tom={l.oportunidade.elegivel ? "acao" : "neutro"}>{l.canalRotulo}</Etiqueta>
              {l.telefoneFormatado && <Etiqueta>📞 {l.telefoneFormatado}</Etiqueta>}
              {l.sistema && <Etiqueta tom="bom">💰 {l.sistema}</Etiqueta>}
            </div>

            {l.oportunidade.aguardandoCanal && (
              <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                🌐 Boa empresa sem canal —{" "}
                <Link href="/enriquecimento" className="text-[var(--acao)] underline">
                  enriquecer
                </Link>
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/lead/${l.id}`} className="btn-secundario">
                ABRIR
              </Link>
              {l.whatsappUrl && (
                <a href={l.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                  WHATSAPP
                </a>
              )}
              {l.instagramUrl && (
                <a href={l.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                  @{l.instagramUsername}
                </a>
              )}
              {l.website && (
                <a href={l.website} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                  SITE
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
