import { redirect } from "next/navigation";

/**
 * Resposta automática é configuração, não controle de disparo — mudou para
 * /config/resposta-automatica. Redirect em vez de excluir: link salvo ou
 * aba antiga não pode virar 404.
 */
export default function RegrasAutomaticasRedirect() {
  redirect("/config/resposta-automatica");
}
