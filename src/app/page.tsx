"use client";

import { useEffect, useRef, useState } from "react";
import type { Lead } from "@/lib/db/schema";
import { ehOportunidade } from "@/lib/oportunidade";
import { CATEGORIAS } from "@/lib/categorias";
import CampoCidade from "@/components/campo-cidade";
import CartaoLead from "@/components/cartao-lead";
import ModalProposta from "@/components/modal-proposta";

type Filtro = "melhores" | "sem-site" | "site-ruim" | "todos";

/**
 * Enquanto a busca roda, o texto vai mudando conforme o que realmente
 * acontece no servidor: consulta ao mapa, checagem de site por HTTP, cálculo
 * de oportunidade. Uma barra parada por 20 segundos parece travamento.
 */
const PASSOS = [
  "Procurando empresas…",
  "Analisando presença digital…",
  "Verificando se os sites respondem…",
  "Calculando as melhores oportunidades…",
];

export default function Buscar() {
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState<{ nome: string; uf: string } | null>(null);
  const [bairro, setBairro] = useState("");
  const [quantidade, setQuantidade] = useState(20);

  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [comWhatsapp, setComWhatsapp] = useState(false);
  const [comInstagram, setComInstagram] = useState(false);

  const [carregando, setCarregando] = useState(false);
  const [passo, setPasso] = useState(0);
  const [resultados, setResultados] = useState<Lead[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("melhores");
  const [proposta, setProposta] = useState<Lead | null>(null);

  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!carregando) return;
    const t = setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1)), 4000);
    return () => clearInterval(t);
  }, [carregando]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setPasso(0);
    setErro(null);
    setAviso(null);
    try {
      if (!cidade) throw new Error("Escolha a cidade na lista — é ela que define o estado.");

      const res = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho,
          cidade: cidade.nome,
          estado: cidade.uf,
          bairro,
          quantidade,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Erro na busca");

      let lista: Lead[] = [...data.leads].sort((a, b) => b.score - a.score);
      if (comWhatsapp) lista = lista.filter((l) => l.whatsapp);
      if (comInstagram) lista = lista.filter((l) => l.instagram);

      setResultados(lista);
      setAviso(data.aviso ?? null);
      setFiltro("melhores");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  const lista = resultados ?? [];
  const contagem = {
    melhores: lista.filter(ehOportunidade).length,
    semSite: lista.filter((l) => l.statusSite === "sem-site" || l.statusSite === "nao-verificado")
      .length,
    ruim: lista.filter((l) =>
      ["site-fora-do-ar", "sem-ssl", "so-agregador", "so-rede-social"].includes(l.statusSite),
    ).length,
    todos: lista.length,
  };

  const visiveis = lista.filter((l) => {
    if (filtro === "todos") return true;
    if (filtro === "melhores") return ehOportunidade(l);
    if (filtro === "sem-site")
      return l.statusSite === "sem-site" || l.statusSite === "nao-verificado";
    return ["site-fora-do-ar", "sem-ssl", "so-agregador", "so-rede-social"].includes(
      l.statusSite,
    );
  });

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-20 lg:pt-14">
      <header className="mb-8 text-center">
        <h1 className="text-[32px] font-semibold leading-tight sm:text-[38px]">
          Encontrar novos clientes
        </h1>
        <p className="mt-2 text-[15px] text-[var(--texto-2)]">
          Encontre empresas que podem precisar de um site.
        </p>
      </header>

      <form onSubmit={buscar} className="surgir mx-auto max-w-3xl">
        <div className="cartao flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="shrink-0 text-[var(--texto-3)]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={campoRef}
              required
              list="categorias"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              placeholder="O que você procura? Oficina, dentista, restaurante…"
              className="w-full border-0 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-[var(--texto-3)]"
            />
            <datalist id="categorias">
              {CATEGORIAS.map((c) => (
                <option key={c.termo} value={c.termo} />
              ))}
            </datalist>
          </div>

          <div className="hidden h-6 w-px bg-[var(--linha)] sm:block" />

          <CampoCidade
            valor={cidade}
            aoEscolher={setCidade}
            placeholder="Cidade"
            className="min-w-0 sm:w-56"
          />

          <button type="submit" disabled={carregando} className="btn-primario btn-g">
            {carregando ? "Buscando…" : "Encontrar leads"}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            className="text-[13px] text-[var(--texto-2)] hover:text-[var(--texto)]"
          >
            {filtrosAbertos ? "Ocultar filtros" : "Filtros"}
          </button>
        </div>

        {filtrosAbertos && (
          <div className="surgir cartao mt-3 grid gap-4 p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[13px] text-[var(--texto-2)]">Bairro</label>
              <input
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Opcional"
                className="campo"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] text-[var(--texto-2)]">
                Quantidade
              </label>
              <select
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="campo"
              >
                {[20, 40, 60].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-[13px] text-[var(--texto-2)]">
                <input
                  type="checkbox"
                  checked={comWhatsapp}
                  onChange={(e) => setComWhatsapp(e.target.checked)}
                  className="h-4 w-4 accent-[var(--azul)]"
                />
                Só com WhatsApp
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[var(--texto-2)]">
                <input
                  type="checkbox"
                  checked={comInstagram}
                  onChange={(e) => setComInstagram(e.target.checked)}
                  className="h-4 w-4 accent-[var(--azul)]"
                />
                Só com Instagram
              </label>
            </div>
          </div>
        )}
      </form>

      {carregando && (
        <section className="mt-10">
          <p className="mb-4 text-center text-[14px] text-[var(--texto-2)]">{PASSOS[passo]}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="esqueleto h-56" />
            ))}
          </div>
        </section>
      )}

      {erro && (
        <p className="mt-8 rounded-[10px] bg-[var(--vermelho-fraco)] px-4 py-3 text-[14px] text-[var(--vermelho)]">
          {erro}
        </p>
      )}

      {!carregando && resultados && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[19px] font-semibold">
              {lista.length === 0
                ? "Nenhuma empresa encontrada"
                : `Encontramos ${lista.length} empresa${lista.length > 1 ? "s" : ""}`}
            </h2>
          </div>

          {aviso && (
            <p className="mb-4 rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-3 text-[14px] text-[var(--ambar)]">
              {aviso}
            </p>
          )}

          {lista.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {(
                [
                  ["melhores", `Melhores oportunidades (${contagem.melhores})`],
                  ["sem-site", `Sem site (${contagem.semSite})`],
                  ["site-ruim", `Site ruim (${contagem.ruim})`],
                  ["todos", `Todos (${contagem.todos})`],
                ] as [Filtro, string][]
              ).map(([v, r]) => (
                <button
                  key={v}
                  onClick={() => setFiltro(v)}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
                    filtro === v
                      ? "bg-[var(--azul)] text-white"
                      : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((lead) => (
              <CartaoLead key={lead.id} lead={lead} aoProposta={() => setProposta(lead)} />
            ))}
          </div>

          {visiveis.length === 0 && lista.length > 0 && (
            <p className="cartao py-16 text-center text-[15px] text-[var(--texto-2)]">
              Nenhuma empresa neste filtro.
            </p>
          )}
        </section>
      )}

      {proposta && (
        <ModalProposta
          lead={proposta}
          aoFechar={() => setProposta(null)}
          aoEnviar={() => {
            setResultados(
              (r) =>
                r?.map((l) =>
                  l.id === proposta.id ? { ...l, etapa: "proposta", noCrm: true } : l,
                ) ?? null,
            );
          }}
        />
      )}
    </main>
  );
}
