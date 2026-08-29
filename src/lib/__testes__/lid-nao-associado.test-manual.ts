// Teste manual: uma resposta real sem lead correspondente (LID não resolvido
// pela bridge, ou número resolvido mas sem lead cadastrado) precisa gerar um
// evento INCOMING_UNMATCHED em vez de desaparecer em silêncio.
//
// Não toca em `leads`, `mensagens` nem `campanhas` — só insere e depois apaga,
// por ID exato, as próprias linhas de `eventos` que este teste cria.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, eventos, leads } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { POST } from "@/app/api/automacao/status/route";

function afirmar(nome: string, condicao: boolean) {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  console.log(`OK: ${nome}`);
}

async function postar(corpo: Record<string, unknown>) {
  const url = `http://localhost:3100/api/automacao/status?token=${process.env.WEBHOOK_SECRET}`;
  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return POST(req);
}

async function main() {
  if (!process.env.WEBHOOK_SECRET) {
    throw new Error("WEBHOOK_SECRET não configurado em .env.local — não dá para testar o webhook autenticado.");
  }

  const marcador = `teste-lid-${Date.now()}`;
  const idsCriados: string[] = [];

  try {
    // --- Caso 1: LID não resolvido pela bridge ---------------------------
    const resp1 = await postar({
      event: "message.received",
      id: `${marcador}-lid`,
      from: null,
      fromMe: false,
      text: "Quanto custa?",
      lid: "44637678997546",
      tipoIdentificador: "lid",
      resolvido: false,
    });
    const json1 = await resp1.json();
    afirmar("LID não resolvido: resposta ok+semCorrespondencia", json1.ok === true && json1.semCorrespondencia === true);

    // --- Caso 2: número resolvido, mas sem lead cadastrado ----------------
    const numeroInexistente = "5599999990000";
    const leadExistente = await db
      .select()
      .from(leads)
      .where(eq(leads.whatsapp, `https://wa.me/${numeroInexistente}`))
      .limit(1);
    afirmar("número de teste não pertence a nenhum lead real", leadExistente.length === 0);

    const resp2 = await postar({
      event: "message.received",
      id: `${marcador}-pn`,
      from: numeroInexistente,
      fromMe: false,
      text: "Oi, quem fala?",
      lid: null,
      tipoIdentificador: "pn",
      resolvido: true,
    });
    const json2 = await resp2.json();
    afirmar("número sem lead: resposta ok+semCorrespondencia", json2.ok === true && json2.semCorrespondencia === true);

    // --- Confere o que foi gravado em `eventos` ----------------------------
    // A descrição não carrega o marcador — busca pelas últimas N e filtra pelo dado gravado.
    const recentes = await db
      .select()
      .from(eventos)
      .where(eq(eventos.tipo, "INCOMING_UNMATCHED"))
      .orderBy(desc(eventos.criadoEm))
      .limit(10);

    const evLid = recentes.find((e) => (e.dados as Record<string, unknown> | null)?.mensagemId === `${marcador}-lid`);
    const evPn = recentes.find((e) => (e.dados as Record<string, unknown> | null)?.mensagemId === `${marcador}-pn`);

    afirmar("evento do caso LID foi gravado", !!evLid);
    afirmar("evento do caso número foi gravado", !!evPn);
    if (evLid) idsCriados.push(evLid.id);
    if (evPn) idsCriados.push(evPn.id);

    const dLid = evLid?.dados as Record<string, unknown>;
    afirmar("evento LID: motivo = lid_nao_resolvido", dLid?.motivo === "lid_nao_resolvido");
    afirmar("evento LID: numero = null", dLid?.numero === null);
    afirmar("evento LID: lid preservado", dLid?.lid === "44637678997546");
    afirmar("evento LID: resolvido = false", dLid?.resolvido === false);
    afirmar("evento LID: trecho da mensagem presente", typeof dLid?.trecho === "string" && (dLid.trecho as string).includes("Quanto custa"));

    const dPn = evPn?.dados as Record<string, unknown>;
    afirmar("evento número: motivo = numero_sem_lead_cadastrado", dPn?.motivo === "numero_sem_lead_cadastrado");
    afirmar("evento número: numero preservado", dPn?.numero === numeroInexistente);
    afirmar("evento número: lid = null", dPn?.lid === null);
    afirmar("evento número: resolvido = true", dPn?.resolvido === true);

    afirmar("nenhum lead foi criado (identificador desconhecido continua sem lead)", leadExistente.length === 0);

    console.log("\nTodos os testes de INCOMING_UNMATCHED passaram.");
  } finally {
    for (const id of idsCriados) {
      await db.delete(eventos).where(eq(eventos.id, id));
    }
    console.log(`Limpeza: ${idsCriados.length} evento(s) de teste removido(s) por ID exato.`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
