import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db, conversas, leads } from "@/lib/db";

/**
 * Lista de conversas, uma linha por lead — coluna 1 da central de Conversas.
 *
 * Sem SQL exótico de propósito: busca as últimas N linhas de `conversas` (já
 * ordenadas por data) e reduz em memória para "a mais recente por lead" mais
 * a contagem de não lidas. O volume aqui é de um CRM de prospecção pessoal,
 * não de uma operação de call center — não precisa de window function.
 */

export async function GET() {
  const linhas = await db.select().from(conversas).orderBy(desc(conversas.criadoEm)).limit(1000);

  const ultimaPorLead = new Map<string, (typeof linhas)[number]>();
  const naoLidasPorLead = new Map<string, number>();

  for (const l of linhas) {
    if (!ultimaPorLead.has(l.leadId)) ultimaPorLead.set(l.leadId, l);
    if (l.direcao === "recebida" && !l.lida) {
      naoLidasPorLead.set(l.leadId, (naoLidasPorLead.get(l.leadId) ?? 0) + 1);
    }
  }

  const leadIds = [...ultimaPorLead.keys()];
  if (leadIds.length === 0) return NextResponse.json({ conversas: [], naoLidasTotal: 0 });

  const leadsRows = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      categoria: leads.categoria,
      cidade: leads.cidade,
      etapa: leads.etapa,
      atendimentoHumano: leads.atendimentoHumano,
    })
    .from(leads)
    .where(inArray(leads.id, leadIds));
  const leadPorId = new Map(leadsRows.map((l) => [l.id, l]));

  const itens = leadIds
    .map((id) => {
      const lead = leadPorId.get(id);
      if (!lead) return null;
      const ultima = ultimaPorLead.get(id)!;
      return {
        lead,
        ultimaMensagem: { texto: ultima.texto, direcao: ultima.direcao, criadoEm: ultima.criadoEm },
        naoLidas: naoLidasPorLead.get(id) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => +new Date(b.ultimaMensagem.criadoEm) - +new Date(a.ultimaMensagem.criadoEm));

  const naoLidasTotal = itens.reduce((soma, i) => soma + i.naoLidas, 0);

  return NextResponse.json({ conversas: itens, naoLidasTotal });
}
