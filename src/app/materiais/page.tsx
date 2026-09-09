import { redirect } from "next/navigation";

/**
 * A biblioteca mudou de `/materiais` para `/prospeccao`.
 *
 * O redirect fica porque o link antigo já foi para produção e pode estar
 * salvo no navegador de alguém. Apagar a rota trocaria uma mudança de nome
 * por um 404 — as outras rotas legadas deste projeto (`/crm`, `/melhores`,
 * `/disparar`) existem pelo mesmo motivo.
 */
export default function MateriaisRedirect() {
  redirect("/prospeccao");
}
