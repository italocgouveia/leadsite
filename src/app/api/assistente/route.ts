import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, leads } from "@/lib/db";
import { promptDoLead, dossie, responderSemIA, PERGUNTAS } from "@/lib/assistente";
import { gerarTexto, MODELO_RAPIDO } from "@/lib/gen/cliente";

/**
 * 🤖 O ASSISTENTE COMERCIAL.
 *
 * Duas rotas de resposta, e a ordem entre elas é a parte importante:
 *
 *   1. PERGUNTA CONHECIDA → resposta determinística, das mesmas funções que
 *      decidem a fila. Sem modelo, sem custo, sem chance de invenção.
 *   2. PERGUNTA LIVRE → modelo, com o dossiê fechado e a instrução de preservar
 *      a separação entre fato e hipótese.
 *
 * O caminho 1 vem primeiro de propósito. "Qual canal devo usar?" tem resposta
 * exata no sistema; mandar isso para um modelo seria trocar uma certeza por
 * uma probabilidade — e pagar por isso.
 *
 * SEM CHAVE, A ROTA CONTINUA ÚTIL: as perguntas conhecidas respondem igual, e
 * a pergunta livre devolve uma explicação honesta em vez de erro.
 */
export const dynamic = "force-dynamic";

const corpo = z.object({
  leadId: z.string().uuid(),
  /** Uma das perguntas conhecidas, quando houver. */
  perguntaId: z.string().max(60).optional(),
  /** Pergunta livre. Só usada quando não veio `perguntaId`. */
  texto: z.string().min(3).max(400).optional(),
});

export async function POST(req: Request) {
  const dados = corpo.safeParse(await req.json().catch(() => null));
  if (!dados.success) {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, dados.data.leadId)).limit(1);
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  // ─── 1. pergunta conhecida: resposta exata, sem modelo ───
  if (dados.data.perguntaId) {
    const resposta = responderSemIA(lead, dados.data.perguntaId);
    if (resposta) {
      return NextResponse.json({ resposta, fonte: "sistema", dossie: dossie(lead) });
    }
  }

  const pergunta = dados.data.texto?.trim();
  if (!pergunta) {
    return NextResponse.json({
      erro: "Pergunta não reconhecida",
      disponiveis: PERGUNTAS.map((p) => ({ id: p.id, pergunta: p.pergunta })),
    });
  }

  // ─── 2. pergunta livre: modelo, com o dossiê fechado ───
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      resposta:
        "Perguntas livres precisam de uma chave de IA configurada. As perguntas da lista continuam funcionando — elas são respondidas pelo próprio sistema, sem modelo.",
      fonte: "indisponivel",
      dossie: dossie(lead),
      disponiveis: PERGUNTAS.map((p) => ({ id: p.id, pergunta: p.pergunta })),
    });
  }

  const { sistema, entrada } = promptDoLead(lead);

  try {
    const resposta = await gerarTexto({
      sistema,
      entrada: `${entrada}\n\n=== PERGUNTA DO VENDEDOR ===\n${pergunta}`,
      /** Curto de propósito: resposta longa aqui vira texto que ninguém lê. */
      maxTokens: 900,
      raciocinio: "low",
      modelo: MODELO_RAPIDO,
      tentativas: 2,
    });
    return NextResponse.json({ resposta: resposta.trim(), fonte: "ia", dossie: dossie(lead) });
  } catch {
    /**
     * Falha de modelo NÃO derruba a tela. O dossiê é o dado bruto e continua
     * útil sem interpretação nenhuma — melhor entregar isso do que um erro.
     */
    return NextResponse.json({
      resposta:
        "O modelo não respondeu agora. O dossiê abaixo tem os dados confirmados e as hipóteses; as perguntas da lista continuam funcionando sem IA.",
      fonte: "erro",
      dossie: dossie(lead),
    });
  }
}
