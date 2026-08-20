"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MunicipioBr } from "@/lib/municipios";

/**
 * Escolha de cidade em qualquer lugar do Brasil.
 *
 * Problemas da versão anterior, corrigidos aqui:
 *  - só casava início do nome ("lândia" não achava Uberlândia)
 *  - exigia clicar na lista mesmo com o nome digitado certo
 *  - não mostrava nada antes de 2 letras, nem as cidades já usadas
 *  - digitar antes dos 5.571 municípios carregarem não dava resultado nenhum
 */

const CHAVE_RECENTES = "leadsite:cidades-recentes";

export type Cidade = { nome: string; uf: string };

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Cidades recentes como "estado externo" do React.
 *
 * Ler no `useEffect` com setState dispara render em cascata (o lint acusa).
 * `useSyncExternalStore` é a API certa, mas exige um snapshot com REFERÊNCIA
 * estável — devolver um array novo a cada chamada causa loop infinito. Por
 * isso o cache abaixo compara a string crua antes de reconstruir o array.
 */
const ouvintes = new Set<() => void>();
let brutoEmCache = "";
let listaEmCache: Cidade[] = [];

function inscrever(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

function instantaneo(): Cidade[] {
  let bruto = "";
  try {
    bruto = localStorage.getItem(CHAVE_RECENTES) ?? "";
  } catch {
    bruto = "";
  }
  if (bruto !== brutoEmCache) {
    brutoEmCache = bruto;
    try {
      listaEmCache = bruto ? (JSON.parse(bruto) as Cidade[]) : [];
    } catch {
      listaEmCache = [];
    }
  }
  return listaEmCache;
}

const VAZIO: Cidade[] = [];

function useRecentes(): Cidade[] {
  return useSyncExternalStore(inscrever, instantaneo, () => VAZIO);
}

function salvarRecente(c: Cidade) {
  try {
    const atuais = instantaneo().filter((x) => !(x.nome === c.nome && x.uf === c.uf));
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([c, ...atuais].slice(0, 5)));
  } catch {
    // aba privada: segue sem histórico
  }
  ouvintes.forEach((f) => f());
}

export default function CampoCidade({
  valor,
  aoEscolher,
  placeholder = "Cidade",
  className = "",
}: {
  valor: Cidade | null;
  aoEscolher: (c: Cidade | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [texto, setTexto] = useState(valor ? valor.nome : "");
  const [todos, setTodos] = useState<MunicipioBr[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const recentes = useRecentes();

  const caixaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/municipios/todos")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setTodos(d.municipios ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const termo = normalizar(texto);

  /**
   * Ordena por utilidade, não por alfabeto:
   * nome exato > começa com > contém. Digitar "lândia" agora acha Uberlândia,
   * e digitar "franca" põe Franca antes de Francisco Beltrão.
   */
  const sugestoes = useMemo(() => {
    if (termo.length < 2) return [];

    const pontuadas: { m: MunicipioBr; p: number }[] = [];
    for (const m of todos) {
      const n = normalizar(m.nome);
      let p = -1;
      if (n === termo) p = 0;
      else if (n.startsWith(termo)) p = 1;
      else if (n.includes(termo)) p = 2;
      if (p >= 0) pontuadas.push({ m, p });
      if (pontuadas.length > 400) break; // corta cedo em termos muito genéricos
    }

    return pontuadas
      .sort((a, b) => a.p - b.p || a.m.nome.length - b.m.nome.length)
      .slice(0, 10)
      .map((x) => x.m);
  }, [termo, todos]);

  const mostrandoRecentes = termo.length < 2 && recentes.length > 0;
  const lista: Cidade[] = mostrandoRecentes ? recentes : sugestoes;

  function escolher(c: Cidade) {
    setTexto(c.nome);
    setAberto(false);
    salvarRecente(c);
    aoEscolher(c);
  }

  /**
   * Se o texto digitado bate com exatamente UMA cidade, aceita sem clique.
   * Antes, digitar "Uberlândia" e apertar Buscar dava "escolha a cidade na
   * lista", o que parecia bug.
   */
  function tentarResolverSozinho() {
    if (!termo || valor) return;
    const exatas = todos.filter((m) => normalizar(m.nome) === termo);
    if (exatas.length === 1) escolher(exatas[0]);
  }

  function limpar() {
    setTexto("");
    aoEscolher(null);
    entradaRef.current?.focus();
    setAberto(true);
  }

  return (
    <div ref={caixaRef} className={`relative ${className}`}>
      <input
        ref={entradaRef}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setDestaque(0);
          setAberto(true);
          if (valor) aoEscolher(null);
        }}
        onFocus={() => setAberto(true)}
        onBlur={tentarResolverSozinho}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            setAberto(true);
            return;
          }
          if (!aberto || lista.length === 0) {
            if (e.key === "Enter") tentarResolverSozinho();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setDestaque((d) => (d + 1) % lista.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setDestaque((d) => (d - 1 + lista.length) % lista.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(lista[destaque]);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
        placeholder={placeholder}
        className={`campo pr-16 ${valor ? "border-[var(--verde)]/40" : ""}`}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls="lista-cidades"
        aria-autocomplete="list"
      />

      {/* Estado à direita do campo: UF confirmada, limpar, ou carregando. */}
      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {valor && (
          <>
            <span className="rounded bg-[var(--verde-fraco)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--verde)]">
              {valor.uf}
            </span>
            <button
              type="button"
              onClick={limpar}
              aria-label="Limpar cidade"
              className="pointer-events-auto rounded p-0.5 text-[var(--texto-3)] hover:text-[var(--texto)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
        {!valor && carregando && (
          <span className="text-[11px] text-[var(--texto-3)]">carregando…</span>
        )}
      </div>

      {aberto && (lista.length > 0 || (termo.length >= 2 && !carregando)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[10px] border border-[var(--linha)] bg-[var(--fundo-2)]">
          {mostrandoRecentes && (
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-[var(--texto-3)]">
              Usadas recentemente
            </p>
          )}

          {lista.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-[var(--texto-3)]">
              Nenhuma cidade com esse nome.
            </p>
          ) : (
            <ul id="lista-cidades" className="max-h-72 overflow-y-auto py-1">
              {lista.map((m, i) => (
                <li key={`${m.nome}-${m.uf}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setDestaque(i)}
                    onMouseDown={(e) => e.preventDefault()} // não deixa o blur fechar antes do clique
                    onClick={() => escolher(m)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[14px] ${
                      i === destaque ? "bg-[var(--superficie-2)]" : ""
                    }`}
                  >
                    <span>{m.nome}</span>
                    <span className="text-[12px] text-[var(--texto-3)]">{m.uf}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
