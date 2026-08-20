"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Excluir site.
 *
 * Não usa `confirm()` do navegador de propósito: a caixa nativa não consegue
 * dizer o que está em jogo, e aqui a diferença entre apagar um rascunho e
 * apagar um site publicado (que derruba o link que o cliente já tem) é o
 * ponto inteiro.
 *
 * Por isso o modal:
 *  - nomeia o site que vai sumir, em vez de perguntar "tem certeza?";
 *  - avisa que as versões vão junto, porque não existe lixeira;
 *  - oferece DESPUBLICAR quando o site está no ar — quase sempre é isso que a
 *    pessoa quer: tirar do ar sem jogar o trabalho fora.
 */
export default function ExcluirSite({
  id,
  nome,
  slug,
  publicado,
  versoes,
}: {
  id: string;
  nome: string;
  slug: string;
  publicado: boolean;
  versoes: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<"excluir" | "despublicar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) setAberto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, ocupado]);

  async function excluir() {
    setOcupado("excluir");
    setErro(null);
    try {
      const res = await fetch(`/api/sites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        throw new Error(corpo?.erro ?? "Falhou");
      }
      setAberto(false);
      // A lista é server component: `refresh` refaz a consulta no servidor.
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui excluir.");
    } finally {
      setOcupado(null);
    }
  }

  async function despublicar() {
    setOcupado("despublicar");
    setErro(null);
    try {
      const res = await fetch("/api/sites/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: id, publicado: false }),
      });
      if (!res.ok) throw new Error("Não consegui despublicar.");
      setAberto(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui despublicar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title={`Excluir o site de ${nome}`}
        aria-label={`Excluir o site de ${nome}`}
        className="btn-excluir"
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
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => !ocupado && setAberto(false)}
        >
          <div
            className="cartao w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`excluir-titulo-${id}`}
          >
            <h2 id={`excluir-titulo-${id}`} className="text-[19px] font-semibold">
              Excluir o site de {nome}?
            </h2>

            <ul className="mt-4 space-y-2 text-[14px] text-[var(--texto-2)]">
              <li>
                O HTML e{" "}
                {versoes > 1 ? (
                  <strong className="text-[var(--texto)]">
                    as {versoes} versões do histórico
                  </strong>
                ) : (
                  "o histórico"
                )}{" "}
                são apagados. Não tem lixeira.
              </li>
              {publicado && (
                <li className="rounded-[10px] bg-[var(--vermelho-fraco)] px-3 py-2.5 text-[var(--vermelho)]">
                  Este site está <strong>no ar</strong>. O link{" "}
                  <code className="text-[13px]">/s/{slug}</code> vai parar de
                  funcionar para quem já tem ele.
                </li>
              )}
              <li>
                O lead <strong className="text-[var(--texto)]">{nome}</strong> continua
                na sua base — some só o site.
              </li>
            </ul>

            {erro && (
              <p className="mt-4 rounded-[10px] bg-[var(--vermelho-fraco)] px-3 py-2.5 text-[13px] text-[var(--vermelho)]">
                {erro}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={excluir}
                disabled={ocupado !== null}
                className="btn-perigo"
              >
                {ocupado === "excluir" ? "Excluindo…" : "Excluir definitivamente"}
              </button>

              {publicado && (
                <button
                  onClick={despublicar}
                  disabled={ocupado !== null}
                  className="btn-secundario"
                  title="Tira do ar mas guarda o site e o histórico"
                >
                  {ocupado === "despublicar" ? "Tirando…" : "Só tirar do ar"}
                </button>
              )}

              <button
                onClick={() => setAberto(false)}
                disabled={ocupado !== null}
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
