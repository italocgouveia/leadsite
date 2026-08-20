import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { emailDoCodigo, urlDeRetorno } from "@/lib/auth/google";
import {
  COOKIE_SESSAO,
  criarToken,
  emailsPermitidos,
  opcoesCookie,
} from "@/lib/auth/sessao";

/** Passo 2 do OAuth: o Google volta pra cá com o `code`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // O cookie guarda "nonce|destino"; o destino pode ter query string, então
  // corta só na primeira barra.
  const guardado = (await cookies()).get("leadsite_oauth")?.value ?? "";
  const corte = guardado.indexOf("|");
  const nonce = corte === -1 ? guardado : guardado.slice(0, corte);
  const destino = corte === -1 ? "/" : guardado.slice(corte + 1);

  if (!code || !state || !nonce || state !== nonce) return falhou(request, "estado");

  // Lista vazia liberaria o painel pra qualquer conta Google: barra antes de
  // gastar a viagem até o Google.
  const permitidos = emailsPermitidos();
  if (permitidos.length === 0) return falhou(request, "sem-lista");

  const email = await emailDoCodigo(code, urlDeRetorno(request));
  if (!email) return falhou(request, "google");
  if (!permitidos.includes(email)) return falhou(request, "nao-permitido");

  const resposta = NextResponse.redirect(new URL(destinoSeguro(destino), request.url));
  resposta.cookies.set(
    COOKIE_SESSAO,
    await criarToken(email, "google"),
    opcoesCookie(process.env.NODE_ENV === "production"),
  );
  resposta.cookies.delete("leadsite_oauth");
  return resposta;
}

function falhou(request: Request, erro: string) {
  const resposta = NextResponse.redirect(
    new URL(`/entrar?erro=${erro}`, request.url),
  );
  resposta.cookies.delete("leadsite_oauth");
  return resposta;
}

/** Só caminho interno: `?destino=https://outro.site` viraria open redirect. */
function destinoSeguro(destino: string) {
  return destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";
}
