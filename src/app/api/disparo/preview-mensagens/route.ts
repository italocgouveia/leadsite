import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { previaFiltrada } from "@/lib/disparo";
import { gerarMensagemProspeccao, type ProdutoProspeccao } from "@/lib/gen/mensagem-prospeccao";

/**
 * Prévia de mensagens REAIS, geradas por IA, para uns poucos leads do
 * nicho — para a pessoa ver, antes de preparar a fila inteira, que a IA
 * está de fato personalizando (e não é a mesma mensagem com o nome trocado).
 *
 * Só leitura no banco: usa os leads elegíveis de verdade, mas NÃO grava
 * nada em `mensagens`. Chama o Gemini algumas vezes (poucas, de propósito
 * — é prévia, não a campanha inteira) e devolve o texto puro.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRODUTOS: ProdutoProspeccao[] = ["site", "chatbot", "sistema"];
const QUANTIDADE = 3;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const segmento = u.searchParams.get("segmento") || undefined;
  const produtoBruto = u.searchParams.get("produto");
  const produto = PRODUTOS.includes(produtoBruto as ProdutoProspeccao)
    ? (produtoBruto as ProdutoProspeccao)
    : undefined;

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
   * Devolve o RACIOCÍNIO junto, não só o texto: sem ver a oportunidade e a
   * solução escolhida, não dá para saber se a IA analisou o lead ou só
   * escreveu bonito. `erro` separado do resto para a tela mostrar a falha
   * como falha, em vez de fingir que é uma mensagem.
   */
  const amostras: {
    nome: string;
    cidade: string | null;
    oportunidade?: string;
    solucao?: string;
    mensagem?: string;
    erro?: string;
  }[] = [];

  for (const lead of ordenados) {
    try {
      const a = await gerarMensagemProspeccao(lead, { produto });
      amostras.push({
        nome: lead.nome,
        cidade: lead.cidade,
        oportunidade: a.oportunidade,
        solucao: a.solucaoRotulo,
        mensagem: a.mensagem,
      });
    } catch (e) {
      amostras.push({
        nome: lead.nome,
        cidade: lead.cidade,
        erro: e instanceof Error ? e.message : "erro desconhecido",
      });
    }
  }

  return NextResponse.json({ amostras });
}
