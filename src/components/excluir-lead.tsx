"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Remover lead de vez, usado em todas as telas.
 *
 * A confirmação NÃO pergunta "tem certeza?". Ela consulta o servidor primeiro
 * e diz o que vai junto: "isso apaga 2 sites, 1 deles no ar". A diferença
 * entre apagar um lead cru e apagar um lead com site publicado é enorme, e
 * caixa nativa do navegador não consegue mostrar isso.
 *
 * Existe de propósito ao lado de "Descartar", que é o caminho barato: aquele
 * marca como perdido e o lead volta pelo Pipeline. Este não volta.
 */

type Dependentes = {
  sites: number;
  sitesPublicados: number;
  scripts: number;
  logos: number;
};

export type EstiloExcluir = "icone" | "texto";

export default function ExcluirLead({
  id,
  nome,
  estilo = "icone",
  aoExcluir,
}: {
  id: string;
  nome: string;
  estilo?: EstiloExcluir;
  /** Chamado depois que o servidor confirmou. A tela decide o que fazer. */
  aoExcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [dep, setDep] = useState<Dependentes | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = useCallback(async () => {
    setAberto(true);
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch(`/api/leads/${id}`);
      if (res.ok) setDep((await res.json()).dependentes ?? null);
    } catch {
      // Sem a contagem o modal ainda funciona; só fica mais genérico.
      setDep(null);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !excluindo) setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, excluindo]);

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const c = await res.json().catch(() => null);
        throw new Error(c?.erro ?? "Falhou");
      }
      setAberto(false);
      aoExcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui excluir.");
    } finally {
      setExcluindo(false);
    }
  }

  const temSite = (dep?.sites ?? 0) > 0;

  return (
    <>
      <button
        onClick={abrir}
        title={`Excluir ${nome} da base — não tem volta`}
        aria-label={`Excluir ${nome}`}
        className={estilo === "icone" ? "btn-excluir" : "btn-secundario"}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
        </svg>
        {estilo === "texto" && "Excluir lead"}
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => !excluindo && setAberto(false)}
        >
          <div
            className="cartao w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-[19px] font-semibold">Excluir {nome}?</h2>

            {carregando ? (
              <p className="mt-4 text-[14px] text-[var(--texto-2)]">
                Conferindo o que vai junto…
              </p>
            ) : (
              <ul className="mt-4 space-y-2 text-[14px] text-[var(--texto-2)]">
                <li>
                  O contato, o histórico, as anotações e a etapa no funil são
                  apagados. <strong className="text-[var(--texto)]">Não tem lixeira.</strong>
                </li>

                {temSite && (
                  <li className="rounded-[10px] bg-[var(--vermelho-fraco)] px-3 py-2.5 text-[var(--vermelho)]">
                    {dep!.sites === 1 ? "1 site gerado vai junto" : `${dep!.sites} sites gerados vão junto`}
                    {dep!.sitesPublicados > 0 && (
                      <>
                        {" "}— <strong>
                          {dep!.sitesPublicados === 1
                            ? "1 está no ar e o link para de funcionar"
                            : `${dep!.sitesPublicados} estão no ar e os links param de funcionar`}
                        </strong>
                      </>
                    )}
                    .
                  </li>
                )}

                {(dep?.scripts ?? 0) > 0 && (
                  <li>{dep!.scripts} script(s) de abordagem também somem.</li>
                )}
                {(dep?.logos ?? 0) > 0 && <li>{dep!.logos} logo(s) gerado(s) também somem.</li>}

                <li className="text-[var(--texto-3)]">
                  Se você só quer tirar da fila de hoje, use{" "}
                  <strong className="text-[var(--texto-2)]">Descartar</strong> — ali o
                  lead vai para &quot;Perdido&quot; e dá para trazer de volta.
                </li>
              </ul>
            )}

            {erro && (
              <p className="mt-4 rounded-[10px] bg-[var(--vermelho-fraco)] px-3 py-2.5 text-[13px] text-[var(--vermelho)]">
                {erro}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={excluir} disabled={excluindo || carregando} className="btn-perigo">
                {excluindo ? "Excluindo…" : "Excluir definitivamente"}
              </button>
              <button
                onClick={() => setAberto(false)}
                disabled={excluindo}
                className="btn-secundario ml-auto"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
