import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { previaFiltrada } from "@/lib/disparo";
import { montarMensagemUniversal, MENSAGEM_BASE } from "@/lib/mensagem-universal";

/**
 * Prévia da primeira abordagem, com leads reais do nicho.
 *
 * Serve para provar a regra antes de gerar o lote: a copy é a MESMA para
 * todos, e a única diferença entre uma amostra e outra é o nome da empresa.
 *
 * Só leitura, e sem IA. Antes esta rota chamava o Gemini uma vez por amostra
 * — gastava cota só para olhar, e o texto mostrado era uma geração diferente
 * da que entraria na campanha depois: você aprovava um texto e saía outro.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QUANTIDADE = 3;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const segmento = u.searchParams.get("segmento") || undefined;

  const preview = await previaFiltrada({ segmento });
  const idsAmostra = preview.leadIds.slice(0, QUANTIDADE);

  if (idsAmostra.length === 0) {
    return NextResponse.json({ amostras: [] });
  }

  const alvos = await db.select().from(leads).where(inArray(leads.id, idsAmostra));
  // Mesma ordem de `leadIds` (já vem por prioridade) — a query acima não garante ordem.
  const porId = new Map(alvos.map((l) => [l.id, l]));
  const ordenados = idsAmostra.map((id) => porId.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));

  /**
   * A prévia mostra EXATAMENTE o que vai ser gravado.
   *
   * Antes ela chamava o Gemini uma vez por amostra — o que gastava cota só
   * para olhar, e pior: o texto da prévia era uma geração diferente da que
   * entraria na campanha depois. Você aprovava um texto e saía outro.
   *
   * Agora usa a mesma função da fila (`montarMensagemUniversal`), então o que
   * está na tela é literalmente o que sai. Sem IA, instantâneo, sem custo.
   */
  const amostras = ordenados.map((lead) => ({
    nome: lead.nome,
    cidade: lead.cidade,
    mensagem: montarMensagemUniversal(lead),
  }));

  /**
   * `base` deixa a tela provar a regra: as amostras são a mesma copy, e a
   * única diferença entre elas é o nome da empresa.
   */
  return NextResponse.json({ amostras, base: MENSAGEM_BASE });
}
