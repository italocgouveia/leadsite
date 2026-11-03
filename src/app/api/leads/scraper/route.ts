import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, leads, eventos } from "@/lib/db";
import { rasparSite } from "@/lib/scraper/site";
import { enriquecerPeloSite } from "@/lib/enriquecimento-site";
import { linkWhatsapp } from "@/lib/telefone";

export const runtime = "nodejs";
export const maxDuration = 60;
const corpo = z.object({ ids: z.array(z.string().uuid()).min(1).max(3) });

/** Cada chamada trabalha um lote pequeno. O navegador acompanha o progresso sem exceder a função. */
export async function POST(req: Request) {
  const params = corpo.safeParse(await req.json().catch(() => null));
  if (!params.success) return NextResponse.json({ erro: "Selecione de 1 a 3 leads válidos por lote." }, { status: 400 });
  try {
    const lista = await db.select().from(leads).where(inArray(leads.id, [...new Set(params.data.ids)]));
    const resultados = await Promise.all(lista.map(async lead => {
      if (!lead.website || lead.naoContatar) return { id: lead.id, status: "ignorado", motivo: "Sem site próprio ou marcado para não contatar." };
      try {
        const coleta = await rasparSite(lead.website);
        if (!coleta.analise.ok) return { id: lead.id, status: "falha", motivo: coleta.analise.motivo };
        const enriquecimento = await enriquecerPeloSite(lead, true, coleta.analise);
        const valores = enriquecimento.gravaria;
        // COALESCE é avaliado no banco: nem uma edição feita durante o scraping é sobrescrita.
        const [salvo] = await db.update(leads).set({
          telefone: sql`coalesce(nullif(${leads.telefone}, ''), ${valores.telefone ?? valores.whatsapp ?? null})`,
          whatsapp: sql`coalesce(nullif(${leads.whatsapp}, ''), ${valores.whatsapp ? linkWhatsapp(valores.whatsapp) : null})`,
          email: sql`coalesce(nullif(${leads.email}, ''), ${valores.email ?? null})`,
          instagram: sql`coalesce(nullif(${leads.instagram}, ''), ${valores.instagram ?? null})`,
        }).where(and(eq(leads.id, lead.id), eq(leads.naoContatar, false))).returning();
        if (!salvo) return { id: lead.id, status: "ignorado", motivo: "Cadastro removido ou marcado para não contatar durante a coleta." };
        const campos = (["telefone", "whatsapp", "email", "instagram"] as const).filter(c => !lead[c] && Boolean(salvo[c]) && Boolean(valores[c] || (c === "telefone" && valores.whatsapp)));
        // Fonte e achados rejeitados ficam no histórico do lead para revisão.
        await db.insert(eventos).values({
          tipo: "scraper-site", leadId: lead.id,
          descricao: campos.length ? `Scraper completou: ${campos.join(", ")}.` : "Scraper consultou o site sem adicionar contatos aprovados.",
          dados: { paginas: coleta.paginas, fontes: coleta.fontes, campos, achados: enriquecimento.achados, avisos: coleta.avisos },
        });
        return { id: lead.id, status: campos.length ? "completado" : "sem-novos-contatos", campos, paginas: coleta.paginas, avisos: coleta.avisos, revisao: enriquecimento.achados.filter(a => !a.aceito), contatos: { telefone: salvo.telefone, whatsapp: salvo.whatsapp, email: salvo.email, instagram: salvo.instagram } };
      } catch {
        return { id: lead.id, status: "falha", motivo: "Não foi possível concluir a coleta e registrar o resultado. Consulte o cadastro antes de tentar novamente." };
      }
    }));
    return NextResponse.json({ resultados });
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar a base de leads." }, { status: 503 });
  }
}
