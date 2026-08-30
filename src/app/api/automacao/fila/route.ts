import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, mensagens, leads } from "@/lib/db";
import {
  lerConfig,
  podeEnviarAgora,
  enviadasHoje,
  ultimoEnvio,
  enviarProxima,
  calcularStatusWorker,
  inicioDoDia,
} from "@/lib/fila";
import { lerConfigProvedor } from "@/lib/integracao";
import { consultarBridge, type SaudeBridge } from "@/lib/bridge";

/**
 * O worker da fila: manda UMA mensagem por chamada.
 *
 * Uma por chamada, de propósito. Um laço que dispara tudo de uma vez seria
 * mais simples de escrever e é exatamente o padrão que faz a Meta banir o
 * número. Quem chama repetidamente é o worker da bridge (ver
 * whatsapp-node/servidor.js `puxarFila`) — e cada chamada revalida todas as
 * travas do zero.
 *
 * GET  = diagnóstico completo: o que a fila faria agora, estado da bridge,
 *        e o que mostrar no painel de saúde.
 * POST = manda a próxima, se puder.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const cfg = await lerConfig();
  const cfgProv = await lerConfigProvedor();
  const bloqueio = await podeEnviarAgora(cfg);

  const [hoje, ultimo, bridge] = await Promise.all([
    enviadasHoje(),
    ultimoEnvio(),
    cfgProv ? consultarBridge(cfgProv) : Promise.resolve<SaudeBridge>({ alcancavel: false }),
  ]);

  const aguardando = await db
    .select({ id: mensagens.id })
    .from(mensagens)
    .where(eq(mensagens.status, "aprovada"));

  /**
   * Só uma prévia — mesma ordenação de `proximaDaFila`, mas sem revalidar
   * elegibilidade do lead. É informativo ("o que deve sair a seguir"), não
   * uma reserva; a fila de verdade decide na hora do envio.
   */
  const [proxima] = await db
    .select({ leadId: mensagens.leadId, texto: mensagens.texto })
    .from(mensagens)
    .where(eq(mensagens.status, "aprovada"))
    .orderBy(desc(mensagens.prioridade), mensagens.criadoEm)
    .limit(1);
  const proximaLead = proxima
    ? (
        await db
          .select({ nome: leads.nome, cidade: leads.cidade, score: leads.score, categoria: leads.categoria })
          .from(leads)
          .where(eq(leads.id, proxima.leadId))
          .limit(1)
      )[0]
    : null;

  const [ultimoErro] = await db
    .select({ leadId: mensagens.leadId, erro: mensagens.erro, atualizadoEm: mensagens.atualizadoEm })
    .from(mensagens)
    .where(eq(mensagens.status, "erro"))
    .orderBy(desc(mensagens.atualizadoEm))
    .limit(1);
  const erroLead = ultimoErro
    ? (await db.select({ nome: leads.nome }).from(leads).where(eq(leads.id, ultimoErro.leadId)).limit(1))[0]
    : null;

  const [ultimaTentativa] = await db
    .select({ atualizadoEm: mensagens.atualizadoEm })
    .from(mensagens)
    .where(inArray(mensagens.status, ["enviada", "entregue", "erro"]))
    .orderBy(desc(mensagens.atualizadoEm))
    .limit(1);

  /**
   * Resumo do dia — só o que aconteceu hoje, para não confundir com o
   * histórico inteiro. `respondidasHoje`/`errosHoje` olham para quando a
   * MUDANÇA aconteceu (`atualizadoEm`), não para quando a mensagem nasceu.
   */
  const hojeInicio = inicioDoDia();
  const [{ n: respondidasHoje }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(and(eq(mensagens.status, "respondida"), gte(mensagens.respondidaEm, hojeInicio)));
  const [{ n: errosHoje }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(and(eq(mensagens.status, "erro"), gte(mensagens.atualizadoEm, hojeInicio)));

  const recentes = await db
    .select({ leadId: mensagens.leadId, status: mensagens.status, quando: mensagens.atualizadoEm })
    .from(mensagens)
    .where(inArray(mensagens.status, ["enviada", "entregue", "respondida", "erro"]))
    .orderBy(desc(mensagens.atualizadoEm))
    .limit(5);
  const nomesRecentes = recentes.length
    ? await db
        .select({ id: leads.id, nome: leads.nome })
        .from(leads)
        .where(inArray(leads.id, recentes.map((r) => r.leadId)))
    : [];
  const nomePorId = new Map(nomesRecentes.map((l) => [l.id, l.nome]));
  const ultimosEnvios = recentes.map((r) => ({
    lead: nomePorId.get(r.leadId) ?? "?",
    status: r.status,
    quando: r.quando,
  }));

  const statusWorker = calcularStatusWorker({
    bridgeAlcancavel: bridge.alcancavel,
    filaWorkerAtivo: bridge.alcancavel ? bridge.filaWorkerAtivo : null,
    whatsappConectado: bridge.alcancavel ? bridge.whatsappConectado : null,
    bloqueio,
  });

  return NextResponse.json({
    ativa: cfg.automacaoAtiva,
    // Reflete a config REAL (tipo+baseUrl), não o campo `provedorUrl` antigo
    // — esse ficava preenchido de uma migração anterior mesmo sem provedor
    // novo configurado, e fazia esta tela mentir "configurado" à toa.
    provedorConfigurado: cfgProv !== null,
    aguardando: aguardando.length,
    enviadasHoje: hoje,
    respondidasHoje,
    errosHoje,
    ultimosEnvios,
    limiteDiario: cfg.limiteDiario,
    intervaloSegundos: cfg.intervaloSegundos,
    variacaoAleatoriaAtiva: cfg.variacaoAleatoriaAtiva,
    ultimoEnvio: ultimo,
    ultimaTentativa: ultimaTentativa?.atualizadoEm ?? null,
    pode: bloqueio.pode,
    motivo: bloqueio.pode ? null : bloqueio.motivo,
    esperarSegundos: bloqueio.pode ? 0 : (bloqueio.esperarSegundos ?? 0),
    proximaMensagem: proxima
      ? {
          lead: proximaLead?.nome ?? "?",
          cidade: proximaLead?.cidade ?? null,
          categoria: proximaLead?.categoria ?? null,
          pontuacao: proximaLead?.score ?? null,
          trecho: proxima.texto.slice(0, 80),
        }
      : null,
    ultimoErro: ultimoErro
      ? { lead: erroLead?.nome ?? "?", motivo: ultimoErro.erro, quando: ultimoErro.atualizadoEm }
      : null,
    horarioPermitido: { ativo: cfg.horarioEnvioAtivo, inicio: cfg.horarioInicio, fim: cfg.horarioFim },
    bridge,
    statusWorker,
  });
}

/**
 * O envio em si mora em `lib/fila.ts`, compartilhado com a porta externa.
 * Duas cópias da mesma sequência de travas é como uma delas fica para trás.
 */
export async function POST(request: Request) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      modulo: "http",
      rota: "/api/automacao/fila",
      userAgent: request.headers.get("user-agent") ?? "desconhecido",
    }),
  );
  return NextResponse.json(await enviarProxima(undefined, { origem: "automacao/fila (painel)" }));
}
