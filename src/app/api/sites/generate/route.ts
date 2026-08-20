import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, leads, sites, siteVersions, logos } from "@/lib/db";
import { gerarSite, gerarSlug } from "@/lib/gen/site";
import { injetarNoSite } from "@/lib/gen/injetar";
import { validarSite } from "@/lib/gen/validar";
import { carregarConfig } from "@/lib/config";

// Medido: ~53s por site com gemini-3.5-flash. O plano Hobby da Vercel corta
// em 60s, então em produção isso fica na margem — ver README.
export const maxDuration = 300;

const Body = z.object({
  leadId: z.string().uuid(),
  regerar: z.boolean().default(false),
  modelo: z.enum(["simples", "completo", "animado"]).default("completo"),
  usarLogo: z.boolean().default(false),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, params.leadId)).limit(1);
  if (!lead) {
    return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });
  }

  const [existente] = await db
    .select()
    .from(sites)
    .where(eq(sites.leadId, lead.id))
    .limit(1);

  if (existente && !params.regerar) {
    return NextResponse.json({ site: existente, reaproveitado: true });
  }

  // Usa o logo mais recente do lead, se pedido e se existir.
  let logoSvg: string | null = null;
  if (params.usarLogo) {
    const [logo] = await db
      .select()
      .from(logos)
      .where(eq(logos.leadId, lead.id))
      .orderBy(desc(logos.criadoEm))
      .limit(1);
    logoSvg = logo?.svg ?? null;
  }

  let html: string;
  try {
    html = await gerarSite(lead, {
      fotos: lead.fotos ?? [],
      modelo: params.modelo,
      logoSvg,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gerar o site";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  // Confere o HTML contra os dados reais do lead ANTES de salvar.
  // O modelo já inventou telefone em teste — ver lib/gen/validar.ts.
  const validacao = validarSite(html, lead);
  html = validacao.html;

  // Pixels e marca d'água entram depois da geração — ver lib/gen/injetar.ts.
  html = injetarNoSite(html, await carregarConfig());

  if (existente) {
    const [ultima] = await db
      .select({ versao: siteVersions.versao })
      .from(siteVersions)
      .where(eq(siteVersions.siteId, existente.id))
      .orderBy(desc(siteVersions.versao))
      .limit(1);

    const [atualizado] = await db
      .update(sites)
      .set({ html, modelo: params.modelo, animado: params.modelo === "animado", atualizadoEm: new Date() })
      .where(eq(sites.id, existente.id))
      .returning();

    await db.insert(siteVersions).values({
      siteId: existente.id,
      versao: (ultima?.versao ?? 0) + 1,
      html,
      prompt: `Regerado (modelo ${params.modelo})`,
    });

    return NextResponse.json({ site: atualizado, problemas: validacao.problemas });
  }

  const [novo] = await db
    .insert(sites)
    .values({
      leadId: lead.id,
      slug: gerarSlug(lead.nome, lead.cidade),
      html,
      modelo: params.modelo,
      animado: params.modelo === "animado",
    })
    .returning();

  await db.insert(siteVersions).values({ siteId: novo.id, versao: 1, html });

  return NextResponse.json({ site: novo, problemas: validacao.problemas });
}
