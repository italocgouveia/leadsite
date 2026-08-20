"use client";

import { useState } from "react";

export default function Formulario({
  destino,
  temSenha,
  temGoogle,
  erroInicial,
}: {
  destino: string;
  temSenha: boolean;
  temGoogle: boolean;
  erroInicial: string | null;
}) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/auth/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (!resposta.ok) {
        const { erro } = await resposta.json().catch(() => ({ erro: "" }));
        setErro(erro || "Senha incorreta.");
        return;
      }
      // `replace` e não `push`: o botão voltar não deve trazer a tela de login
      // de volta depois de logado. Recarrega inteiro pro proxy ver o cookie.
      window.location.replace(destino);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-[var(--linha)] bg-[var(--superficie)] p-5">
      {temGoogle && (
        <>
          <a
            href={`/api/auth/google?destino=${encodeURIComponent(destino)}`}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[9px] border border-[var(--linha-forte)] text-[14px] font-medium transition-colors hover:bg-[var(--superficie-2)]"
          >
            <LogoGoogle />
            Entrar com Google
          </a>

          {temSenha && (
            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--texto-3)]">
              <span className="h-px flex-1 bg-[var(--linha)]" />
              ou
              <span className="h-px flex-1 bg-[var(--linha)]" />
            </div>
          )}
        </>
      )}

      {temSenha && (
        <form onSubmit={entrar} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-[var(--texto-2)]">
              Senha do painel
            </span>
            <input
              type="password"
              autoFocus={!temGoogle}
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-10 w-full rounded-[9px] border border-[var(--linha)] bg-[var(--fundo-2)] px-3 text-[14px] outline-none focus:border-[var(--azul)]"
            />
          </label>

          <button
            type="submit"
            disabled={enviando || !senha}
            className="h-10 w-full rounded-[9px] bg-[var(--azul)] text-[14px] font-medium text-white transition-opacity hover:bg-[var(--azul-escuro)] disabled:opacity-40"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      )}

      {!temSenha && !temGoogle && (
        <p className="text-[13px] text-[var(--texto-2)]">
          Nenhum método de login configurado. Preencha <code>APP_PASSWORD</code> ou
          as chaves do Google no ambiente.
        </p>
      )}

      {erro && (
        <p className="mt-3 rounded-[9px] bg-[var(--vermelho-fraco)] px-3 py-2 text-[13px] text-[var(--vermelho)]">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Marca do Google, quatro cores fixas — é a única exceção à regra de cor. */
function LogoGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.8-1.5 4.6-4.4 6.4l6.7 5.2C42.2 35.1 45 30 45 24Z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41.1 15.4 46 24 46Z" />
      <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.1-5.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.4 9.9l7.1-5.4Z" />
      <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.4 29.9 1 24 1 15.4 1 8.1 6 4.4 14.1l7.1 5.5C13.3 14.3 18.2 9.5 24 9.5Z" />
    </svg>
  );
}
