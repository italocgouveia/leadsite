import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Porteiro do painel.
 *
 * Dois modos, nesta ordem:
 *
 * 1. Google configurado (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) → exige sessão
 *    válida. Quem não tem, vai para /entrar.
 *
 * 2. Google ausente → cai na senha (Basic Auth), como antes.
 *
 * O modo 2 existe de propósito: se o login com Google quebrar ou as
 * credenciais saírem por engano, você continua entrando no seu próprio painel
 * em vez de ficar trancado do lado de fora.
 *
 * `/s/*` fica FORA de tudo — é o link público que o cliente abre.
 */

/**
 * `/api/externo/` fica fora da sessão porque autentica por TOKEN — ferramenta
 * de automação não faz login com Google. A própria rota valida o token; se ele
 * não estiver configurado, ela recusa tudo.
 */
const PUBLICO = ["/s/", "/entrar", "/api/auth/", "/api/externo/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLICO.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const googleAtivo = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  if (googleAtivo) {
    /**
     * `getToken` VERIFICA A ASSINATURA do JWT, não só a existência do cookie.
     *
     * A primeira versão disto checava apenas `cookies.has(...)` — o que aceita
     * qualquer cookie forjado com o nome certo. Como nenhuma página chama
     * `auth()`, não havia segunda linha de defesa: era um buraco aberto.
     */
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: request.nextUrl.protocol === "https:",
    });

    if (token?.email) return NextResponse.next();

    // API responde 401; navegação vai para a tela de login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/entrar", request.url));
  }

  // --- modo senha ---
  const senha = process.env.APP_PASSWORD;
  if (!senha) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [, valor] = atob(header.slice(6)).split(":");
    if (valor === senha) return NextResponse.next();
  }

  return new NextResponse("Acesso restrito", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ICG Tech"' },
  });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
