import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, sites, leads } from "@/lib/db";
import CopiarLink from "./copiar-link";
import ExcluirSite from "./excluir-site";

export const dynamic = "force-dynamic";

const ROTULO_MODELO: Record<string, string> = {
  simples: "Simples",
  completo: "Completo",
  animado: "Animado",
};

export default async function MeusSites() {
  let lista;
  try {
    lista = await db
      .select({
        id: sites.id,
        slug: sites.slug,
        publicado: sites.publicado,
        modelo: sites.modelo,
        html: sites.html,
        atualizadoEm: sites.atualizadoEm,
        leadNome: leads.nome,
        leadCidade: leads.cidade,
        leadCategoria: leads.categoria,
        /**
         * Subconsulta em vez de join+group: o join com versions multiplicaria
         * as linhas e obrigaria a agrupar por todas as colunas acima.
         *
         * Escrita com alias e nomes crus de propósito. Interpolando as colunas
         * do Drizzle (`${siteVersions.siteId} = ${sites.id}`) ele gera
         * `where "site_id" = "id"` SEM qualificar a tabela — e aí, dentro da
         * subconsulta, `"id"` casa com `site_versions.id`, não com o site de
         * fora. A contagem dava 0 sempre.
         */
        versoes: sql<number>`(
          select count(*)::int from "site_versions" sv
          where sv."site_id" = "sites"."id"
        )`,
      })
      .from(sites)
      .innerJoin(leads, eq(sites.leadId, leads.id))
      .orderBy(desc(sites.atualizadoEm));
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-[28px] font-semibold tracking-tight">Banco não conectado</h1>
        <p className="mt-3 text-[15px] text-[var(--texto-2)]">
          Configure a DATABASE_URL e rode <code>npm run db:push</code>.
        </p>
      </main>
    );
  }

  const publicados = lista.filter((s) => s.publicado).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[40px] font-semibold leading-none">Meus sites</h1>
          <p className="mt-2.5 text-[15px] text-[var(--texto-2)]">
            {lista.length} site(s) · {publicados} publicado(s)
          </p>
        </div>
        <Link href="/sites/novo" className="btn-primario shrink-0">
          Criar site
        </Link>
      </header>

      {lista.length === 0 ? (
        <div className="cartao-apple py-24 text-center">
          <p className="text-[17px]">Nenhum site ainda.</p>
          <p className="mt-2 text-[15px] text-[var(--texto-2)]">
            Gere um a partir de um lead, ou{" "}
            <Link href="/sites/novo" className="text-[var(--azul)]">
              crie para um negócio fora da busca ›
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((site) => (
            <article key={site.id} className="cartao-apple overflow-hidden">
              {/* Miniatura real do site, renderizada do próprio HTML salvo.
                  sandbox sem allow-scripts: é só preview, não precisa rodar JS. */}
              <div className="relative h-44 overflow-hidden bg-[var(--superficie)]">
                <iframe
                  title={`Prévia de ${site.leadNome}`}
                  srcDoc={site.html}
                  sandbox=""
                  scrolling="no"
                  tabIndex={-1}
                  className="pointer-events-none absolute left-0 top-0 h-[1000px] w-[1400px] origin-top-left"
                  style={{ transform: "scale(0.29)" }}
                />
                <span
                  className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    site.publicado
                      ? "bg-[var(--verde-fraco)] text-[var(--verde)]"
                      : "bg-[var(--superficie-2)] text-[var(--texto-2)]"
                  }`}
                >
                  {site.publicado ? "Publicado" : "Rascunho"}
                </span>
              </div>

              <div className="p-5">
                <h2 className="truncate text-[17px] font-semibold tracking-tight">
                  {site.leadNome}
                </h2>
                <p className="mt-1 truncate text-[13px] text-[var(--texto-2)]">
                  {site.leadCategoria} · {site.leadCidade} ·{" "}
                  {ROTULO_MODELO[site.modelo] ?? site.modelo}
                </p>

                <div className="mt-4 flex flex-wrap items-stretch gap-2">
                  <Link
                    href={`/sites/${site.id}`}
                    className="btn-primario min-w-0 flex-1 text-center"
                  >
                    Abrir
                  </Link>
                  {site.publicado && <CopiarLink slug={site.slug} />}
                  <ExcluirSite
                    id={site.id}
                    nome={site.leadNome}
                    slug={site.slug}
                    publicado={site.publicado}
                    versoes={site.versoes}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
