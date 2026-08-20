import { NextResponse } from "next/server";
import { urlDeRetorno } from "@/lib/auth/google";

/**
 * Passo 1 do OAuth: manda pro consentimento do Google.
 *
 * O `state` vai junto num cookie curto. Ele carrega duas coisas: pra onde
 * voltar depois do login e um nonce que o callback confere — sem isso, qualquer
 * um poderia te empurrar um `code` de outra conta.
 */
export function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/entrar?erro=sem-config", request.url));
  }

  const destino = new URL(request.url).searchParams.get("destino") || "/";
  const nonce = crypto.randomUUID();

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", clientId);
  google.searchParams.set("redirect_uri", urlDeRetorno(request));
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", nonce);
  // Sem refresh token: a sessão é nossa, o Google só diz quem é você uma vez.
  google.searchParams.set("prompt", "select_account");

  const resposta = NextResponse.redirect(google);
  resposta.cookies.set("leadsite_oauth", `${nonce}|${destino}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return resposta;
}
