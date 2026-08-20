import { redirect } from "next/navigation";
import { auth, googleAtivo } from "@/auth";
import { entrarComGoogle } from "./acoes";

export const dynamic = "force-dynamic";

/** Mensagens do Auth.js traduzidas — o padrão vem em inglês e técnico. */
const ERROS: Record<string, string> = {
  AccessDenied:
    "Esta conta Google não tem acesso ao painel. Verifique se o e-mail está em GOOGLE_EMAILS_PERMITIDOS.",
  Configuration:
    "O login com Google não está configurado corretamente. Confira GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
  Verification: "O link expirou. Tente entrar de novo.",
  OAuthAccountNotLinked: "Esse e-mail já entrou por outro método.",
  default: "Não consegui completar o login. Tente de novo.",
};

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sessao = await auth();
  if (sessao?.user) redirect("/");

  const { error } = await searchParams;
  const mensagem = error ? (ERROS[error] ?? ERROS.default) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        {/* marca */}
        <div className="mb-9 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[13px] border border-[var(--linha)] bg-[var(--superficie)] text-[19px] font-bold tracking-tighter">
            <span className="text-[var(--azul)]">i</span>CG
          </span>
          <h1 className="text-[26px] font-semibold leading-tight">ICG TECH</h1>
          <p className="mt-1.5 text-[15px] text-[var(--texto-2)]">
            Painel de prospecção
          </p>
        </div>

        <div className="cartao p-6">
          {mensagem && (
            <p className="mb-5 rounded-[10px] bg-[var(--vermelho-fraco)] px-4 py-3 text-[13px] text-[var(--vermelho)]">
              {mensagem}
            </p>
          )}

          {googleAtivo ? (
            <>
              <form action={entrarComGoogle}>
                <button type="submit" className="btn-primario btn-g w-full">
                  <LogoGoogle />
                  Continuar com Google
                </button>
              </form>

              <p className="mt-5 text-center text-[13px] leading-relaxed text-[var(--texto-3)]">
                Acesso restrito às contas autorizadas da ICG Tech.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <h2 className="text-[16px] font-semibold">Google ainda não configurado</h2>
              <p className="text-[14px] leading-relaxed text-[var(--texto-2)]">
                Enquanto <code className="text-[var(--texto)]">GOOGLE_CLIENT_ID</code> e{" "}
                <code className="text-[var(--texto)]">GOOGLE_CLIENT_SECRET</code> não
                estiverem definidas, o painel continua protegido pela senha —
                você não fica trancado para fora.
              </p>
              <p className="text-[14px] leading-relaxed text-[var(--texto-2)]">
                Para ligar o login com Google, veja o passo a passo no{" "}
                <code className="text-[var(--texto)]">README.md</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** Logo oficial do Google — as quatro cores são parte da marca deles. */
function LogoGoogle() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.14-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 40.2 44 35 44 24c0-1.3-.14-2.4-.4-3.5z"
      />
    </svg>
  );
}
