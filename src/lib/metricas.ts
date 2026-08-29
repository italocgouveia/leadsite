import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db, leads, mensagens, campanhas, conversas, ETAPAS_FUNIL } from "@/lib/db";
import { pontuar } from "@/lib/pontuacao";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Métricas do dashboard — tudo lido do banco, nada simulado.
 *
 * Três decisões que mudam o número que você vê:
 *
 *  1. **Taxa de resposta usa ENVIADAS, não entregues**, enquanto o provedor
 *     não confirmar entrega. Dividir por entregues quando quase ninguém
 *     confirma inflaria a taxa. O retorno diz qual base foi usada, e a tela
 *     mostra isso — métrica sem denominador explícito é métrica que engana.
 *
 *  2. **Um lead conta uma vez.** As contagens partem de leads distintos, não
 *     de mensagens: dois contatos para a mesma empresa não são duas respostas.
 *
 *  3. **Amostra pequena é marcada.** Campanha com 2 leads e 1 resposta tem 50%
 *     e não é melhor que uma com 100 leads e 30%. Abaixo do mínimo, o ranking
 *     mostra o aviso em vez de fingir significância.
 */

export const AMOSTRA_MINIMA = 10;

export type Periodo = "hoje" | "7d" | "30d" | "tudo";

export type Filtros = {
  periodo: Periodo;
  campanhaId?: string;
  segmento?: string;
  cidade?: string;
};

function desde(periodo: Periodo): Date | null {
  const agora = Date.now();
  if (periodo === "hoje") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === "7d") return new Date(agora - 7 * 86_400_000);
  if (periodo === "30d") return new Date(agora - 30 * 86_400_000);
  return null;
}

const ETAPAS_CONTATADAS = [
  "mensagem-enviada",
  "respondeu",
  "interessado",
  "reuniao",
  "proposta",
  "fechado",
] as const;

export async function calcular(filtros: Filtros) {
  const corte = desde(filtros.periodo);

  // ---------- base de leads, com os filtros aplicados ----------
  let base = await db.select().from(leads);
  if (corte) base = base.filter((l) => l.criadoEm >= corte);
  if (filtros.cidade) {
    base = base.filter((l) =>
      (l.cidade ?? "").toLowerCase().includes(filtros.cidade!.toLowerCase()),
    );
  }
  if (filtros.segmento) {
    base = base.filter((l) =>
      categoriaSingular(l.categoria).toLowerCase().includes(filtros.segmento!.toLowerCase()),
    );
  }

  const idsBase = new Set(base.map((l) => l.id));

  // ---------- mensagens do período ----------
  const condicoes = [];
  if (corte) condicoes.push(gte(mensagens.criadoEm, corte));
  let msgs = await db
    .select()
    .from(mensagens)
    .where(condicoes.length ? and(...condicoes) : undefined);

  if (filtros.campanhaId) msgs = msgs.filter((m) => m.campanhaId === filtros.campanhaId);
  msgs = msgs.filter((m) => idsBase.has(m.leadId));

  // ---------- leads ----------
  const pontuados = base.map((l) => ({ l, p: pontuar(l) }));
  const porEtapa = (e: string) => base.filter((l) => l.etapa === e).length;

  const leadsMetricas = {
    total: base.length,
    novos: porEtapa("novo"),
    analisados: base.filter((l) => l.etapa !== "novo").length,
    qualificados: pontuados.filter((x) => x.p.total >= 60).length,
    comWhatsapp: base.filter((l) => l.whatsapp).length,
    semContato: base.filter((l) => !l.whatsapp && !l.telefone).length,
    quentes: pontuados.filter((x) => x.p.classificacao === "muito-quente" || x.p.classificacao === "quente").length,
    medios: pontuados.filter((x) => x.p.classificacao === "medio").length,
    frios: pontuados.filter((x) => x.p.classificacao === "frio").length,
    optOut: base.filter((l) => l.naoContatar).length,
  };

  // ---------- campanhas ----------
  const todasCampanhas = await db.select().from(campanhas);
  const campanhasMetricas = {
    ativas: todasCampanhas.filter((c) => c.status === "rodando").length,
    pausadas: todasCampanhas.filter((c) => c.status === "pausada").length,
    concluidas: todasCampanhas.filter((c) => c.status === "concluida").length,
    processados: msgs.filter((m) =>
      ["enviada", "entregue", "respondida"].includes(m.status),
    ).length,
    pendentes: msgs.filter((m) => ["rascunho", "aprovada", "na-fila"].includes(m.status)).length,
  };

  // ---------- mensagens ----------
  const enviadas = msgs.filter((m) => m.enviadaEm).length;
  const entregues = msgs.filter((m) => m.entregueEm).length;
  const erros = msgs.filter((m) => m.status === "erro").length;

  /** Leads distintos que responderam — não mensagens respondidas. */
  const leadsQueResponderam = new Set(
    msgs.filter((m) => m.respondidaEm).map((m) => m.leadId),
  ).size;

  const provedorConfirmaEntrega = entregues > 0;
  const baseDaTaxa = provedorConfirmaEntrega ? entregues : enviadas;

  const mensagensMetricas = {
    enviadas,
    entregues,
    erros,
    respondidas: leadsQueResponderam,
    /** Quantas dessas ENVIADAS o próprio sistema escreveu, sem você digitar. */
    automaticas: msgs.filter((m) => m.origem === "resposta-automatica" && m.enviadaEm).length,
    taxaEntrega: enviadas ? Math.round((entregues / enviadas) * 100) : 0,
    taxaResposta: baseDaTaxa ? Math.round((leadsQueResponderam / baseDaTaxa) * 100) : 0,
    /** A tela mostra isto: sem ele a taxa é um número sem significado. */
    baseDaTaxa: provedorConfirmaEntrega ? ("entregues" as const) : ("enviadas" as const),
    provedorConfirmaEntrega,
  };

  // ---------- vendas ----------
  const interessados = base.filter((l) => l.etapa === "interessado").length;
  const reunioes = base.filter((l) => l.etapa === "reuniao").length;
  const propostas = base.filter((l) => l.etapa === "proposta").length;
  const fechados = base.filter((l) => l.etapa === "fechado").length;
  const contatados = base.filter((l) =>
    (ETAPAS_CONTATADAS as readonly string[]).includes(l.etapa),
  ).length;

  const vendas = {
    interessados,
    reunioes,
    propostas,
    fechados,
    valorPipeline: base
      .filter((l) => ["interessado", "reuniao", "proposta"].includes(l.etapa))
      .reduce((s, l) => s + (l.valorPotencial ?? 0), 0),
    valorFechado: base
      .filter((l) => l.etapa === "fechado")
      .reduce((s, l) => s + (l.valorPotencial ?? 0), 0),
    taxaInteresse: leadsQueResponderam
      ? Math.round((interessados / leadsQueResponderam) * 100)
      : 0,
    taxaConversao: contatados ? Math.round((fechados / contatados) * 100) : 0,
    contatados,
  };

  // ---------- funil ----------
  const funil = ETAPAS_FUNIL.map((e) => ({
    ...e,
    quantidade: porEtapa(e.valor),
    valor: base
      .filter((l) => l.etapa === e.valor)
      .reduce((s, l) => s + (l.valorPotencial ?? 0), 0),
  }));

  // ---------- por segmento ----------
  const porSegmento = new Map<
    string,
    { leads: number; enviadas: number; respostas: number; interessados: number; fechados: number }
  >();

  for (const l of base) {
    const seg = categoriaSingular(l.categoria);
    const atual =
      porSegmento.get(seg) ?? { leads: 0, enviadas: 0, respostas: 0, interessados: 0, fechados: 0 };
    atual.leads++;
    if ((ETAPAS_CONTATADAS as readonly string[]).includes(l.etapa)) atual.enviadas++;
    if (["respondeu", "interessado", "reuniao", "proposta", "fechado"].includes(l.etapa))
      atual.respostas++;
    if (["interessado", "reuniao", "proposta", "fechado"].includes(l.etapa)) atual.interessados++;
    if (l.etapa === "fechado") atual.fechados++;
    porSegmento.set(seg, atual);
  }

  const segmentos = [...porSegmento.entries()]
    .map(([segmento, v]) => ({
      segmento,
      ...v,
      taxaResposta: v.enviadas ? Math.round((v.respostas / v.enviadas) * 100) : 0,
      taxaConversao: v.enviadas ? Math.round((v.fechados / v.enviadas) * 100) : 0,
      amostraPequena: v.enviadas < AMOSTRA_MINIMA,
    }))
    .sort((a, b) => {
      // Amostra pequena nunca lidera o ranking, por melhor que pareça a taxa.
      if (a.amostraPequena !== b.amostraPequena) return a.amostraPequena ? 1 : -1;
      return b.taxaResposta - a.taxaResposta || b.leads - a.leads;
    });

  // ---------- ranking de campanhas ----------
  const rankingCampanhas = await Promise.all(
    todasCampanhas.map(async (c) => {
      const daCampanha = await db
        .select()
        .from(mensagens)
        .where(inArray(mensagens.campanhaId, [c.id]));
      const env = daCampanha.filter((m) => m.enviadaEm).length;
      const resp = new Set(daCampanha.filter((m) => m.respondidaEm).map((m) => m.leadId)).size;
      return {
        id: c.id,
        nome: c.nome,
        status: c.status,
        produto: c.produto,
        leads: daCampanha.length,
        enviadas: env,
        respostas: resp,
        taxaResposta: env ? Math.round((resp / env) * 100) : 0,
        amostraPequena: env < AMOSTRA_MINIMA,
      };
    }),
  );

  rankingCampanhas.sort((a, b) => {
    if (a.amostraPequena !== b.amostraPequena) return a.amostraPequena ? 1 : -1;
    return b.taxaResposta - a.taxaResposta || b.enviadas - a.enviadas;
  });

  // ---------- respostas por intenção ----------
  const todasConversas = await db
    .select()
    .from(conversas)
    .where(isNotNull(conversas.intencao));
  const porIntencao = new Map<string, number>();
  todasConversas
    .filter((c) => idsBase.has(c.leadId))
    .forEach((c) => porIntencao.set(c.intencao!, (porIntencao.get(c.intencao!) ?? 0) + 1));

  // ---------- conversas aguardando humano (não lidas) ----------
  const naoLidas = await db
    .select({ leadId: conversas.leadId })
    .from(conversas)
    .where(and(eq(conversas.direcao, "recebida"), eq(conversas.lida, false)));
  const conversasAtivas = new Set(
    naoLidas.filter((n) => idsBase.has(n.leadId)).map((n) => n.leadId),
  ).size;

  return {
    leads: leadsMetricas,
    campanhas: campanhasMetricas,
    mensagens: mensagensMetricas,
    vendas,
    funil,
    segmentos: segmentos.slice(0, 12),
    rankingCampanhas: rankingCampanhas.slice(0, 8),
    intencoes: [...porIntencao.entries()].map(([intencao, n]) => ({ intencao, n })),
    conversasAtivas,
    filtros,
  };
}

export type Metricas = Awaited<ReturnType<typeof calcular>>;
