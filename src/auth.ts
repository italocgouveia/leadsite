import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Login com Google.
 *
 * O painel é da ICG Tech: só entra quem está na lista de e-mails autorizados.
 * Sem isso, qualquer pessoa com conta Google entraria no seu painel, veria
 * seus leads e gastaria sua cota do Gemini.
 *
 * `GOOGLE_EMAILS_PERMITIDOS` aceita vários separados por vírgula. Se estiver vazia,
 * apenas o primeiro e-mail que fizer login é aceito e os demais são barrados —
 * evita deixar o painel aberto por esquecimento de configuração.
 */

function listaPermitida(): string[] {
  return (process.env.GOOGLE_EMAILS_PERMITIDOS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** O Google está configurado? Se não, o app cai no modo senha (ver proxy.ts). */
export const googleAtivo = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  pages: {
    signIn: "/entrar",
    error: "/entrar",
  },

  callbacks: {
    /**
     * Barra quem não está na lista antes mesmo de criar a sessão.
     *
     * Lê de `user` E de `profile`: dependendo do provedor, o e-mail chega em
     * um ou no outro, e confiar só no `profile` derrubava o login com
     * AccessDenied mesmo com o e-mail correto na lista.
     */
    signIn({ user, profile }) {
      const email = (user?.email ?? profile?.email)?.trim().toLowerCase();
      const permitidos = listaPermitida();

      // Sem console de erro fica impossível diagnosticar em produção: o
      // usuário só vê "acesso negado" e não dá para saber qual campo faltou.
      console.log("[auth] tentativa de login", {
        emailRecebido: email ?? "(nenhum)",
        temUser: Boolean(user?.email),
        temProfile: Boolean(profile?.email),
        permitidosConfigurados: permitidos.length,
      });

      if (!email) return false;
      if (permitidos.length === 0) return true; // 1º acesso: ver aviso no /entrar
      return permitidos.includes(email);
    },

    session({ session }) {
      return session;
    },
  },

  // Sessão em cookie assinado: não precisa de tabela nem de consulta a cada
  // requisição, o que mantém o proxy rápido.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },

  trustHost: true,
});
