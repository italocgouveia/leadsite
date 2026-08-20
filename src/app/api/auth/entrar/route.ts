import { NextResponse } from "next/server";
import { COOKIE_SESSAO, criarToken, opcoesCookie } from "@/lib/auth/sessao";

/** Login por senha. Uma senha só, a do `.env` — o app é de um usuário só. */
export async function POST(request: Request) {
  const esperada = process.env.APP_PASSWORD;
  if (!esperada) {
    return NextResponse.json(
      { erro: "Login por senha não está configurado." },
      { status: 400 },
    );
  }

  const { senha } = (await request.json().catch(() => ({}))) as { senha?: string };
  if (senha !== esperada) {
    return NextResponse.json({ erro: "Senha incorreta." }, { status: 401 });
  }

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(
    COOKIE_SESSAO,
    await criarToken("senha", "senha"),
    opcoesCookie(process.env.NODE_ENV === "production"),
  );
  return resposta;
}
