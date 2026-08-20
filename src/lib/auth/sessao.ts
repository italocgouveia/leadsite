/**
 * Sessão assinada em cookie. Sem biblioteca, sem tabela.
 *
 * O cookie é `payload.assinatura`, os dois em base64url, assinados com
 * HMAC-SHA256. Só Web Crypto, porque isso roda no proxy (edge) e lá não existe
 * `node:crypto`. Não dá pra forjar sem o segredo e não dá pra estender a
 * validade: o `exp` está dentro do que foi assinado.
 *
 * Continua single-user: o `sub` só serve pra mostrar quem entrou e pra saber se
 * o login veio da senha ou do Google.
 */

export const COOKIE_SESSAO = "leadsite_sessao";

/** 30 dias. Painel interno, ninguém quer digitar senha toda hora. */
const DURACAO_S = 60 * 60 * 24 * 30;

type Sessao = { sub: string; via: "senha" | "google"; exp: number };

/**
 * `AUTH_SECRET` é o certo; a senha do painel serve de reserva pra quem já tinha
 * o `.env.local` antigo e não quer mexer em nada. Trocar qualquer um dos dois
 * derruba as sessões abertas, que é exatamente o que se espera.
 */
function segredo() {
  const valor = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!valor) throw new Error("Defina AUTH_SECRET (ou APP_PASSWORD) no .env");
  return new TextEncoder().encode(valor);
}

function paraBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string) {
  const bin = atob(texto.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function assinar(dados: string) {
  const chave = await crypto.subtle.importKey(
    "raw",
    segredo(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(dados));
  return paraBase64Url(new Uint8Array(mac));
}

export async function criarToken(sub: string, via: Sessao["via"]) {
  const sessao: Sessao = { sub, via, exp: Math.floor(Date.now() / 1000) + DURACAO_S };
  const corpo = paraBase64Url(new TextEncoder().encode(JSON.stringify(sessao)));
  return `${corpo}.${await assinar(corpo)}`;
}

/** Devolve a sessão, ou null se o cookie foi mexido, expirou ou nem existe. */
export async function lerToken(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;

  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  try {
    // Comparação simples: o atacante não controla o segredo nem consegue medir
    // o tempo daqui de fora com precisão útil.
    if ((await assinar(corpo)) !== assinatura) return null;

    const sessao = JSON.parse(new TextDecoder().decode(deBase64Url(corpo))) as Sessao;
    if (sessao.exp < Math.floor(Date.now() / 1000)) return null;
    return sessao;
  } catch {
    return null;
  }
}

/** Opções do cookie, iguais em todo lugar que grava a sessão. */
export function opcoesCookie(producao: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: producao,
    path: "/",
    maxAge: DURACAO_S,
  };
}

/** Login por senha existe só se `APP_PASSWORD` estiver preenchida. */
export function senhaConfigurada() {
  return Boolean(process.env.APP_PASSWORD);
}

/** O botão do Google só aparece quando as duas chaves estão no ambiente. */
export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Quem pode entrar pelo Google. Sem essa lista qualquer conta Google do mundo
 * entraria no seu painel, então a falta dela bloqueia o login em vez de liberar.
 */
export function emailsPermitidos() {
  return (process.env.GOOGLE_EMAILS_PERMITIDOS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
