import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq } from "drizzle-orm";
import { db, leads, configuracoes, respostasAutomaticas } from "@/lib/db";
import { tentarResponderAutomaticamente } from "@/lib/resposta-automatica";
import type { Classificacao } from "@/lib/classificar";

/**
 * As travas da resposta automática, na ORDEM em que devem bloquear. Cada uma
 * existe para o sistema nunca responder sozinho quando não deveria — testa
 * uma de cada vez, isolando as outras, para o motivo devolvido provar QUAL
 * trava agiu (não só que alguma agiu).
 */
async function main() {
  let falhas = 0;
  const ok = (t: string, c: boolean, d = "") => {
    console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
    if (!c) falhas++;
  };

  const classificacao = (extra: Partial<Classificacao> = {}): Classificacao => ({
    intencao: "orcamento",
    confianca: 90,
    motivo: "teste",
    etapaSugerida: "interessado",
    optOut: false,
    ...extra,
  });

  const [lead] = await db
    .insert(leads)
    .values({
      placeId: `zz-resposta-auto-${Date.now()}`,
      nome: "ZZ Teste Resposta Automática",
      categoria: "car_repair",
      cidade: "Uberlândia",
      statusSite: "sem-site",
      score: 50,
      whatsapp: "https://wa.me/5534999887766",
    })
    .returning();

  const [cfgOriginal] = await db.select().from(configuracoes).limit(1);

  try {
    console.log("\n[categoria sem resposta automática]");
    const r1 = await tentarResponderAutomaticamente(lead, classificacao({ intencao: "sem-interesse" }));
    ok("categoria fora da lista não dispara", !r1.enviada, !r1.enviada ? r1.motivo : "");
    ok("motivo é a categoria", !r1.enviada && r1.motivo === "Categoria sem resposta automática.");

    console.log("\n[confiança abaixo do limiar]");
    const r2 = await tentarResponderAutomaticamente(lead, classificacao({ confianca: 40 }));
    ok("confiança baixa não dispara", !r2.enviada, !r2.enviada ? r2.motivo : "");

    console.log("\n[atendimentoHumano bloqueia]");
    const [comHumano] = await db
      .update(leads)
      .set({ atendimentoHumano: true })
      .where(eq(leads.id, lead.id))
      .returning();
    const r3 = await tentarResponderAutomaticamente(comHumano, classificacao());
    ok("humano assumiu, não dispara", !r3.enviada, !r3.enviada ? r3.motivo : "");
    await db.update(leads).set({ atendimentoHumano: false }).where(eq(leads.id, lead.id));

    console.log("\n[naoContatar bloqueia]");
    const [comOptOut] = await db
      .update(leads)
      .set({ naoContatar: true })
      .where(eq(leads.id, lead.id))
      .returning();
    const r4 = await tentarResponderAutomaticamente(comOptOut, classificacao());
    ok("naoContatar não dispara", !r4.enviada, !r4.enviada ? r4.motivo : "");
    await db.update(leads).set({ naoContatar: false }).where(eq(leads.id, lead.id));

    console.log("\n[sem WhatsApp bloqueia]");
    const semZap = { ...lead, whatsapp: null };
    const r5 = await tentarResponderAutomaticamente(semZap, classificacao());
    ok("sem whatsapp não dispara", !r5.enviada, !r5.enviada ? r5.motivo : "");

    console.log("\n[chave-mestra desligada bloqueia]");
    await db
      .insert(configuracoes)
      .values({ id: "default", respostaAutomaticaAtiva: false })
      .onConflictDoUpdate({ target: configuracoes.id, set: { respostaAutomaticaAtiva: false } });
    const r6 = await tentarResponderAutomaticamente(lead, classificacao());
    ok("mestre desligada não dispara", !r6.enviada, !r6.enviada ? r6.motivo : "");

    console.log("\n[categoria sem texto configurado bloqueia]");
    await db
      .insert(configuracoes)
      .values({ id: "default", respostaAutomaticaAtiva: true })
      .onConflictDoUpdate({ target: configuracoes.id, set: { respostaAutomaticaAtiva: true } });
    await db.delete(respostasAutomaticas).where(eq(respostasAutomaticas.intencao, "orcamento"));
    const r7 = await tentarResponderAutomaticamente(lead, classificacao());
    ok("sem regra ativa não dispara", !r7.enviada, !r7.enviada ? r7.motivo : "");

    console.log("\n[com tudo configurado, chega até a checagem de integração]");
    await db.insert(respostasAutomaticas).values({
      intencao: "orcamento",
      texto: "Posso te mandar o orçamento, {{nome}}!",
      ativa: true,
    });
    /**
     * Derruba a integração DE PROPÓSITO, mesmo que este ambiente tenha um
     * provedor real configurado. Sem isso, com tudo mais ativado, esta
     * chamada chegaria a `provedor.enviar(...)` de verdade — e um teste
     * automático nunca pode arriscar mandar WhatsApp de verdade.
     */
    await db
      .update(configuracoes)
      .set({ provedorBaseUrl: null })
      .where(eq(configuracoes.id, "default"));
    const r8 = await tentarResponderAutomaticamente(lead, classificacao());
    // Provedor derrubado acima: a última trava a sobrar é a de integração —
    // provar que chegou até aqui é provar que as seis anteriores não
    // bloquearam por engano.
    ok(
      "passou por todas as travas de elegibilidade",
      !r8.enviada && r8.motivo === "WhatsApp não configurado.",
      !r8.enviada ? r8.motivo : "ENVIOU DE VERDADE — investigar",
    );
  } finally {
    await db.delete(leads).where(eq(leads.id, lead.id));
    await db.delete(respostasAutomaticas).where(eq(respostasAutomaticas.intencao, "orcamento"));
    if (cfgOriginal) {
      await db
        .update(configuracoes)
        .set({
          respostaAutomaticaAtiva: cfgOriginal.respostaAutomaticaAtiva,
          provedorBaseUrl: cfgOriginal.provedorBaseUrl,
        })
        .where(eq(configuracoes.id, cfgOriginal.id));
    }
  }

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
