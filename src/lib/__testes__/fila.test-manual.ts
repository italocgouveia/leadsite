import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq } from "drizzle-orm";
import { db, leads, mensagens } from "@/lib/db";
import { podeContatar, lerConfig, type Config } from "@/lib/fila";

/**
 * As travas da fila. Cada uma existe para o número não ser banido ou para
 * não queimar um lead. Usa lead descartável; nada real é tocado.
 */
async function main() {
  let falhas = 0;
  const ok = (t: string, c: boolean, d = "") => {
    console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
    if (!c) falhas++;
  };

  const cfg: Config = { ...(await lerConfig()), janelaRecontatoDias: 30 };
  console.log(`config: intervalo ${cfg.intervaloSegundos}s | teto ${cfg.limiteDiario}/dia | recontato ${cfg.janelaRecontatoDias}d\n`);
  ok("intervalo nunca abaixo de 30s", cfg.intervaloSegundos >= 30, String(cfg.intervaloSegundos));

  const [lead] = await db.insert(leads).values({
    placeId: `zz-fila-${Date.now()}`, nome: "ZZ Teste Fila", categoria: "car_repair",
    cidade: "Uberlândia", statusSite: "sem-site", score: 50,
    whatsapp: "https://wa.me/5534999887766",
  }).returning();

  ok("lead novo com zap pode receber", (await podeContatar(lead, cfg)).pode);

  // trava 1: naoContatar
  const [optOut] = await db.update(leads).set({ naoContatar: true }).where(eq(leads.id, lead.id)).returning();
  const r1 = await podeContatar(optOut, cfg);
  ok("naoContatar bloqueia", !r1.pode, r1.pode ? "" : r1.motivo);
  await db.update(leads).set({ naoContatar: false }).where(eq(leads.id, lead.id));

  // trava 2: sem whatsapp
  const semZap = { ...lead, whatsapp: null };
  ok("sem WhatsApp bloqueia", !(await podeContatar(semZap, cfg)).pode);

  // trava 3: ja tem mensagem aguardando
  const [m1] = await db.insert(mensagens).values({ leadId: lead.id, texto: "oi", status: "aprovada" }).returning();
  const r3 = await podeContatar(lead, cfg);
  ok("nao empilha segunda mensagem", !r3.pode, r3.pode ? "" : r3.motivo);

  // trava 4: contatado recentemente
  await db.update(mensagens).set({ status: "enviada", enviadaEm: new Date() }).where(eq(mensagens.id, m1.id));
  const r4 = await podeContatar(lead, cfg);
  ok("bloqueia recontato dentro da janela", !r4.pode, r4.pode ? "" : r4.motivo);

  // fora da janela volta a poder
  await db.update(mensagens).set({ enviadaEm: new Date(Date.now() - 60 * 86400000) }).where(eq(mensagens.id, m1.id));
  ok("fora da janela libera de novo", (await podeContatar(lead, cfg)).pode);

  // trava 5: respondeu = nunca mais
  await db.update(mensagens).set({ status: "respondida" }).where(eq(mensagens.id, m1.id));
  const r5 = await podeContatar(lead, cfg);
  ok("quem respondeu sai da automacao pra sempre", !r5.pode, r5.pode ? "" : r5.motivo);

  await db.delete(leads).where(eq(leads.id, lead.id));
  const sobrou = await db.select().from(mensagens).where(eq(mensagens.leadId, lead.id));
  ok("mensagens somem com o lead (cascade)", sobrou.length === 0);

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
