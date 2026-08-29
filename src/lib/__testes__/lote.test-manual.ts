import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq, inArray, and } from "drizzle-orm";
import { db, leads, mensagens } from "@/lib/db";
import { lerConfig, proximaDaFila, podeEnviarAgora } from "@/lib/fila";

/**
 * Disparo em lote. O que este teste protege:
 *  1. aprovar em lote só promove RASCUNHO — aprovar algo já enviado não existe;
 *  2. a fila entrega um por vez, na ordem de criação;
 *  3. lead que vira "não contatar" no meio do lote é cancelado pela fila,
 *     não enviado — a revalidação acontece no envio, não na aprovação.
 */
async function main() {
  let falhas = 0;
  const ok = (t: string, c: boolean, d = "") => {
    console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
    if (!c) falhas++;
  };

  const cfg = await lerConfig();
  const criados: string[] = [];

  // 3 leads descartáveis
  for (let i = 0; i < 3; i++) {
    const [l] = await db.insert(leads).values({
      placeId: `zz-lote-${Date.now()}-${i}`, nome: `ZZ Lote ${i}`, categoria: "car_repair",
      cidade: "Uberlândia", statusSite: "sem-site", score: 50,
      whatsapp: `https://wa.me/553499988770${i}`,
    }).returning();
    criados.push(l.id);
    await db.insert(mensagens).values({ leadId: l.id, texto: `msg ${i}`, status: "rascunho" });
  }

  const meus = () => db.select().from(mensagens).where(inArray(mensagens.leadId, criados));

  // --- aprovar em lote ---
  const ids = (await meus()).map((m) => m.id);
  const promovidas = await db.update(mensagens)
    .set({ status: "aprovada", aprovadaEm: new Date() })
    .where(and(inArray(mensagens.id, ids), eq(mensagens.status, "rascunho")))
    .returning();
  ok("aprovou os 3 rascunhos", promovidas.length === 3, String(promovidas.length));

  // aprovar de novo nao deve mexer em nada (ja nao sao rascunho)
  const denovo = await db.update(mensagens)
    .set({ status: "aprovada" })
    .where(and(inArray(mensagens.id, ids), eq(mensagens.status, "rascunho")))
    .returning();
  ok("aprovar de novo nao promove nada", denovo.length === 0, String(denovo.length));

  /**
   * ISOLAMENTO: banco real, pode ter campanha de verdade com centenas de
   * mensagens aprovadas e prioridade calculada por pontuação. Prioridade
   * absurda garante que a fila devolva ESTAS 3 primeiro, sem depender de o
   * banco estar vazio — mesma técnica de campanha.test-manual.ts.
   */
  await db.update(mensagens).set({ prioridade: 999_999_999 }).where(inArray(mensagens.id, ids));

  // --- fila entrega um por vez ---
  const p1 = await proximaDaFila(cfg);
  ok("fila devolve um lead", !!p1, p1 ? p1.lead.nome : "nada");
  ok("devolve o mais antigo primeiro", p1?.lead.nome === "ZZ Lote 0", p1?.lead.nome ?? "");

  // --- lead marcado nao-contatar no meio do lote ---
  await db.update(leads).set({ naoContatar: true }).where(eq(leads.id, criados[0]));
  const p2 = await proximaDaFila(cfg);
  ok("pula quem virou nao-contatar", p2?.lead.nome !== "ZZ Lote 0", p2?.lead.nome ?? "nada");

  const cancelada = (await meus()).find((m) => m.leadId === criados[0]);
  ok("e cancela com motivo, nao some calado",
     cancelada?.status === "cancelada" && !!cancelada.erro,
     `${cancelada?.status} / ${cancelada?.erro}`);

  // --- trava global ---
  // Não assume ligada nem desligada: lê a config real e confere a coerência.
  const bloqueio = await podeEnviarAgora(cfg);
  ok(
    "trava global coerente com a config",
    cfg.automacaoAtiva && cfg.provedorUrl ? true : !bloqueio.pode,
    `ativa=${cfg.automacaoAtiva} provedor=${Boolean(cfg.provedorUrl)} pode=${bloqueio.pode}`,
  );

  await db.delete(leads).where(inArray(leads.id, criados));
  ok("limpou o cenario", (await meus()).length === 0);

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
