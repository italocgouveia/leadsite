"use client";

import { useState } from "react";
import type { Site } from "@/lib/db/schema";

export type Versao = {
  id: string;
  versao: number;
  prompt: string | null;
  criadoEm: Date;
};

export default function Editor({
  siteInicial,
  versoesIniciais,
}: {
  siteInicial: Site;
  versoesIniciais: Versao[];
}) {
  const [site, setSite] = useState(siteInicial);
  const [versoes, setVersoes] = useState(versoesIniciais);
  const [pedido, setPedido] = useState("");
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slug, setSlug] = useState(siteInicial.slug);
  const [copiado, setCopiado] = useState(false);

  async function recarregarVersoes() {
    const res = await fetch(`/api/sites/versions?siteId=${site.id}`);
    if (res.ok) {
      const data = await res.json();
      setVersoes(data.versoes ?? []);
    }
  }

  async function editar(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido.trim()) return;
    setEditando(true);
    setErro(null);
    try {
      const res = await fetch("/api/sites/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id, pedido }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Falha ao editar");
      setSite(data.site);
      setPedido("");
      await recarregarVersoes();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setEditando(false);
    }
  }

  async function restaurar(versao: number) {
    const res = await fetch("/api/sites/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, versao }),
    });
    if (res.ok) {
      const data = await res.json();
      setSite(data.site);
      await recarregarVersoes();
    }
  }

  async function publicar(publicado: boolean) {
    const res = await fetch("/api/sites/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, slug, publicado }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.erro ?? "Falha ao publicar");
      return;
    }
    setSite(data.site);
    setErro(null);
  }

  function copiarUrl() {
    navigator.clipboard.writeText(`${window.location.origin}/s/${site.slug}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <section className="cartao-apple p-5">
            <h2 className="mb-3 font-semibold tracking-tight text-[var(--texto)]">Editar conversando</h2>
            <form onSubmit={editar}>
              <textarea
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                rows={4}
                placeholder="Ex: deixa o botão do WhatsApp verde e maior; troca o título por 'Comida caseira todo dia'"
                className="campo-apple"
              />
              <button
                type="submit"
                disabled={editando || !pedido.trim()}
                className="mt-2 btn-primario w-full"
              >
                {editando ? "Aplicando…" : "Aplicar alteração"}
              </button>
            </form>
            {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
          </section>

          <section className="cartao-apple p-5">
            <h2 className="mb-3 font-semibold tracking-tight text-[var(--texto)]">Publicar</h2>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Endereço do site</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-[var(--texto-2)]">/s/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="min-w-0 flex-1 rounded-lg border border-[var(--linha)] px-2 py-1.5 outline-none focus:border-[var(--azul)]"
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => publicar(!site.publicado)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
                  site.publicado
                    ? "border border-[var(--linha)] text-[var(--texto)] hover:bg-[var(--superficie)]"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {site.publicado ? "Despublicar" : "Publicar"}
              </button>
              {site.publicado && (
                <button
                  onClick={copiarUrl}
                  className="rounded-lg border border-[var(--linha)] px-4 py-2 text-sm text-[var(--texto)] hover:bg-[var(--superficie)]"
                >
                  {copiado ? "Copiado!" : "Copiar URL"}
                </button>
              )}
            </div>

            {site.publicado && (
              <p className="mt-2 break-all text-xs text-emerald-700">
                Publicado em <code>/s/{site.slug}</code>
              </p>
            )}
          </section>

          <section className="cartao-apple p-5">
            <h2 className="mb-3 font-semibold tracking-tight text-[var(--texto)]">
              Histórico de versões{" "}
              <span className="text-xs font-normal text-[var(--texto-2)]">({versoes.length})</span>
            </h2>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {versoes.map((v, i) => (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--superficie)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--texto)]">
                      v{v.versao}
                      {i === 0 && <span className="ml-1 text-xs text-emerald-600">atual</span>}
                    </p>
                    <p className="truncate text-[13px] text-[var(--texto-2)]">
                      {v.prompt ?? "Geração inicial"}
                    </p>
                  </div>
                  {i !== 0 && (
                    <button
                      onClick={() => restaurar(v.versao)}
                      className="shrink-0 rounded border border-[var(--linha)] px-2 py-1 text-xs text-[var(--texto-2)] hover:bg-[var(--superficie-2)]"
                    >
                      Voltar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="overflow-hidden cartao-apple">
          <div className="flex items-center gap-2 border-b border-[var(--linha)] px-4 py-2">
            <span className="text-[13px] text-[var(--texto-2)]">Prévia</span>
          </div>
          <iframe
            title="Prévia do site"
            srcDoc={site.html}
            sandbox="allow-scripts"
            className="h-[calc(100vh-14rem)] w-full"
          />
        </section>
      </div>
    </main>
  );
}
