import { redirect } from "next/navigation";

/**
 * "Melhores leads" virou duas telas: /vender-site e /vender-chatbot.
 * Misturar os dois produtos numa lista só era o que confundia — o discurso e o
 * tipo de lead são diferentes demais para dividirem a mesma fila.
 *
 * Este redirect existe só para não quebrar link salvo ou aba aberta.
 */
export default function Melhores() {
  redirect("/vender-site");
}
