import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import http from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db, leads, mensagens, campanhas, configuracoes } from "@/lib/db";
import { enviarProxima, type OpcoesFila } from "@/lib/fila";

/**
 * Retry controlado de falha TEMPORÁRIA (rede/timeout/5xx) vs. falha
 * PERMANENTE (qualquer outro status, ex. 422 "número sem WhatsApp") — ver
 * lib/fila.ts, branch `!r.ok` de `enviarProxima`.
 *
 * Igual ao padrão de concorrencia.test-manual.ts: campanha e leads
 * descartáveis, provedor trocado por um mock HTTP local, config original
 * restaurada em `finally`. Aqui as chamadas são SEQUENCIAIS (não testa
 * concorrência, testa a máquina de estados de uma falha ao longo de várias
 * tentativas), então não precisa de oferta extra de candidatas.
 */

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

async function main() {
  const [campanha] = await db
    .insert(campanhas)
    .values({ nome: `ZZ Retry Temporario — ${Date.now()}`, status: "pausada" })
    .returning();

  const leadIdsCriados: string[] = [];
  const NUMERO_TEMPORARIO = "5599990000001";
  const NUMERO_PERMANENTE = "5599990000002";

  async function novoLead(sufixo: string, numero: string) {
    const [l] = await db
      .insert(leads)
      .values({
        placeId: `zz-retry-${Date.now()}-${sufixo}`,
        nome: `ZZ Retry ${sufixo}`,
        categoria: "car_repair",
        cidade: "Uberlândia",
        statusSite: "sem-site",
        score: 50,
        whatsapp: `https://wa.me/${numero}`,
      })
      .returning();
    leadIdsCriados.push(l.id);
    return l;
  }

  async function novaMensagem(leadId: string) {
    const [m] = await db
      .insert(mensagens)
      .values({
        leadId,
        texto: "teste de retry",
        status: "aprovada",
        campanhaId: campanha.id,
        prioridade: 999_999_999,
      })
      .returning();
    return m;
  }

  const mock = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const dados = JSON.parse(corpo || "{}");
      res.setHeader("Content-Type", "application/json");
      if (dados.number === NUMERO_TEMPORARIO) {
        res.statusCode = 500;
        res.end(JSON.stringify({ message: "erro simulado temporário (5xx)" }));
        return;
      }
      if (dados.number === NUMERO_PERMANENTE) {
        res.statusCode = 422;
        res.end(JSON.stringify({ message: "número não tem WhatsApp (simulado)" }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, id: `mock-retry-${Date.now()}` }));
    });
  });
  await new Promise<void>((resolve) => mock.listen(8099, "127.0.0.1", resolve));

  const [cfgOriginal] = await db.select().from(configuracoes).limit(1);
  const restaurarConfig = async () => {
    if (!cfgOriginal) return;
    await db
      .update(configuracoes)
      .set({
        automacaoAtiva: cfgOriginal.automacaoAtiva,
        provedorTipo: cfgOriginal.provedorTipo,
        provedorBaseUrl: cfgOriginal.provedorBaseUrl,
        provedorInstancia: cfgOriginal.provedorInstancia,
        provedorEndpointCustom: cfgOriginal.provedorEndpointCustom,
        provedorToken: cfgOriginal.provedorToken,
        provedorTestadoEm: cfgOriginal.provedorTestadoEm,
        provedorEstado: cfgOriginal.provedorEstado,
        intervaloSegundos: cfgOriginal.intervaloSegundos,
        atualizadoEm: cfgOriginal.atualizadoEm,
      })
      .where(eq(configuracoes.id, cfgOriginal.id));
  };

  try {
    await db
      .update(configuracoes)
      .set({
        automacaoAtiva: true,
        provedorTipo: "custom",
        provedorBaseUrl: "http://127.0.0.1:8099",
        provedorInstancia: null,
        provedorEndpointCustom: "/send",
        provedorToken: "mock-token-retry",
        provedorTestadoEm: new Date(),
        provedorEstado: "mock de teste — nao encaminha para WhatsApp real",
        intervaloSegundos: 30,
        atualizadoEm: new Date(),
      })
      .where(eq(configuracoes.id, "default"));

    await db.update(campanhas).set({ status: "rodando" }).where(eq(campanhas.id, campanha.id));
    const escopo: OpcoesFila = { apenasCampanhaId: campanha.id };

    // ============================================================
    // Falha TEMPORÁRIA — retry até o limite, depois desiste
    // ============================================================
    console.log("\n[temporário] 5xx repetido — deve tentar 3x e só então virar erro");
    const leadT = await novoLead("temp", NUMERO_TEMPORARIO);
    const msgT = await novaMensagem(leadT.id);

    const r1 = await enviarProxima(escopo);
    ok("tentativa 1: enviarProxima reporta falha (não trava)", r1.enviada === false);
    const [depois1] = await db.select().from(mensagens).where(eq(mensagens.id, msgT.id));
    ok("tentativa 1: volta para 'aprovada' (não 'erro')", depois1.status === "aprovada", depois1.status);
    ok("tentativa 1: tentativas=1", depois1.tentativas === 1, String(depois1.tentativas));
    ok("tentativa 1: erro registra qual foi a tentativa", (depois1.erro ?? "").includes("tentativa 1/3"));

    const r2 = await enviarProxima(escopo);
    ok("tentativa 2: ainda reporta falha", r2.enviada === false);
    const [depois2] = await db.select().from(mensagens).where(eq(mensagens.id, msgT.id));
    ok("tentativa 2: continua 'aprovada'", depois2.status === "aprovada", depois2.status);
    ok("tentativa 2: tentativas=2", depois2.tentativas === 2, String(depois2.tentativas));

    const r3 = await enviarProxima(escopo);
    ok("tentativa 3: reporta falha", r3.enviada === false);
    const [depois3] = await db.select().from(mensagens).where(eq(mensagens.id, msgT.id));
    ok("tentativa 3: ESGOTOU o limite — agora vira 'erro'", depois3.status === "erro", depois3.status);
    ok("tentativa 3: tentativas=3", depois3.tentativas === 3, String(depois3.tentativas));

    // Confirma que não fica girando: uma 4ª chamada não acha mais candidata
    // (a mensagem já está em 'erro', fora da consulta de candidatas).
    const r4 = await enviarProxima(escopo);
    ok("depois de virar erro, não sobra candidata para tentar de novo", r4.enviada === false && r4.motivo === "Fila vazia.");

    // ============================================================
    // Falha PERMANENTE — vai direto para erro, sem retry
    // ============================================================
    console.log("\n[permanente] 422 (número sem WhatsApp) — vai direto para erro, sem retry");
    const leadP = await novoLead("perm", NUMERO_PERMANENTE);
    const msgP = await novaMensagem(leadP.id);

    const rP = await enviarProxima(escopo);
    ok("permanente: enviarProxima reporta falha", rP.enviada === false);
    const [depoisP] = await db.select().from(mensagens).where(eq(mensagens.id, msgP.id));
    ok("permanente: vira 'erro' JÁ NA PRIMEIRA tentativa (sem retry)", depoisP.status === "erro", depoisP.status);
    ok("permanente: tentativas=1 (só tentou uma vez)", depoisP.tentativas === 1, String(depoisP.tentativas));
  } finally {
    await db.update(campanhas).set({ status: "pausada" }).where(eq(campanhas.id, campanha.id)).catch(() => {});
    await restaurarConfig();
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    if (leadIdsCriados.length > 0) {
      await db.delete(leads).where(inArray(leads.id, leadIdsCriados));
    }
    await db.delete(campanhas).where(eq(campanhas.id, campanha.id));
  }

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main();
