import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import http from "node:http";
import { eq, inArray, like } from "drizzle-orm";
import { db, leads, mensagens, campanhas, configuracoes, conversas } from "@/lib/db";
import { reservarMensagem, proximaDaFila, enviarProxima, lerConfig, type OpcoesFila } from "@/lib/fila";

/**
 * Trava atômica da fila (ver lib/fila.ts, FASE 1).
 *
 * O que isto protege: DUAS chamadas simultâneas a `enviarProxima()` nunca
 * podem mandar a MESMA mensagem duas vezes. Simula concorrência de verdade
 * com `Promise.all` disparando N chamadas ao mesmo tempo.
 *
 * ISOLAMENTO DA CAMPANHA REAL — duas camadas, não uma:
 *
 *  1. OFERTA: a Parte D cria muito mais leads/mensagens descartáveis do que
 *     chamadas simultâneas (8 para 5 chamadas). `enviarProxima()` tenta até 5
 *     candidatas antes de desistir (ver fila.ts) — com folga de sobra na
 *     oferta, nenhuma chamada tem motivo para "vazar" para a fila real. Foi
 *     exatamente a FALTA desta folga (1 mensagem para 5 chamadas) que causou
 *     o incidente da rodada anterior, corrigido manualmente com autorização.
 *
 *  2. REDE DE SEGURANÇA: mesmo com a oferta certa, o teste CONFERE depois de
 *     cada rodada se algum envio bem-sucedido não pertence à lista de leads
 *     descartáveis desta execução. Se acontecer, reverte automaticamente
 *     SÓ aquele registro (por ID exato, mesma técnica da correção manual) e
 *     FALHA o teste ruidosamente — não silencia, não continua como se nada
 *     tivesse acontecido.
 *
 *  As Partes A-C usam uma campanha PAUSADA (nunca visível para
 *  `enviarProxima`/`proximaDaFila`) porque testam `reservarMensagem` direto,
 *  sem precisar que a campanha esteja "rodando".
 */

const PREFIXO_MOCK = "mockconc-";

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

async function main() {
  const [campPausada] = await db
    .insert(campanhas)
    .values({ nome: `ZZ Concorrencia — ${Date.now()}`, status: "pausada" })
    .returning();

  const leadIdsCriados: string[] = [];

  async function novoLead(sufixo: string) {
    const [l] = await db
      .insert(leads)
      .values({
        placeId: `zz-conc-${Date.now()}-${sufixo}`,
        nome: `ZZ Concorrencia ${sufixo}`,
        categoria: "car_repair",
        cidade: "Uberlândia",
        statusSite: "sem-site",
        score: 50,
        whatsapp: `https://wa.me/559999000${sufixo.padStart(4, "0")}`,
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
        texto: "teste de concorrencia",
        status: "aprovada",
        campanhaId: campPausada.id,
        prioridade: 999_999_999,
      })
      .returning();
    return m;
  }

  try {
    // ============================================================
    // PARTE A — reservarMensagem sob 10 chamadas simultâneas
    // ============================================================
    console.log("\n[A] 10 chamadas simultâneas para a MESMA mensagem aprovada");
    const leadA = await novoLead("a");
    const m1 = await novaMensagem(leadA.id);
    const resultadosA = await Promise.all(Array.from({ length: 10 }, () => reservarMensagem(m1.id)));
    const sucessosA = resultadosA.filter(Boolean).length;
    ok("exatamente 1 das 10 conseguiu reservar", sucessosA === 1, `${sucessosA} de 10`);

    const [depoisA] = await db.select().from(mensagens).where(eq(mensagens.id, m1.id));
    ok("status virou na-fila", depoisA.status === "na-fila", depoisA.status);
    ok("tentativas incrementou só 1 vez (não 10)", depoisA.tentativas === 1, String(depoisA.tentativas));
    ok("processandoDesde foi gravado", depoisA.processandoDesde !== null);

    const resultadosA2 = await Promise.all(Array.from({ length: 5 }, () => reservarMensagem(m1.id)));
    ok("reserva fresca não é roubada por ninguém", resultadosA2.every((r) => r === false));

    // ============================================================
    // PARTE B — recuperação de mensagem presa (na-fila stale) sob concorrência
    // ============================================================
    console.log("\n[B] mensagem presa há mais tempo que o timeout, 10 chamadas simultâneas");
    const leadB = await novoLead("b");
    const m2 = await novaMensagem(leadB.id);
    await db
      .update(mensagens)
      .set({ status: "na-fila", processandoDesde: new Date(Date.now() - 10 * 60_000) })
      .where(eq(mensagens.id, m2.id));

    const resultadosB = await Promise.all(Array.from({ length: 10 }, () => reservarMensagem(m2.id)));
    const sucessosB = resultadosB.filter(Boolean).length;
    ok("exatamente 1 conseguiu recuperar a mensagem presa", sucessosB === 1, `${sucessosB} de 10`);

    // ============================================================
    // PARTE C — teto de tentativas presas: desiste e marca erro
    // ============================================================
    console.log("\n[C] mensagem presa demais vezes — proximaDaFila desiste");
    const leadC = await novoLead("c");
    const m3 = await novaMensagem(leadC.id);
    await db
      .update(mensagens)
      .set({ status: "na-fila", processandoDesde: new Date(Date.now() - 10 * 60_000), tentativas: 5 })
      .where(eq(mensagens.id, m3.id));

    await db.update(campanhas).set({ status: "rodando" }).where(eq(campanhas.id, campPausada.id));
    const escopo: OpcoesFila = { apenasCampanhaId: campPausada.id };
    const cfg = await lerConfig();
    const candidata = await proximaDaFila(cfg, escopo);
    ok(
      "proximaDaFila não devolve mensagem presa demais vezes",
      candidata?.mensagem.id !== m3.id,
      candidata ? candidata.mensagem.id : "nada",
    );
    const [depoisC] = await db.select().from(mensagens).where(eq(mensagens.id, m3.id));
    ok("foi marcada erro, não fica presa para sempre", depoisC.status === "erro", depoisC.status);
    await db.update(campanhas).set({ status: "pausada" }).where(eq(campanhas.id, campPausada.id));

    // ============================================================
    // PARTE D — enviarProxima() de ponta a ponta, 5 chamadas simultâneas,
    // contra um mock local, com OFERTA FOLGADA (8 candidatas para 5 chamadas)
    // ============================================================
    console.log("\n[D] enviarProxima() de ponta a ponta — 5 chamadas simultâneas, 8 candidatas descartáveis, provedor mockado");

    const NOMES_DESCARTAVEIS = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const l = await novoLead(`d${i}`);
      NOMES_DESCARTAVEIS.add(l.nome);
      await novaMensagem(l.id);
    }

    const enviosMock: string[] = [];
    const mock = http.createServer((req, res) => {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        enviosMock.push(corpo);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, id: `${PREFIXO_MOCK}${Date.now()}-${Math.random()}` }));
      });
    });
    await new Promise<void>((resolve) => mock.listen(8098, "127.0.0.1", resolve));

    const [cfgOriginal] = await db.select().from(configuracoes).limit(1);
    await db
      .update(configuracoes)
      .set({
        automacaoAtiva: true,
        provedorTipo: "custom",
        provedorBaseUrl: "http://127.0.0.1:8098",
        provedorInstancia: null,
        provedorEndpointCustom: "/send",
        provedorToken: "mock-token-concorrencia",
        provedorTestadoEm: new Date(),
        provedorEstado: "mock de teste — nao encaminha para WhatsApp real",
        intervaloSegundos: 30,
        atualizadoEm: new Date(),
      })
      .where(eq(configuracoes.id, "default"));

    try {
      await db.update(campanhas).set({ status: "rodando" }).where(eq(campanhas.id, campPausada.id));

      /**
       * `escopo` (apenasCampanhaId) faz a PRÓPRIA CONSULTA SQL nem enxergar
       * mensagens de outra campanha — isolamento estrutural, não por
       * quantidade de candidatas descartáveis. É a garantia adicional pedida:
       * mesmo que a oferta de 8 candidatas estivesse errada, esta chamada
       * jamais alcançaria a campanha real dos 283 leads.
       */
      const resultadosD = await Promise.all(Array.from({ length: 5 }, () => enviarProxima(escopo)));
      const enviadosD = resultadosD.filter((r) => r.enviada);

      /**
       * REDE DE SEGURANÇA: qualquer envio cujo lead não esteja na lista de
       * descartáveis desta execução é um vazamento para a fila real. Reverte
       * IMEDIATAMENTE, por ID exato (mesma técnica da correção manual), e
       * falha o teste alto e claro — nunca silencioso.
       */
      const vazamentos = enviadosD.filter((r) => !r.lead || !NOMES_DESCARTAVEIS.has(r.lead));
      if (vazamentos.length > 0) {
        console.log(`  !!! VAZAMENTO DETECTADO: ${vazamentos.length} envio(s) fora da lista descartável !!!`);
        const suspeitas = await db
          .select()
          .from(mensagens)
          .where(like(mensagens.provedorId, `${PREFIXO_MOCK}%`));
        for (const s of suspeitas) {
          if (!leadIdsCriados.includes(s.leadId)) {
            await db
              .update(mensagens)
              .set({ status: "aprovada", enviadaEm: null, provedorId: null, tentativas: 0, processandoDesde: null })
              .where(eq(mensagens.id, s.id));
            await db.delete(conversas).where(eq(conversas.provedorMsgId, s.provedorId!));
            console.log(`  revertido automaticamente: mensagem ${s.id} (lead ${s.leadId})`);
          }
        }
      }
      ok("nenhum envio saiu para fora da lista de leads descartáveis", vazamentos.length === 0, `${vazamentos.length} vazamento(s)`);

      ok(
        "todas as 5 chamadas conseguiram enviar (oferta suficiente, sem duplicar)",
        enviadosD.length === 5,
        `${enviadosD.length} de 5 -> ${JSON.stringify(resultadosD)}`,
      );
      ok("o mock recebeu exatamente 5 POSTs (1 por chamada bem-sucedida)", enviosMock.length === 5, String(enviosMock.length));

      const leadsUsados = new Set(enviadosD.map((r) => r.lead));
      ok("as 5 mensagens enviadas foram todas DIFERENTES (sem duplicidade)", leadsUsados.size === enviadosD.length, `${leadsUsados.size} únicos de ${enviadosD.length}`);
    } finally {
      if (cfgOriginal) {
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
      }
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  } finally {
    // Cascade cuida de mensagens/conversas de cada lead descartável.
    if (leadIdsCriados.length > 0) {
      await db.delete(leads).where(inArray(leads.id, leadIdsCriados));
    }
    await db.delete(campanhas).where(eq(campanhas.id, campPausada.id));
  }

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main();
