import { redirect } from "next/navigation";

/**
 * `/crm` era o endereço antigo do quadro kanban. O quadro voltou, agora em
 * `/pipeline` — este redirect existe só para não quebrar link salvo.
 * O código original ficou em funil-kanban.tsx.bak.
 */
export default function Crm() {
  redirect("/pipeline");
}
