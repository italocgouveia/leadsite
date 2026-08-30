import { redirect } from "next/navigation";

/**
 * /disparar e /automacao viraram uma única tela: /disparos.
 *
 * Eram duas telas com dois botões diferentes de "manda agora" — cada um um
 * loop de envio rodando no navegador. Fundidas em `/disparos`, cujo único
 * emissor real é o worker da bridge. Redirect em vez de excluir a rota:
 * link salvo ou aba antiga não pode virar 404.
 */
export default function DisparaRedirect() {
  redirect("/disparos");
}
