"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Indicadores, Etiqueta, FatoEInferencia, Vazio } from "@/components/central";

/**
 * 📊 RADAR COMERCIAL — priorização, e só isso.
 *
 * A pergunta desta tela é uma: *destas empresas, quais valem as próximas duas
 * horas?* Ela não busca empresa nova (isso é Encontrar clientes), não procura
 * canal (isso é Enriquecimento) e não guarda script (isso é a Central).
 *
 * NENHUM MOTOR NOVO. O ranking, os scores, os motivos e os bloqueios saem de
 * `avaliarOportunidadeComercial` pela rota que o painel e a campanha já usam.
 * Uma tela de priorização com régua própria seria a quarta régua sobre os
 * mesmos leads — e a que divergisse mandaria o vendedor para a empresa errada.
 */

type Motivo = { texto: string; pontos: number; tipo: "fato" | "inferencia" };

type LeadRadar = {
  id: string;
  nome: string;
  segmento: string;
  cidade: string | null;
  canal: string;
  canalRotulo: string;
  decisao: "quero-vender" | "vale-abordar" | "nao-prioritario";
  decisaoRotulo: string;
  probabilidade: number;
  scoreComercial: number;
  scoreContatabilidade: number;
  scoreFinal: number;
  alcance: "local" | "regional" | "fora";
  alcanceRotulo: string;
  sistema: string | null;
  modulos: string[];
  positivos: Motivo[];
  negativos: Motivo[];
  dor2:
    | { tipo: "confirmada"; texto: string }
    | { tipo: "provavel"; texto: string; sinais: string[] }
    | { tipo: "nenhuma" };
  whatsappUrl: string | null;
  instagramUrl: string | null;
  instagramUsername: string | null;
  website: string | null;
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
};

type Resposta = { leads: LeadRadar[]; funil: Funil; canais: { praca: string } };

type Decisao = "todas" | "quero-vender" | "vale-abordar";

/**
 * O território como score próprio, pedido no §3 da operação.
 *
 * Deriva de `alcance`, que já é calculado pelo endereço em `lib/territorio` —
 * não é medida nova, é a mesma resposta apresentada como número para poder
 * ficar ao lado dos outros dois.
 */
const SCORE_TERRITORIAL: Record<LeadRadar["alcance"], number> = {
  local: 100,
  regional: 55,
  fora: 10,
};

export default function RadarPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [decisao, setDecisao] = useState<Decisao>("todas");
  const [soNaPraca, setSoNaPraca] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = new URLSearchParams({ quantidade: "100" });
      q.set("somenteWhatsapp", "0");
      q.set("incluirContatados", "1");
      q.set("esconderDescartados", "1");
      if (soNaPraca) q.set("somenteNaPraca", "1");
      if (decisao !== "todas") q.set("decisao", decisao);
      setDados(await fetch(`/api/disparo/oportunidades?${q}`).then((r) => r.json()));
    } finally {
      setCarregando(false);
    }
  }, [decisao, soNaPraca]);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const f = dados?.funil;
  const lista = dados?.leads ?? [];

  /**
   * A PRÓXIMA AÇÃO sai do estado do lead, não de um palpite. A ordem importa:
   * canal automático antes de manual, manual antes de enriquecimento, e nada
   * antes de existir o que vender.
   */
  const proximaAcao = (l: LeadRadar): string => {
    if (!l.oportunidade.temPotencialDeSolucao) return "Nada a vender neste ramo";
    if (l.oportunidade.aguardandoCanal) return "Enriquecer — falta canal de contato";
    if (!l.oportunidade.elegivel) {
      return l.oportunidade.reabreSozinha
        ? "Aguardar — volta à fila sozinha"
        : `Resolver: ${l.oportunidade.bloqueios[0]}`;
    }
    if (l.canal === "instagram") return "Abordar pelo Instagram, à mão";
    return "Pronta para campanha ou abordagem direta";
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">Radar comercial</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Das empresas que já estão na base, quais valem as próximas duas horas.
        </p>
      </header>

      {f && (
        <div className="mb-5">
          <Indicadores
            itens={[
              { rotulo: "🔥 Quero vender", valor: f.melhores, destaque: true, onClick: () => setDecisao("quero-vender") },
              { rotulo: "📱 WhatsApp prontos", valor: f.prontasParaWhatsapp },
              { rotulo: "📸 Instagram", valor: f.prontasParaInstagram },
              { rotulo: "✅ Abordáveis hoje", valor: f.oportunidadesReais },
              { rotulo: "🌐 Sem canal", valor: f.aguardandoCanal },
              { rotulo: "⏳ Voltam sozinhas", valor: f.reabremSozinhas },
              { rotulo: "Base", valor: f.total },
            ]}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px]">
        {(["todas", "quero-vender", "vale-abordar"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDecisao(d)}
            className={`rounded-full px-3.5 py-1.5 transition ${
              decisao === d
                ? "bg-[var(--acao)] font-medium text-[#04201d]"
                : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
            }`}
          >
            {d === "todas" ? "Todas" : d === "quero-vender" ? "🔥 Quero vender" : "🟡 Vale abordar"}
          </button>
        ))}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={soNaPraca} onChange={(e) => setSoNaPraca(e.target.checked)} />
          📍 só {dados?.canais.praca?.split("/")[0] ?? "a praça"}
        </label>
      </div>

      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && lista.length === 0 && (
        <Vazio
          titulo="Nenhuma oportunidade priorizada com esses filtros."
          detalhe={
            f && f.total === 0
              ? "A base está vazia. Comece por Encontrar clientes."
              : "O radar mostra o que já está na base. Para trazer empresas novas, use Encontrar clientes."
          }
          acao={
            <Link href="/cacada" className="btn-primario">
              ENCONTRAR CLIENTES
            </Link>
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
                  {l.cidade ? ` · ${l.cidade}` : ""} · {l.alcanceRotulo}
                </p>
              </div>
              {/**
               * OS QUATRO NÚMEROS, e eles não são o mesmo número quatro vezes.
               * Comercial mede a empresa; contatabilidade mede o acesso a ela;
               * territorial mede a distância; prioridade é a decisão de agenda.
               * Canal alto com comercial baixo continua sendo empresa ruim.
               */}
              <div className="text-right text-[11.5px] tabular-nums text-[var(--texto-3)]">
                <p>
                  prioridade{" "}
                  <strong className="text-[15px] text-[var(--acao)]">{l.probabilidade}</strong>
                </p>
                <p>comercial {l.scoreComercial} · contato {l.scoreContatabilidade}</p>
                <p>territorial {SCORE_TERRITORIAL[l.alcance]} · final {l.scoreFinal}</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Etiqueta tom={l.oportunidade.elegivel ? "acao" : "neutro"}>{l.canalRotulo}</Etiqueta>
              {l.sistema && <Etiqueta tom="bom">💰 {l.sistema}</Etiqueta>}
            </div>

            {l.dor2.tipo !== "nenhuma" && (
              <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
                💡 {l.dor2.tipo === "confirmada" ? "Dor confirmada" : "Dor provável"}: {l.dor2.texto}
              </p>
            )}

            <div className="mt-2.5">
              <FatoEInferencia
                fatos={l.positivos.filter((m) => m.tipo === "fato").map((m) => m.texto)}
                inferencias={l.positivos.filter((m) => m.tipo === "inferencia").map((m) => m.texto)}
              />
            </div>

            {l.oportunidade.bloqueios.length > 0 && (
              <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                {l.oportunidade.reabreSozinha ? "⏳" : "🚫"} {l.oportunidade.bloqueios.join(" · ")}
              </p>
            )}

            <div className="mt-3 rounded-[10px] bg-[var(--superficie)] px-3 py-2">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                Próxima ação
              </p>
              <p className="mt-0.5 text-[12.5px] text-[var(--texto-2)]">{proximaAcao(l)}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/lead/${l.id}`} className="btn-secundario">
                ABRIR LEAD
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
