import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/lib/auth/sessao";

/**
 * Sair. É GET porque o menu usa um link comum — não tem CSRF que valha aqui:
 * o pior que alguém consegue forçando essa URL é te deslogar.
 */
export async function GET(request: Request) {
  const resposta = NextResponse.redirect(new URL("/entrar", request.url));
  resposta.cookies.delete(COOKIE_SESSAO);
  return resposta;
}
