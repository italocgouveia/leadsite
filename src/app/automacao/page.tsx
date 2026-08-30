import { redirect } from "next/navigation";

/**
 * /automacao e /disparar viraram uma única tela: /disparos.
 *
 * Ver o comentário em src/app/disparar/page.tsx. `/automacao/regras` (a tela
 * de resposta automática) também virou redirect, para /config/resposta-
 * automatica — resposta automática é configuração, não controle de disparo.
 * Este arquivo cobre só o índice `/automacao`.
 */
export default function AutomacaoRedirect() {
  redirect("/disparos");
}
