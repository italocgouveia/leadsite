import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, leads, mensagens, conversas } from "@/lib/db";
import { classificar, LIMIAR_CONFIANCA } from "@/lib/classificar";
import { registrar } from "@/lib/campanha";
import { tentarResponderAutomaticamente } from "@/lib/resposta-automatica";
import { buscarLeadPorWhatsapp } from "@/lib/leads";
import { lerConfigProvedor } from "@/lib/integracao";
import { provedorDe } from "@/lib/providers";
import { CONFIG_ID } from "@/lib/config";
import { configuracoes } from "@/lib/db";

/**
 * Webhook de status do provedor.
 *
 * Fica FORA do gate de sessão (ver proxy.ts) e autentica pelo `WEBHOOK_SECRET`
 * — provedor não faz login com Google.
 *
 * Segredo PRÓPRIO, diferente do `API_TOKEN` que autentica `/api/externo/*`.
 * São direções e riscos diferentes: `API_TOKEN` autoriza LER a base de leads
 * e PEDIR o próximo envio da fila; `WEBHOOK_SECRET` só autoriza avisar "o
 * lead respondeu isto". Vazar um não devia abrir o outro.
 *
 * A resposta do lead é o evento mais importante do sistema. Ao chegar aqui:
 *
 *   1. a conversa é salva com o texto ORIGINAL;
 *   2. tudo que estava na fila para aquele lead é cancelado;
 *   3. a intenção é classificada com score de confiança;
 *   4. o funil só se move se a confiança passar do limiar;
 *   5. opt-out marca `naoContatar` de forma permanente.
 *
 * IDEMPOTÊNCIA: provedor reenvia evento quando não recebe 200 rápido. O índice
 * único em `conversas.provedorMsgId` faz a segunda entrega virar no-op — sem
 * isso, a mesma resposta viraria três conversas e três classificações, e a
 * taxa de resposta do dashboard sairia inflada.
 */

export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  const esperado = process.env.WEBHOOK_SECRET;
  if (!esperado) return false;
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") === esperado ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") === esperado
  );
}

/**
 * A tradução do evento agora vem do ADAPTADOR do provedor, não de uma regex
 * genérica aqui. Evolution e WAHA nomeiam e aninham os campos de formas
 * diferentes, e a regex única confundia eco da própria mensagem enviada com
 * resposta do lead — o que tirava o lead da automação sozinho.
 */

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });

  const agora = new Date();

  // Marca que o webhook está vivo — a tela usa isso para o status verde.
  await db
    .update(configuracoes)
    .set({ webhookUltimoEm: agora })
    .where(eq(configuracoes.id, CONFIG_ID));

  const cfgProv = await lerConfigProvedor();
  const ev = provedorDe(cfgProv?.tipo).normalizarWebhook(corpo);

  /**
   * `daNossaConta` separa "o lead respondeu" de "eco da mensagem que EU
   * mandei". Sem isso, o próprio envio viraria resposta e o lead sairia da
   * automação sozinho, com taxa de resposta inflada no dashboard.
   */
  if (ev.daNossaConta && ev.tipo !== "entregue" && ev.tipo !== "lida") {
    return NextResponse.json({ ok: true, ignorado: "eco do proprio envio" });
  }

  const evento =
    ev.tipo === "recebida" ? "respondida" : ev.tipo === "entregue" || ev.tipo === "lida" ? "entregue" : null;
  if (!evento) return NextResponse.json({ ok: true, ignorado: true });

  const provedorId = ev.provedorMsgId;
  const numero = ev.numero ?? "";

  // --- acha a mensagem/lead correspondente ---
  let alvo = provedorId
    ? (await db.select().from(mensagens).where(eq(mensagens.provedorId, provedorId)).limit(1))[0]
    : undefined;

  let lead = alvo
    ? (await db.select().from(leads).where(eq(leads.id, alvo.leadId)).limit(1))[0]
    : undefined;

  if (!lead && numero) {
    lead = await buscarLeadPorWhatsapp(numero);
    if (lead && !alvo) {
      alvo = (
        await db
          .select()
          .from(mensagens)
          .where(and(eq(mensagens.leadId, lead.id), inArray(mensagens.status, ["enviada", "entregue"])))
          .limit(1)
      )[0];
    }
  }

  if (!lead) {
    /**
     * Resposta real sem lead correspondente não pode desaparecer em silêncio
     * — nem quando é um LID que a bridge não conseguiu resolver, nem quando é
     * um número que resolveu mas não tem lead cadastrado. Grava o mínimo para
     * dar para investigar depois, sem guardar o payload bruto inteiro.
     */
    const lidBruto = typeof corpo.lid === "string" ? corpo.lid : null;
    const tipoIdentificador = typeof corpo.tipoIdentificador === "string" ? corpo.tipoIdentificador : null;
    const resolvido = typeof corpo.resolvido === "boolean" ? corpo.resolvido : null;
    const motivo =
      resolvido === false ? "lid_nao_resolvido" : numero ? "numero_sem_lead_cadastrado" : "sem_identificador";

    await registrar("INCOMING_UNMATCHED", `Mensagem recebida sem lead correspondente (${motivo})`, {
      dados: {
        identificador: numero || lidBruto || "desconhecido",
        numero: numero || null,
        lid: lidBruto,
        tipoIdentificador,
        resolvido,
        mensagemId: provedorId,
        trecho: ev.texto ? ev.texto.slice(0, 200) : null,
        motivo,
      },
    });

    return NextResponse.json({ ok: true, semCorrespondencia: true });
  }

  // ---------------------------------------------------------- entrega
  if (evento === "entregue") {
    if (alvo) {
      await db
        .update(mensagens)
        .set({ status: "entregue", entregueEm: agora, atualizadoEm: agora })
        .where(eq(mensagens.id, alvo.id));
      await registrar("MESSAGE_DELIVERED", `Entregue para ${lead.nome}`, {
        leadId: lead.id,
        campanhaId: alvo.campanhaId ?? undefined,
      });
    }
    return NextResponse.json({ ok: true, status: "entregue" });
  }

  // ---------------------------------------------------------- resposta
  const texto = ev.texto;

  /**
   * Grava a conversa primeiro. Se o provedorMsgId repetir, o índice único
   * derruba o insert e a gente encerra aqui — todo o resto (cancelar fila,
   * classificar, mover funil) já aconteceu na primeira entrega.
   */
  try {
    await db.insert(conversas).values({
      leadId: lead.id,
      direcao: "recebida",
      texto: texto || "(sem texto)",
      provedorMsgId: provedorId,
      lida: false,
    });
  } catch {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  // --- corta a automação para este lead, sempre ---
  if (alvo) {
    await db
      .update(mensagens)
      .set({ status: "respondida", respondidaEm: agora, atualizadoEm: agora })
      .where(eq(mensagens.id, alvo.id));
  }
  await db
    .update(mensagens)
    .set({ status: "cancelada", erro: "Lead respondeu", atualizadoEm: agora })
    .where(
      and(
        eq(mensagens.leadId, lead.id),
        inArray(mensagens.status, ["rascunho", "aprovada", "na-fila"]),
      ),
    );

  await registrar("RESPONSE_RECEIVED", `${lead.nome} respondeu`, {
    leadId: lead.id,
    campanhaId: alvo?.campanhaId ?? undefined,
    dados: { texto: texto.slice(0, 200) },
  });

  // --- classifica ---
  const c = classificar(texto);
  const moveSozinho = c.confianca >= LIMIAR_CONFIANCA && c.etapaSugerida !== null;

  await db
    .update(conversas)
    .set({
      intencao: c.intencao,
      confianca: c.confianca,
      motivoClassificacao: c.motivo,
    })
    .where(
      provedorId
        ? eq(conversas.provedorMsgId, provedorId)
        : eq(conversas.leadId, lead.id),
    );

  await registrar(
    "INTENT_CLASSIFIED",
    `${lead.nome}: ${c.intencao} (${c.confianca}%) — ${c.motivo}`,
    { leadId: lead.id, dados: { intencao: c.intencao, confianca: c.confianca } },
  );

  /**
   * O funil só anda com confiança suficiente. Abaixo do limiar o lead para em
   * "respondeu" e espera você — mover errado é pior que não mover, porque
   * ninguém revisa o que o sistema já classificou.
   */
  const etapaNova = moveSozinho ? c.etapaSugerida! : "respondeu";

  await db
    .update(leads)
    .set({
      etapa: etapaNova,
      intencao: c.intencao,
      confiancaIntencao: c.confianca,
      ultimaInteracao: agora,
      noCrm: true,
      ...(c.optOut ? { naoContatar: true } : {}),
      atualizadoEm: agora,
    })
    .where(eq(leads.id, lead.id));

  await registrar("PIPELINE_MOVED", `${lead.nome} → ${etapaNova}`, {
    leadId: lead.id,
    dados: { automatico: moveSozinho, confianca: c.confianca },
  });

  if (c.optOut) {
    await registrar("LEAD_OPTED_OUT", `${lead.nome} pediu para não receber mais`, {
      leadId: lead.id,
    });
  }

  const autoResposta = await tentarResponderAutomaticamente(lead, c);

  return NextResponse.json({
    ok: true,
    status: "respondida",
    intencao: c.intencao,
    confianca: c.confianca,
    moveuFunil: moveSozinho,
    etapa: etapaNova,
    respostaAutomatica: autoResposta,
  });
}
