import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, campanhas, mensagens, leads, geracaoFila } from "@/lib/db";
import { resolverSaudacao } from "@/lib/saudacao";
import { pontuar } from "@/lib/pontuacao";
import { solucaoPorId } from "@/lib/catalogo-solucoes";
import { ROTULO_INTENCAO, type Intencao } from "@/lib/classificar";

/**
 * Tudo que a revisão de uma campanha precisa, numa chamada só.
 *
 * `?id=` → os cards daquela campanha (lead + oportunidade + solução + texto).
 * sem `id` → a lista de campanhas com o resultado de cada uma.
 *
 * Junta lead, mensagem e a análise da IA porque separar isso em três
 * requisições faria a tela montar o card em pedaços — e card de revisão que
 * aparece pela metade é onde se aprova mensagem sem ler.
 *
 * Só leitura.
 */
export const dynamic = "force-dynamic";

const VIVAS = ["rascunho", "aprovada", "na-fila"] as const;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");

  // ---------------------------------------------- lista de campanhas
  if (!id) {
    const lista = await db
      .select()
      .from(campanhas)
      .orderBy(desc(campanhas.criadoEm))
      .limit(12);

    const comResultado = await Promise.all(
      lista.map(async (c) => {
        const linhas = await db
          .select({ status: mensagens.status, n: sql<number>`count(*)::int` })
          .from(mensagens)
          .where(eq(mensagens.campanhaId, c.id))
          .groupBy(mensagens.status);
        const conta = (s: string) => linhas.find((l) => l.status === s)?.n ?? 0;

        // Intenção mora no LEAD (quem responde é a pessoa, não a mensagem).
        const respostas = await db
          .select({ intencao: leads.intencao, n: sql<number>`count(*)::int` })
          .from(mensagens)
          .innerJoin(leads, eq(leads.id, mensagens.leadId))
          .where(eq(mensagens.campanhaId, c.id))
          .groupBy(leads.intencao);

        const porIntencao = respostas
          .filter((r) => r.intencao)
          .map((r) => ({
            intencao: r.intencao as Intencao,
            rotulo: ROTULO_INTENCAO[r.intencao as Intencao]?.rotulo ?? r.intencao!,
            emoji: ROTULO_INTENCAO[r.intencao as Intencao]?.emoji ?? "•",
            quantos: r.n,
          }));

        const enviadas = conta("enviada") + conta("entregue") + conta("respondida");
        const respondidas = conta("respondida");
        /** "Interessado" aqui é o que a classificação já decidiu — não é palpite novo. */
        const interessados = porIntencao
          .filter((i) => ["interessado", "orcamento", "agendamento"].includes(i.intencao))
          .reduce((s, i) => s + i.quantos, 0);

        return {
          id: c.id,
          nome: c.nome,
          status: c.status,
          criadoEm: c.criadoEm.toISOString(),
          total: linhas.reduce((s, l) => s + l.n, 0),
          rascunho: conta("rascunho"),
          aprovada: conta("aprovada") + conta("na-fila"),
          enviadas,
          respondidas,
          interessados,
          erros: conta("erro"),
          canceladas: conta("cancelada"),
          taxaResposta: enviadas ? Math.round((respondidas / enviadas) * 100) : 0,
          taxaInteresse: respondidas ? Math.round((interessados / respondidas) * 100) : 0,
          porIntencao,
        };
      }),
    );

    return NextResponse.json({ campanhas: comResultado });
  }

  // ---------------------------------------------- cards de uma campanha
  const [campanha] = await db.select().from(campanhas).where(eq(campanhas.id, id)).limit(1);
  if (!campanha) return NextResponse.json({ erro: "Campanha não encontrada" }, { status: 404 });

  const linhas = await db
    .select({ m: mensagens, lead: leads, analise: geracaoFila })
    .from(mensagens)
    .innerJoin(leads, eq(leads.id, mensagens.leadId))
    .leftJoin(
      geracaoFila,
      sql`${geracaoFila.campanhaId} = ${mensagens.campanhaId} and ${geracaoFila.leadId} = ${mensagens.leadId}`,
    )
    .where(eq(mensagens.campanhaId, id))
    .orderBy(desc(mensagens.prioridade));

  const cards = linhas
    .filter((l) => (VIVAS as readonly string[]).includes(l.m.status))
    .map((l) => {
      const p = pontuar(l.lead);
      const sol = l.m.produto ? solucaoPorId(l.m.produto) : undefined;
      return {
        mensagemId: l.m.id,
        status: l.m.status,
        origem: l.m.origem,
        /** Com a saudação já resolvida: é o que a pessoa vai ler. */
        texto: resolverSaudacao(l.m.texto),
        lead: {
          id: l.lead.id,
          nome: l.lead.nome,
          cidade: l.lead.cidade,
          categoria: l.lead.categoria,
          temInstagram: Boolean(l.lead.instagram),
          temSite: Boolean(l.lead.website),
          nota: l.lead.nota,
          avaliacoes: l.lead.avaliacoes,
        },
        score: p.total,
        emoji: p.emoji,
        classificacao: p.rotulo,
        /** Da IA, quando existe. Campanha antiga não tem — e a tela mostra isso. */
        oportunidade: l.analise?.oportunidade ?? null,
        solucaoId: l.m.produto,
        solucaoRotulo: sol?.rotulo ?? null,
      };
    });

  return NextResponse.json({
    campanha: { id: campanha.id, nome: campanha.nome, status: campanha.status },
    cards,
    resumo: {
      total: cards.length,
      rascunho: cards.filter((c) => c.status === "rascunho").length,
      aprovadas: cards.filter((c) => c.status !== "rascunho").length,
    },
  });
}
