"use client";

import type { ReactNode } from "react";

/**
 * AS PEÇAS DA CENTRAL DE PROSPECÇÃO.
 *
 * POR QUE EXISTE
 *
 * O cartão de indicador estava escrito quatro vezes — em `/cacada`,
 * `/disparos`, `/painel` e `/prospeccao` — com quatro conjuntos de classes
 * ligeiramente diferentes. Isso não é só duplicação de código: é a razão de o
 * mesmo número parecer mais ou menos importante dependendo da tela onde
 * aparece.
 *
 * As peças aqui são deliberadamente burras. Elas não buscam dado, não decidem
 * regra e não sabem o que é um lead — recebem o que mostrar e mostram. Toda
 * decisão comercial continua em `avaliarOportunidadeComercial`, e nenhuma tela
 * ganha régua própria por ter ganhado componente próprio.
 */

/* ─────────────────────────── indicadores ─────────────────────────── */

export type Indicador = {
  rotulo: string;
  valor: number | string;
  /** O que este número significa. Aparece pequeno, e importa. */
  ajuda?: string;
  /** Destaque reservado ao número que decide o dia. Use em UM por seção. */
  destaque?: boolean;
  onClick?: () => void;
  ativo?: boolean;
};

export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {itens.map((i) => {
        const clicavel = Boolean(i.onClick);
        return (
          <button
            key={i.rotulo}
            onClick={i.onClick}
            disabled={!clicavel}
            title={i.ajuda}
            className={`rounded-[10px] px-2.5 py-3 text-center transition ${
              i.destaque
                ? "bg-[var(--acao-fraco)] ring-1 ring-[var(--acao)]/25"
                : i.ativo
                  ? "bg-[var(--superficie-2)] ring-1 ring-[var(--linha-forte)]"
                  : "bg-[var(--superficie)]"
            } ${clicavel ? "hover:bg-[var(--superficie-2)] cursor-pointer" : "cursor-default"}`}
          >
            <p
              className={`text-[21px] font-semibold leading-none tabular-nums ${
                i.destaque ? "text-[var(--acao)]" : ""
              }`}
            >
              {i.valor}
            </p>
            <p className="mt-1.5 text-[11px] leading-tight text-[var(--texto-3)]">{i.rotulo}</p>
          </button>
        );
      })}
    </section>
  );
}

/* ─────────────────────────────── abas ─────────────────────────────── */

export type Aba<T extends string> = { id: T; rotulo: string; contagem?: number; ajuda?: string };

export function Abas<T extends string>({
  abas,
  atual,
  aoTrocar,
}: {
  abas: Aba<T>[];
  atual: T;
  aoTrocar: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {abas.map((a) => (
        <button
          key={a.id}
          onClick={() => aoTrocar(a.id)}
          title={a.ajuda}
          className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
            atual === a.id
              ? "bg-[var(--acao)] font-medium text-[#04201d]"
              : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
          }`}
        >
          {a.rotulo}
          {a.contagem != null && (
            <span className="ml-1.5 tabular-nums opacity-70">{a.contagem}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────── etiqueta ─────────────────────────── */

export type TomEtiqueta = "neutro" | "acao" | "alerta" | "bom" | "ruim";

const TOM: Record<TomEtiqueta, string> = {
  neutro: "bg-[var(--superficie-2)] text-[var(--texto-2)]",
  acao: "bg-[var(--acao-fraco)] text-[var(--acao)]",
  alerta: "bg-[var(--ambar-fraco)] text-[var(--ambar)]",
  bom: "bg-[var(--verde-fraco)] text-[var(--verde)]",
  ruim: "bg-[var(--vermelho-fraco)] text-[var(--vermelho)]",
};

export function Etiqueta({
  children,
  tom = "neutro",
  titulo,
}: {
  children: ReactNode;
  tom?: TomEtiqueta;
  titulo?: string;
}) {
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${TOM[tom]}`}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────── barra ─────────────────────────────── */

/**
 * Uma linha do funil. `de` é sempre o total do topo, nunca o degrau anterior:
 * a barra tem de mostrar o encolhimento acumulado, que é o que revela onde a
 * prospecção perde gente.
 */
export function Barra({
  rotulo,
  valor,
  de,
  cor = "var(--acao)",
}: {
  rotulo: string;
  valor: number;
  de: number;
  cor?: string;
}) {
  const pct = de > 0 ? Math.min(100, (valor / de) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-[12.5px] text-[var(--texto-2)]">{rotulo}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--superficie-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: cor }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[12.5px] font-medium tabular-nums">
        {valor}
      </span>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-[var(--texto-3)]">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

/* ──────────────────── fato × inferência (o §7) ───────────────────── */

/**
 * A distinção que a tela nunca pode borrar.
 *
 * FATO é o que a empresa publicou: tem WhatsApp, tem horário, tem N
 * avaliações. INFERÊNCIA é o que nós concluímos disso — e por mais razoável
 * que seja, continua sendo hipótese até o cliente confirmar.
 *
 * Estão no mesmo componente para que ninguém consiga mostrar uma sem a outra,
 * e com marcadores diferentes para que ninguém confunda as duas de relance.
 */
export function FatoEInferencia({
  fatos,
  inferencias,
}: {
  fatos: string[];
  inferencias: string[];
}) {
  if (!fatos.length && !inferencias.length) return null;
  return (
    <div className="space-y-2">
      {fatos.length > 0 && (
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Fatos — o que a empresa publicou
          </p>
          <ul className="mt-1 space-y-0.5">
            {fatos.map((f) => (
              <li key={f} className="text-[12px] text-[var(--texto-2)]">
                ✓ {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inferencias.length > 0 && (
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            Hipóteses — nossa leitura, ainda não confirmada
          </p>
          <ul className="mt-1 space-y-0.5">
            {inferencias.map((i) => (
              <li key={i} className="text-[12px] text-[var(--texto-3)]">
                ~ {i}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── vazio honesto ───────────────────────── */

/**
 * O estado vazio DIZ O NÚMERO REAL em vez de esconder.
 *
 * É o §38: se há 1.293 cadastros e 13 abordáveis, a tela fala isso. Encher a
 * lista com leads sem canal para não parecer vazia é o comportamento que esta
 * reestruturação inteira existe para eliminar.
 */
export function Vazio({ titulo, detalhe, acao }: { titulo: string; detalhe?: string; acao?: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--superficie)] px-5 py-8 text-center">
      <p className="text-[14px] font-medium">{titulo}</p>
      {detalhe && (
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--texto-3)]">
          {detalhe}
        </p>
      )}
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}
