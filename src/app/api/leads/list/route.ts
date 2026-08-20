import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, leads } from "@/lib/db";

/**
 * Base de leads já buscados.
 * `?crm=1` devolve só o que você mandou para o funil — o CRM usa esse filtro
 * pra não ficar cheio dos 20 leads que toda busca traz.
 */
export async function GET(request: Request) {
  const soCrm = new URL(request.url).searchParams.get("crm") === "1";

  const consulta = db.select().from(leads).$dynamic();
  const lista = soCrm
    ? await consulta.where(eq(leads.noCrm, true)).orderBy(desc(leads.score))
    : await consulta.orderBy(desc(leads.score));

  return NextResponse.json({ leads: lista });
}
