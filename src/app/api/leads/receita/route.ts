import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { consultarCnpj } from "@/lib/receita";
import { acharCnpjNoSite } from "@/lib/cnpj-do-site";
import { limpar, valido } from "@/lib/cnpj";

/**
 * Enriquece o lead com os dados públicos da Receita — o objetivo é o nome do
 * dono, para não ficar preso na recepção.
 *
 * Dois caminhos:
 *  - você manda o CNPJ (achou na nota, no rodapé, no Google);
 *  - você não manda, e a rota tenta achar sozinha no site do lead.
 *
 * O segundo caminho acerta pouco (medido: 3 em 25 sites), então ele é atalho,
 * não promessa. Quando falha, a resposta diz exatamente isso em vez de fingir
 * que a empresa não existe.
 */

export const dynamic = "force-dynamic";
// A varredura do site pode encostar nos 30s: 3 páginas x 9s de tempo limite.
export const maxDuration = 60;

const Body = z.object({
  leadId: z.string().uuid(),
  cnpj: z.string().optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, params.leadId))
    .limit(1);

  if (!lead) {
    return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
  }

  // 1. O que você digitou vence. 2. O que já estava salvo. 3. Caçar no site.
  let cnpj = params.cnpj ? limpar(params.cnpj) : "";
  let origem: "informado" | "salvo" | "site" = "informado";

  if (!cnpj && lead.cnpj) {
    cnpj = lead.cnpj;
    origem = "salvo";
  }

  if (!cnpj && lead.website) {
    const achado = await acharCnpjNoSite(lead.website);
    if (achado) {
      cnpj = achado;
      origem = "site";
    }
  }

  if (!cnpj) {
    return NextResponse.json(
      {
        erro: lead.website
          ? "Não achei CNPJ no site desse lead. Procure na nota fiscal, no rodapé ou no Google e cole aqui."
          : "Esse lead não tem site para eu vasculhar. Cole o CNPJ para eu consultar.",
      },
      { status: 422 },
    );
  }

  if (!valido(cnpj)) {
    return NextResponse.json({ erro: "CNPJ inválido — confira os números." }, { status: 422 });
  }

  const resultado = await consultarCnpj(cnpj);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: 422 });
  }

  const { dados } = resultado;

  /**
   * O e-mail e o telefone da Receita só entram se o lead ainda não tiver.
   * O telefone cadastrado costuma ser o do contador — trocar um número que
   * funciona por esse seria piorar o lead em nome de "ter mais dado".
   */
  const [atualizado] = await db
    .update(leads)
    .set({
      cnpj: dados.cnpj,
      razaoSocial: dados.razaoSocial,
      socios: dados.socios,
      receitaEm: new Date(),
      ...(lead.email ? {} : dados.email ? { email: dados.email } : {}),
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, lead.id))
    .returning();

  return NextResponse.json({
    lead: atualizado,
    dados,
    origem,
    // Contexto que a tela usa para não prometer o que não tem.
    aviso:
      dados.socios.length === 0
        ? "Sem quadro societário — costuma ser MEI ou empresário individual. Nesses casos o dono é quem está na razão social."
        : null,
  });
}
