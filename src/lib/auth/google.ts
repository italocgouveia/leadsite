/**
 * O mínimo de OAuth do Google pra saber um e-mail: manda pro consentimento,
 * troca o `code` por um token e lê o perfil. Sem SDK — são duas chamadas HTTP.
 */

/**
 * Precisa ser idêntica à cadastrada no Google Cloud, caractere por caractere.
 * `APP_URL` existe pra quando o host que chega no servidor não é o público.
 */
export function urlDeRetorno(request: Request) {
  const base = process.env.APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

/** Devolve o e-mail verificado da conta, ou null se qualquer passo falhar. */
export async function emailDoCodigo(code: string, redirectUri: string) {
  const troca = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!troca.ok) return null;

  const { access_token } = (await troca.json()) as { access_token?: string };
  if (!access_token) return null;

  const perfil = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!perfil.ok) return null;

  const dados = (await perfil.json()) as { email?: string; email_verified?: boolean };
  // E-mail não verificado não identifica ninguém: dá pra cadastrar qualquer um.
  if (!dados.email || dados.email_verified === false) return null;
  return dados.email.toLowerCase();
}
