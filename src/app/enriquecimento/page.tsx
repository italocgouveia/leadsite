"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Indicadores, Etiqueta, Barra, Vazio } from "@/components/central";

/**
 * 🌐 ENRIQUECIMENTO — a descoberta de canais.
 *
 * Esta tela não qualifica nem prioriza: ela responde *quem é boa empresa e
 * ainda não tem por onde ser contatada, e o que dá para fazer a respeito*.
 *
 * NENHUMA LÓGICA NOVA. A fila, o `precisaEnriquecer`, as fontes e as travas de
 * gravação já existem em `lib/enriquecimento*` e em `/api/enriquecimento`.
 * O que faltava era interface para operar o que já estava construído.
 *
 * SOBRE PROMETER MENOS DO QUE SE PODE CUMPRIR
 *
 * A tela diz, na cara, o que as fontes gratuitas entregam. Medido: o mapa
 * aberto publica contato de 111 dos 1.426 estabelecimentos da cidade, e a
 * varredura de site aproveitou 15 Instagram de 22 páginas lidas. Um contador
 * de "aguardando enriquecimento" sem esse contexto vira promessa.
 */

type Resumo = {
  pendente?: number;
  processando?: number;
  encontrado?: number;
  nao_encontrado?: number;
  erro?: number;
  total?: number;
};

type ItemFila = {
  id: string;
  leadId: string;
  lead?: string | null;
  status: string;
  fonte?: string | null;
  telefoneEncontrado?: string | null;
  tentativas?: number | null;
};

type Painel = {
  enriquecimento: {
    semTelefone: number;
    precisamEnriquecer: number;
    prioridadeAlta: number;
    prioridadeMedia: number;
    prioridadeBaixa: number;
    encontrados: number;
    potencialAsemTelefone: number;
    potencialBsemTelefone: number;
  };
  funil: { total: number; aguardandoCanal: number };
  canais: { whatsapp: number; instagram: number; semCanal: number; total: number };
  totais: { comInstagram: number; semSiteConfirmado: number; siteNaoVerificado: number };
};

export default function EnriquecimentoPage() {
  const [fila, setFila] = useState<{ resumo: Resumo; itens: ItemFila[] } | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [f, p] = await Promise.all([
        fetch("/api/enriquecimento").then((r) => r.json()),
        fetch("/api/disparo/oportunidades?quantidade=1&somenteWhatsapp=0").then((r) => r.json()),
      ]);
      setFila(f);
      setPainel(p);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  const executar = useCallback(
    async (acao: "enfileirar" | "processar" | "ambos") => {
      setTrabalhando(true);
      setAviso(null);
      try {
        const r = await fetch("/api/enriquecimento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao, max: 10 }),
        }).then((x) => x.json());
        setAviso(
          r.erro ??
            `Fila: ${r.fila?.novos ?? 0} novos · processados ${r.lote?.processados?.length ?? 0} · telefones encontrados ${r.lote?.encontrados ?? 0}`,
        );
        await carregar();
      } finally {
        setTrabalhando(false);
      }
    },
    [carregar],
  );

  const e = painel?.enriquecimento;
  const c = painel?.canais;
  const r = fila?.resumo ?? {};

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">Enriquecimento</h1>
        <p className="mt-1 text-[13px] text-[var(--texto-3)]">
          Boas empresas que ainda não têm por onde ser contatadas — e o que dá para descobrir.
        </p>
      </header>

      {c && e && (
        <div className="mb-5">
          <Indicadores
            itens={[
              { rotulo: "🌐 Sem canal", valor: c.semCanal, destaque: true, ajuda: "nem WhatsApp nem Instagram" },
              { rotulo: "📞 Sem telefone", valor: e.semTelefone },
              { rotulo: "🔥 Prioridade alta", valor: e.prioridadeAlta, ajuda: "boa empresa, vale caçar o contato" },
              { rotulo: "🟡 Média", valor: e.prioridadeMedia },
              { rotulo: "✅ Já encontrados", valor: e.encontrados, ajuda: "ganharam telefone por enriquecimento" },
              { rotulo: "📱 Com WhatsApp", valor: c.whatsapp },
              { rotulo: "📸 Com Instagram", valor: c.instagram },
            ]}
          />
        </div>
      )}

      {/**
       * O QUE AS FONTES GRATUITAS ENTREGAM, dito antes de alguém contar com
       * elas. Sem este parágrafo, "prioridade alta: 643" lê-se como 643
       * telefones a caminho, e não é isso.
       */}
      <p className="mb-5 rounded-[10px] bg-[var(--superficie)] px-4 py-3 text-[12px] leading-relaxed text-[var(--texto-2)]">
        Esta é uma fila de <strong>trabalho</strong>, não uma previsão. As fontes gratuitas rendem
        pouco: o mapa aberto publica contato de 111 dos 1.426 estabelecimentos de Uberlândia, e a
        leitura de sites aproveitou 15 Instagram em 22 páginas. Cada dado gravado passa por
        validação de formato, DDD da praça e checagem de que não pertence a outra empresa.
      </p>

      {/* ─────────────── a fila ─────────────── */}
      <section className="cartao mb-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">Fila de enriquecimento</p>
          <span className="text-[12px] text-[var(--texto-3)]">
            {r.total ?? 0} itens · fontes gratuitas
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Etiqueta tom="alerta">⏳ pendente {r.pendente ?? 0}</Etiqueta>
          <Etiqueta>⚙ processando {r.processando ?? 0}</Etiqueta>
          <Etiqueta tom="bom">✓ encontrado {r.encontrado ?? 0}</Etiqueta>
          <Etiqueta>✗ não encontrado {r.nao_encontrado ?? 0}</Etiqueta>
          {(r.erro ?? 0) > 0 && <Etiqueta tom="ruim">erro {r.erro}</Etiqueta>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void executar("enfileirar")} disabled={trabalhando} className="btn-secundario">
            ENFILEIRAR CANDIDATOS
          </button>
          <button onClick={() => void executar("processar")} disabled={trabalhando} className="btn-primario">
            {trabalhando ? "Processando…" : "PROCESSAR 10"}
          </button>
          <button onClick={() => void carregar()} disabled={trabalhando} className="btn-secundario">
            ATUALIZAR
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--texto-3)]">
          Processa 10 por vez de propósito: cada item pode bater num site externo, e um lote grande
          estoura o tempo da rota. Nada aqui envia mensagem.
        </p>
        {aviso && <p className="mt-2 text-[12.5px] text-[var(--acao)]">{aviso}</p>}
      </section>

      {/* ─────────────── por onde atacar ─────────────── */}
      {e && c && (
        <section className="cartao mb-5 p-5">
          <p className="text-[15px] font-semibold">Onde está o contato que falta</p>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--texto-3)]">
            De {c.total} cadastros, quantos têm cada coisa.
          </p>
          <div className="space-y-2">
            <Barra rotulo="Com WhatsApp" valor={c.whatsapp} de={c.total || 1} />
            <Barra rotulo="Com Instagram" valor={c.instagram} de={c.total || 1} />
            <Barra
              rotulo="Com site (dá para ler)"
              valor={(painel?.totais.siteNaoVerificado ?? 0) + (painel?.totais.semSiteConfirmado ?? 0) > 0 ? c.total - c.semCanal : 0}
              de={c.total || 1}
            />
            <Barra rotulo="Sem canal nenhum" valor={c.semCanal} de={c.total || 1} cor="var(--vermelho)" />
          </div>
          <p className="mt-3 text-[12px] text-[var(--texto-3)]">
            O caminho com melhor retorno medido é a leitura de site — abra um lead com site e use
            <strong className="text-[var(--texto-2)]"> Analisar site</strong>. Para rodar em lote, o
            script <code className="text-[var(--texto-2)]">npm run enriquecer:site</code> simula por
            padrão e só grava com <code className="text-[var(--texto-2)]">--gravar</code>.
          </p>
        </section>
      )}

      {/* ─────────────── itens ─────────────── */}
      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && (fila?.itens.length ?? 0) === 0 && (
        <Vazio
          titulo="Nenhum item na fila."
          detalhe={
            (c?.total ?? 0) === 0
              ? "A base está vazia. Comece por Encontrar clientes."
              : "Use ENFILEIRAR CANDIDATOS para trazer as empresas de alto potencial que estão sem telefone."
          }
          acao={
            (c?.total ?? 0) === 0 ? (
              <Link href="/cacada" className="btn-primario">
                ENCONTRAR CLIENTES
              </Link>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2">
        {(fila?.itens ?? []).map((i) => (
          <li key={i.id} className="cartao flex flex-wrap items-center justify-between gap-2 p-3.5">
            <div>
              <Link href={`/lead/${i.leadId}`} className="text-[13.5px] font-medium hover:underline">
                {i.lead ?? "(lead sem nome)"}
              </Link>
              <p className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">
                {i.status}
                {i.fonte ? ` · fonte ${i.fonte}` : ""}
                {i.tentativas ? ` · ${i.tentativas} tentativa(s)` : ""}
              </p>
            </div>
            {i.telefoneEncontrado ? (
              <Etiqueta tom="bom">📞 {i.telefoneEncontrado}</Etiqueta>
            ) : (
              <Etiqueta>{i.status === "pendente" ? "aguardando" : "sem resultado"}</Etiqueta>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
