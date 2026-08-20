"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CampoCidade, { type Cidade as CidadeBr } from "@/components/campo-cidade";

/**
 * Busca embutida na própria lista de melhores leads.
 *
 * Antes era preciso sair para a tela de busca, procurar, voltar. Com a lista
 * curta (o caso comum depois de trabalhar alguns leads), isso era o gargalo.
 *
 * Guarda a última busca no navegador: repetir a de ontem vira um clique.
 */

const CHAVE = "leadsite:ultima-busca";

/**
 * Atalhos dos ramos com melhor cobertura no OpenStreetMap — medido: restaurante
 * e oficina passam de 90% com telefone, salão fica em torno de 8%. Sugerir os
 * que rendem evita a busca frustrada.
 */
const SUGESTOES = ["restaurante", "pizzaria", "oficina mecânica", "lanchonete", "farmácia"];

const PASSOS = [
  "Procurando empresas…",
  "Analisando presença digital…",
  "Verificando se os sites respondem…",
];

type Cidade = CidadeBr | null;

type UltimaBusca = { nicho?: string; cidade?: string; uf?: string } | null;

/**
 * Lê a última busca do localStorage.
 *
 * `useSyncExternalStore` é a API do React para estado que vive fora dele.
 * A versão anterior fazia isso num `useEffect` com `setCidade`, o que dispara
 * render em cascata; e ler no inicializador do `useState` quebraria a
 * hidratação, já que o servidor não tem localStorage. Aqui o snapshot do
 * servidor é `null` e o React troca sozinho ao hidratar.
 */
const semInscricao = () => () => {};

function useUltimaBusca(): UltimaBusca {
  const bruto = useSyncExternalStore(
    semInscricao,
    () => localStorage.getItem(CHAVE),
    () => null,
  );

  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as UltimaBusca;
  } catch {
    return null;
  }
}

export default function BuscaRapida({
  aoConcluir,
}: {
  aoConcluir: (novos: number) => void;
}) {
  /**
   * O ramo é campo NÃO controlado: preencher a partir do localStorage com
   * estado exigia setState dentro de effect (render em cascata) e arriscava
   * divergência de hidratação. Com ref, o valor entra depois que monta.
   */
  const nichoRef = useRef<HTMLInputElement>(null);
  const salvo = useUltimaBusca();

  /**
   * `undefined` = usuário ainda não mexeu (vale o que está salvo).
   * `null` = usuário apagou de propósito.
   */
  const [escolhida, setEscolhida] = useState<Cidade | undefined>(undefined);

  const cidade: Cidade =
    escolhida !== undefined
      ? escolhida
      : salvo?.cidade && salvo?.uf
        ? { nome: salvo.cidade, uf: salvo.uf }
        : null;

  const [carregando, setCarregando] = useState(false);
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!carregando) return;
    const t = setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1)), 4000);
    return () => clearInterval(t);
  }, [carregando]);

  async function buscar(e?: React.FormEvent, nichoForcado?: string) {
    e?.preventDefault();
    const termo = (nichoForcado ?? nichoRef.current?.value ?? "").trim();

    if (!termo) {
      setErro("Diga o ramo que você procura.");
      return;
    }
    if (!cidade) {
      setErro("Escolha a cidade na lista — é ela que define o estado.");
      return;
    }

    setCarregando(true);
    setPasso(0);
    setErro(null);
    setAviso(null);

    try {
      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: termo,
          cidade: cidade.nome,
          estado: cidade.uf,
          quantidade: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Erro na busca");

      try {
        localStorage.setItem(
          CHAVE,
          JSON.stringify({ nicho: termo, cidade: cidade.nome, uf: cidade.uf }),
        );
      } catch {
        // sem persistência, mas a busca funcionou — não vale interromper
      }

      setAviso(data.aviso ?? null);
      aoConcluir(data.leads?.length ?? 0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="cartao mb-6 p-4">
      {/**
       * `min-w-0` nos dois campos: sem isso, o `width:100%` da classe .campo
       * ganhava do flex-1 e o campo do ramo colapsava para poucos pixels.
       */}
      <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={nichoRef}
          defaultValue={salvo?.nicho ?? ""}
          placeholder="Ramo: oficina, dentista, restaurante…"
          className="campo min-w-0 flex-1"
        />
        <CampoCidade
          valor={cidade}
          aoEscolher={setEscolhida}
          placeholder="Cidade (qualquer uma do Brasil)"
          className="min-w-0 sm:w-64"
        />
        <button type="submit" disabled={carregando} className="btn-primario shrink-0">
          {carregando ? "Buscando…" : "Buscar mais"}
        </button>
      </form>

      {!carregando && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[var(--texto-3)]">Rendem mais:</span>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (nichoRef.current) nichoRef.current.value = s;
                void buscar(undefined, s);
              }}
              className="rounded-[6px] bg-[var(--superficie)] px-2 py-1 text-[12px] text-[var(--texto-2)] transition hover:text-[var(--texto)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {carregando && (
        <p className="mt-3 text-[13px] text-[var(--texto-2)]">{PASSOS[passo]}</p>
      )}

      {erro && <p className="mt-3 text-[13px] text-[var(--vermelho)]">{erro}</p>}

      {aviso && !erro && (
        <p className="mt-3 rounded-[8px] bg-[var(--ambar-fraco)] px-3 py-2 text-[13px] text-[var(--ambar)]">
          {aviso}
        </p>
      )}
    </section>
  );
}
