import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, mensagens, campanhas } from "@/lib/db";
import { lerConfig, podeEnviarAgora, enviadasHoje } from "@/lib/fila";
import { estadoIntegracao, lerConfigProvedor } from "@/lib/integracao";
import { consultarBridge, type SaudeBridge } from "@/lib/bridge";

/**
 * Checagem de pré-voo: tudo que precisa estar certo ANTES de o primeiro
 * WhatsApp sair.
 *
 * POR QUE EXISTE
 *
 * As travas de envio sempre existiram, mas só apareciam DEPOIS de ligar —
 * uma por vez, uma a cada mensagem que não saía, no texto pequeno do painel.
 * Você ligava a automação e ficava adivinhando por que nada acontecia. Aqui a
 * mesma verificação acontece antes, de uma vez, e o resultado é uma lista de
 * pendências em português.
 *
 * NÃO envia, NÃO liga automação, NÃO reserva mensagem. É só leitura — pode ser
 * chamada à vontade.
 */
export const dynamic = "force-dynamic";

export type Pendencia = { item: string; ok: boolean; detalhe?: string };

export async function GET() {
  const cfg = await lerConfig();
  const cfgProv = await lerConfigProvedor();

  const [integracao, bloqueio, hoje, bridge] = await Promise.all([
    estadoIntegracao(),
    podeEnviarAgora(cfg),
    enviadasHoje(),
    cfgProv ? consultarBridge(cfgProv) : Promise.resolve<SaudeBridge>({ alcancavel: false }),
  ]);

  const [prontas] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(inArray(mensagens.status, ["aprovada", "na-fila"]));

  const [rascunhos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(eq(mensagens.status, "rascunho"));

  const rodando = await db
    .select({ id: campanhas.id, nome: campanhas.nome })
    .from(campanhas)
    .where(and(eq(campanhas.status, "rodando")));

  const aprovadas = prontas?.n ?? 0;
  const restanteHoje = Math.max(cfg.limiteDiario - hoje, 0);

  /**
   * Cada item é uma condição que, sozinha, impede o disparo. São as MESMAS
   * que `podeEnviarAgora` revalida a cada mensagem — não uma cópia relaxada.
   * Duplicar a regra em versão mais frouxa aqui seria pior que não checar:
   * daria um "tudo certo" que a fila desmente depois.
   */
  const pendencias: Pendencia[] = [
    {
      item: "Mensagens aprovadas na fila",
      ok: aprovadas > 0,
      detalhe:
        aprovadas > 0
          ? `${aprovadas} pronta(s) para sair`
          : rascunhos?.n
            ? `${rascunhos.n} em rascunho — aprove uma campanha primeiro`
            : "nenhuma mensagem preparada",
    },
    {
      item: "Campanha iniciada",
      ok: rodando.length > 0,
      detalhe: rodando.length ? rodando.map((c) => c.nome).join(", ") : "nenhuma campanha rodando",
    },
    {
      item: "Integração configurada",
      ok: integracao.pronta,
      detalhe: integracao.pronta
        ? "provedor, token e teste de conexão OK"
        : (integracao.erro ??
          `falta: ${integracao.pendencias.filter((p) => !p.feito).map((p) => p.item).join(", ")}`),
    },
    {
      item: "Bridge acessível",
      ok: bridge.alcancavel,
      detalhe: bridge.alcancavel ? "respondendo" : "não respondeu na URL configurada",
    },
    {
      item: "WhatsApp conectado",
      ok: bridge.alcancavel && bridge.whatsappConectado,
      detalhe: bridge.alcancavel
        ? bridge.whatsappConectado
          ? "sessão ativa"
          : `estado: ${bridge.whatsappEstado}`
        : "bridge inacessível",
    },
    {
      item: "Teto diário disponível",
      ok: restanteHoje > 0,
      detalhe: `${hoje} enviadas hoje de ${cfg.limiteDiario} — restam ${restanteHoje}`,
    },
    {
      item: "Horário permitido",
      ok: bloqueio.pode || bloqueio.motivo !== "Fora do horário permitido.",
      detalhe: cfg.horarioEnvioAtivo
        ? `janela ${cfg.horarioInicio}–${cfg.horarioFim}`
        : "sem restrição de horário",
    },
  ];

  const faltando = pendencias.filter((p) => !p.ok);

  return NextResponse.json({
    pode: faltando.length === 0,
    pendencias,
    faltando: faltando.map((p) => p.item),
    resumo: {
      aprovadas,
      rascunhos: rascunhos?.n ?? 0,
      /** Quantas de fato saem hoje: o menor entre fila e o que resta do teto. */
      sairaoHoje: Math.min(aprovadas, restanteHoje),
      enviadasHoje: hoje,
      limiteDiario: cfg.limiteDiario,
      intervaloSegundos: cfg.intervaloSegundos,
      campanhas: rodando.map((c) => c.nome),
      automacaoAtiva: cfg.automacaoAtiva,
      workerAtivo: bridge.alcancavel ? bridge.filaWorkerAtivo : false,
    },
  });
}
