import { eq } from "drizzle-orm";
import { db, mensagens, conversas, configuracoes, respostasAutomaticas, type Lead } from "@/lib/db";
import { INTENCOES_COM_RESPOSTA_AUTOMATICA, type IntencaoComRespostaAutomatica } from "@/lib/db/schema";
import { enviadasHoje, ultimoEnvio, lerConfig, numeroDoLead } from "@/lib/fila";
import { estadoIntegracao, lerConfigProvedor } from "@/lib/integracao";
import { provedorDe } from "@/lib/providers";
import { resolverSaudacao } from "@/lib/saudacao";
import { registrar } from "@/lib/campanha";
import { LIMIAR_CONFIANCA, type Classificacao, type Intencao } from "@/lib/classificar";

/**
 * Resposta automática: o lead respondeu, o sistema responde de volta.
 *
 * NÃO passa pela fila de campanha (lib/fila.ts). A fila tem uma trava
 * deliberada — "lead com mensagem `respondida` no histórico nunca mais
 * recebe nada" — que existe para parar follow-up de VENDA assim que a
 * conversa vira humana. Só que é exatamente essa trava que acabou de disparar
 * quando o webhook marcou a mensagem como `respondida`, um instante antes de
 * chegar aqui. Reaproveitar a fila faria a resposta automática se bloquear
 * sozinha.
 *
 * Por isso este arquivo faz um envio direto, e só reaproveita as travas
 * GLOBAIS que ainda fazem sentido (integração pronta, teto diário, intervalo
 * entre envios) — nunca a elegibilidade de campanha.
 */

export type ResultadoAutoResposta =
  | { enviada: true }
  | { enviada: false; motivo: string };

function ehIntencaoComResposta(i: Intencao): i is IntencaoComRespostaAutomatica {
  return (INTENCOES_COM_RESPOSTA_AUTOMATICA as readonly string[]).includes(i);
}

/** Troca {{nome}} e {{cidade}} pelos dados do lead. Sem chave = texto igual. */
function preencherVariaveis(texto: string, lead: Lead): string {
  return texto
    .replace(/\{\{\s*nome\s*\}\}/gi, lead.nome)
    .replace(/\{\{\s*cidade\s*\}\}/gi, lead.cidade ?? "");
}

export async function tentarResponderAutomaticamente(
  lead: Lead,
  classificacao: Classificacao,
): Promise<ResultadoAutoResposta> {
  const intencao = classificacao.intencao;

  if (!ehIntencaoComResposta(intencao)) {
    return { enviada: false, motivo: "Categoria sem resposta automática." };
  }
  if (classificacao.confianca < LIMIAR_CONFIANCA) {
    return { enviada: false, motivo: "Confiança abaixo do limiar." };
  }
  if (lead.atendimentoHumano) {
    return { enviada: false, motivo: "Humano assumiu esta conversa." };
  }
  if (lead.naoContatar) {
    return { enviada: false, motivo: "Lead marcado como não contatar." };
  }
  const numero = numeroDoLead(lead);
  if (!numero) {
    return { enviada: false, motivo: "Lead sem WhatsApp." };
  }

  const [cfgGeral] = await db.select().from(configuracoes).limit(1);
  if (!cfgGeral?.respostaAutomaticaAtiva) {
    return { enviada: false, motivo: "Resposta automática desligada." };
  }

  const [regra] = await db
    .select()
    .from(respostasAutomaticas)
    .where(eq(respostasAutomaticas.intencao, intencao))
    .limit(1);
  if (!regra?.ativa || !regra.texto.trim()) {
    return { enviada: false, motivo: "Sem texto configurado para esta categoria." };
  }

  // Travas globais reaproveitadas de lib/fila.ts — mesmas checagens, sem a
  // parte de elegibilidade de campanha (automacaoAtiva/avaliarContato).
  const integracao = await estadoIntegracao();
  if (!integracao.pronta) {
    return { enviada: false, motivo: "WhatsApp não configurado." };
  }
  const cfg = await lerConfig();
  const hoje = await enviadasHoje();
  if (hoje >= cfg.limiteDiario) {
    return { enviada: false, motivo: "Teto diário atingido." };
  }
  const ultimo = await ultimoEnvio();
  if (ultimo && (Date.now() - ultimo.getTime()) / 1000 < cfg.intervaloSegundos) {
    return { enviada: false, motivo: "Aguardando o intervalo entre envios." };
  }

  const cfgProv = await lerConfigProvedor();
  if (!cfgProv) return { enviada: false, motivo: "Provedor não configurado." };

  const texto = resolverSaudacao(preencherVariaveis(regra.texto, lead), new Date());
  const r = await provedorDe(cfgProv.tipo).enviar(cfgProv, numero, texto);
  if (!r.ok) {
    await registrar("AUTO_RESPONSE_SKIPPED", `Falha ao responder ${lead.nome}: ${r.erro}`, {
      leadId: lead.id,
    });
    return { enviada: false, motivo: r.erro };
  }

  const agora = new Date();

  // Grava em `mensagens` só para continuar contando certo em enviadasHoje()/
  // ultimoEnvio() — não é uma mensagem de campanha, nunca entra na fila.
  await db.insert(mensagens).values({
    leadId: lead.id,
    texto,
    status: "enviada",
    origem: "resposta-automatica",
    provedorId: r.provedorId,
    campanhaId: null,
    enviadaEm: agora,
  });

  await db.insert(conversas).values({
    leadId: lead.id,
    direcao: "enviada",
    autor: "automatico",
    texto,
    provedorMsgId: r.provedorId,
    lida: true,
  });

  await registrar("AUTO_RESPONSE_SENT", `Resposta automática enviada para ${lead.nome} (${intencao})`, {
    leadId: lead.id,
    dados: { intencao },
  });

  return { enviada: true };
}
