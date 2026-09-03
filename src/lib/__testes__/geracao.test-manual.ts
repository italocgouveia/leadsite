import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Mesmo caminho que o worker observa — ver ARQUIVO_PAUSA em worker-geracao. */
const ARQUIVO_PAUSA = join(process.cwd(), "geracao.pausado");

import { and, eq, inArray, like } from "drizzle-orm";
import { db, leads, mensagens, campanhas, eventos, geracaoFila, configuracoes } from "@/lib/db";
import {
  enfileirar,
  reservarItem,
  processarItem,
  processarLote,
  recuperarPresos,
  estadoGeracao,
  MAX_TENTATIVAS,
  type Gerador,
} from "@/lib/gen/fila-geracao";
import { criarCampanhaParaGerar } from "@/lib/campanha";

/**
 * Testa a fila de geração inteira SEM chamar o Gemini e SEM enviar nada.
 *
 * O gerador é injetado (ver `Gerador` em lib/gen/fila-geracao), então dá para
 * provocar 429, timeout e falha de parsing na hora que quiser, em vez de
 * esperar acontecer sozinho — que é o único jeito de testar o caminho da cota
 * de forma determinística.
 *
 * NENHUM lead real é tocado: tudo acontece em leads marcados com `TESTE-GER` e
 * é apagado no fim. NENHUMA mensagem sai: o worker de envio não é chamado em
 * lugar nenhum deste arquivo, e as mensagens geradas nascem em `rascunho`.
 *
 *   npm run test:geracao
 */
const MARCA = "TESTE-GER";

/** Se este teste pausou o worker de produção, precisa liberar no fim. */
let workerPausado = false;

let passou = 0;
let falhou = 0;
function ok(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  [ok]    ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  } else {
    falhou++;
    console.log(`  [FALHA] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

/** Gerador falso: responde na hora, sem rede, sem cota, sem custo. */
const geradorBom: Gerador = async (lead) => ({
  oportunidade: `Oportunidade detectada em ${lead.nome}`,
  solucao: "sistema-sob-medida",
  solucaoRotulo: "Sistema sob medida",
  mensagem: `Mensagem exclusiva para ${lead.nome} (${lead.cidade}).`,
});

const gerador429: Gerador = async () => {
  throw new Error("Cota gratuita do Gemini esgotada (limite por minuto). 429 RESOURCE_EXHAUSTED");
};

const geradorQuebrado: Gerador = async () => {
  throw new Error("JSON inválido devolvido pelo modelo");
};

async function pausarWorkerReal(): Promise<boolean> {
  /**
   * Segura o worker de produção com um ARQUIVO, não matando processo.
   *
   * Matar era frágil: a cadeia wscript -> cmd -> node leva segundos para
   * nascer, e um kill no meio dela não acha nada para matar — o worker
   * aparecia logo depois e disputava os itens do teste. O sintoma era sempre o
   * mesmo, e sempre inocente (o worker gerava antes, nada duplicava), mas
   * teste que às vezes passa não serve para nada.
   *
   * O arquivo não tem corrida: no início de cada ciclo ele está lá ou não.
   */
  writeFileSync(ARQUIVO_PAUSA, "teste em andamento\n");

  /**
   * Espera o worker CONFIRMAR a pausa, em vez de dormir um tempo qualquer.
   *
   * Dormir 2,5s não bastava: um lote já em andamento leva minutos (4s entre
   * leads mais a ida ao Gemini) e continua reservando itens o tempo todo. O
   * teste seguia achando que tinha a fila só para si e às vezes encontrava um
   * item seu em `processando`, reservado por outro. Agora o worker publica
   * `pausado: true` só quando o laço de fato parou, e é isso que se espera.
   */
  const limite = Date.now() + 6 * 60 * 1000;
  for (;;) {
    let st: { pausado?: boolean } | null = null;
    try {
      const r = await fetch("http://127.0.0.1:8477/", { signal: AbortSignal.timeout(3000) });
      st = r.ok ? await r.json() : null;
    } catch {
      return true; // worker não está no ar: fila já é exclusiva do teste
    }
    if (st?.pausado) return true;
    if (Date.now() > limite) {
      console.log("(aviso: worker não confirmou a pausa a tempo — o teste pode ficar instável)");
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function religarWorkerReal() {
  if (existsSync(ARQUIVO_PAUSA)) rmSync(ARQUIVO_PAUSA);
}

async function main() {
  const cfgAntes = (await db.select().from(configuracoes).limit(1))[0];
  workerPausado = await pausarWorkerReal();
  await limpar();

  console.log("\n=== 1. cinco leads diferentes, cada um com sua mensagem ===");
  const novos = await db
    .insert(leads)
    .values(
      ["Alfa", "Beta", "Gama", "Delta", "Epsilon"].map((n, i) => ({
        placeId: `${MARCA}:${i + 1}`,
        nome: `${MARCA} ${n}`,
        categoria: ["clinic", "car_repair", "guest_house", "restaurant", "bakery"][i],
        cidade: ["Uberlândia", "Araguari", "Capitólio", "Uberaba", "Patos"][i],
        whatsapp: `https://wa.me/551190000040${i}`,
        etapa: "novo" as const,
        fotos: [],
        statusSite: "sem-site" as const,
        score: 70 - i * 5,
        temperatura: "morno" as const,
      })),
    )
    .returning();

  const { campanha } = await criarCampanhaParaGerar({
    nome: `${MARCA} — não iniciar`,
    leadIds: novos.map((l) => l.id),
  });

  let e = await estadoGeracao(campanha.id);
  ok("5 leads entraram na fila persistente", e.total === 5 && e.pendente === 5, JSON.stringify(e));

  const r1 = await processarLote({ campanhaId: campanha.id, max: 5, gerar: geradorBom });
  e = await estadoGeracao(campanha.id);
  ok("5 mensagens geradas", r1.geradas === 5 && e.pronta === 5, `geradas=${r1.geradas}`);

  const msgs = await db.select().from(mensagens).where(eq(mensagens.campanhaId, campanha.id));
  const textos = new Set(msgs.map((m) => m.texto));
  ok("cada lead com texto próprio (5 textos distintos)", textos.size === 5, `${textos.size} textos`);
  const casam = msgs.every((m) => {
    const nome = novos.find((l) => l.id === m.leadId)?.nome ?? "###";
    return m.texto.includes(nome);
  });
  ok("nenhum texto foi parar no lead errado", casam);
  ok(
    "tudo nasceu em rascunho (fora da fila de envio)",
    msgs.every((m) => m.status === "rascunho"),
  );
  ok(
    "nenhuma mensagem foi enviada",
    msgs.every((m) => m.enviadaEm === null && m.provedorId === null),
  );
  ok(
    "site NÃO é a solução escolhida",
    msgs.every((m) => m.produto !== "site"),
    [...new Set(msgs.map((m) => m.produto))].join(", "),
  );

  console.log("\n=== 2. mensagem pronta não é regenerada ===");
  const r2 = await processarLote({ campanhaId: campanha.id, max: 5, gerar: geradorBom });
  const depois = await db
    .select()
    .from(mensagens)
    .where(eq(mensagens.campanhaId, campanha.id));
  ok(
    "rodar de novo não gerou nada nem duplicou",
    r2.geradas === 0 && depois.length === 5,
    `geradas=${r2.geradas}, mensagens=${depois.length}`,
  );

  console.log("\n=== 3. iniciar a MESMA campanha duas vezes ===");
  const reenfileirado = await enfileirar(campanha.id, novos);
  const eDup = await estadoGeracao(campanha.id);
  ok(
    "segundo enfileiramento é no-op (índice único campanha+lead)",
    reenfileirado.enfileirados === 0 && eDup.total === 5,
    `enfileirados=${reenfileirado.enfileirados}, total=${eDup.total}`,
  );

  console.log("\n=== 4. 429 do Gemini: adia, não perde o lead ===");
  const c429 = await campanhaDeTeste(novos.slice(0, 3));
  const r429 = await processarLote({ campanhaId: c429, max: 3, gerar: gerador429 });
  const e429 = await estadoGeracao(c429);
  ok("lote parou na primeira cota", r429.pausadoPorCota, `adiadas=${r429.adiadas}`);
  ok(
    "nenhum lead virou erro nem pulado",
    e429.erro === 0 && e429.pulada === 0,
    JSON.stringify(e429),
  );
  ok("os 3 leads continuam pendentes", e429.pendente === 3);
  ok("há hora marcada para tentar de novo", Boolean(e429.proximaTentativaEm), e429.proximaTentativaEm ?? "");
  const itens429 = await db.select().from(geracaoFila).where(eq(geracaoFila.campanhaId, c429));
  ok(
    "cota NÃO queimou tentativa (tentativas seguem em 0)",
    itens429.every((i) => i.tentativas === 0),
    `tentativas=${itens429.map((i) => i.tentativas).join(",")}`,
  );
  ok(
    "backoff registrado como espera",
    itens429.some((i) => i.esperas > 0),
    `esperas=${itens429.map((i) => i.esperas).join(",")}`,
  );

  console.log("\n=== 5. cota liberada: os mesmos leads geram normalmente ===");
  // Antecipa o relógio do backoff — é o que o tempo faria sozinho.
  await db
    .update(geracaoFila)
    .set({ proximaTentativaEm: new Date(Date.now() - 1000) })
    .where(eq(geracaoFila.campanhaId, c429));
  const rVolta = await processarLote({ campanhaId: c429, max: 3, gerar: geradorBom });
  const eVolta = await estadoGeracao(c429);
  ok(
    "os 3 leads retidos viraram mensagem",
    rVolta.geradas === 3 && eVolta.pronta === 3,
    `geradas=${rVolta.geradas}`,
  );

  console.log("\n=== 6. falha real: 3 tentativas e para (sem retry infinito) ===");
  const cErro = await campanhaDeTeste(novos.slice(3, 4));
  for (let volta = 1; volta <= MAX_TENTATIVAS + 2; volta++) {
    await db
      .update(geracaoFila)
      .set({ proximaTentativaEm: new Date(Date.now() - 1000) })
      .where(eq(geracaoFila.campanhaId, cErro));
    await processarLote({ campanhaId: cErro, max: 1, gerar: geradorQuebrado });
  }
  const [itemErro] = await db.select().from(geracaoFila).where(eq(geracaoFila.campanhaId, cErro));
  ok(
    `parou em ${MAX_TENTATIVAS} tentativas e virou erro`,
    itemErro.status === "erro" && itemErro.tentativas === MAX_TENTATIVAS,
    `status=${itemErro.status} tentativas=${itemErro.tentativas}`,
  );
  ok("NÃO caiu no motor antigo (nenhuma mensagem criada)", await semMensagens(cErro));

  console.log("\n=== 7. dois workers na MESMA fila ===");
  const cCorrida = await campanhaDeTeste(novos);
  const [wA, wB] = await Promise.all([reservarItem({ campanhaId: cCorrida }), reservarItem({ campanhaId: cCorrida })]);
  ok(
    "cada worker pegou um item DIFERENTE",
    Boolean(wA && wB) && wA!.id !== wB!.id,
    `A=${wA?.id.slice(0, 8)} B=${wB?.id.slice(0, 8)}`,
  );
  const conflito = await db
    .update(geracaoFila)
    .set({ status: "processando" })
    .where(and(eq(geracaoFila.id, wA!.id), eq(geracaoFila.status, "pendente")))
    .returning({ id: geracaoFila.id });
  ok("item já reservado não pode ser reservado de novo", conflito.length === 0);

  console.log("\n=== 8. dois workers no MESMO lead ===");
  const [pA, pB] = await Promise.all([
    processarItem(wA!, geradorBom),
    processarItem(wA!, geradorBom),
  ]);
  const doLead = await db
    .select()
    .from(mensagens)
    .where(and(eq(mensagens.campanhaId, cCorrida), eq(mensagens.leadId, wA!.leadId)));
  ok(
    "processar o mesmo item duas vezes gera UMA mensagem só",
    doLead.length === 1,
    `${doLead.length} mensagem(ns), fins: ${pA.fim}/${pB.fim}`,
  );

  console.log("\n=== 9. timeout / processo morto no meio ===");
  const cPreso = await campanhaDeTeste(novos.slice(0, 2));
  const reservado = await reservarItem({ campanhaId: cPreso });
  // Simula o processo que morreu: item fica em `processando` e ninguém volta.
  await db
    .update(geracaoFila)
    .set({ processandoDesde: new Date(Date.now() - 10 * 60 * 1000) })
    .where(eq(geracaoFila.id, reservado!.id));
  const ePreso = await estadoGeracao(cPreso);
  if (ePreso.processando !== 1) {
    const linhas = await db.select().from(geracaoFila).where(eq(geracaoFila.campanhaId, cPreso));
    console.log("    DIAGNOSTICO reservado=", reservado?.id, JSON.stringify(linhas.map(l=>({id:l.id.slice(0,8),status:l.status,pd:l.processandoDesde,tent:l.tentativas,err:l.erro?.slice(0,60)}))));
  }
  ok("item ficou preso em processando", ePreso.processando === 1);

  const recuperados = await recuperarPresos();
  const eRec = await estadoGeracao(cPreso);
  ok(
    "item preso volta para a fila sozinho",
    recuperados >= 1 && eRec.processando === 0 && eRec.pendente === 2,
    `recuperados=${recuperados} ${JSON.stringify(eRec)}`,
  );
  const rRec = await processarLote({ campanhaId: cPreso, max: 2, gerar: geradorBom });
  ok("depois de recuperado, gera normalmente", rRec.geradas === 2, `geradas=${rRec.geradas}`);

  console.log("\n=== 10. reinício do processo no meio da campanha ===");
  const cReinicio = await campanhaDeTeste(novos);
  await processarLote({ campanhaId: cReinicio, max: 2, gerar: geradorBom });
  const meio = await estadoGeracao(cReinicio);
  // "Reiniciar" aqui = simplesmente chamar de novo, como um processo novo faria.
  const rDepois = await processarLote({ campanhaId: cReinicio, max: 5, gerar: geradorBom });
  const fim = await estadoGeracao(cReinicio);
  ok(
    "retomou de onde parou, sem refazer o que já estava pronto",
    meio.pronta === 2 && rDepois.geradas === 3 && fim.pronta === 5,
    `meio=${meio.pronta} novas=${rDepois.geradas} fim=${fim.pronta}`,
  );

  console.log("\n=== 11. nada foi enviado em nenhum momento ===");
  const todas = await db
    .select()
    .from(mensagens)
    .where(inArray(mensagens.leadId, novos.map((l) => l.id)));
  ok(
    `${todas.length} mensagem(ns) criadas, TODAS em rascunho`,
    todas.every((m) => m.status === "rascunho" && m.enviadaEm === null),
  );
  ok(
    "nenhuma mensagem tem id de provedor (nada saiu)",
    todas.every((m) => m.provedorId === null),
  );

  const cfgDepois = (await db.select().from(configuracoes).limit(1))[0];
  ok(
    "configuração do sistema intacta",
    cfgAntes?.limiteDiario === cfgDepois?.limiteDiario &&
      cfgAntes?.automacaoAtiva === cfgDepois?.automacaoAtiva,
    `limite ${cfgAntes?.limiteDiario}->${cfgDepois?.limiteDiario}, automacaoAtiva ${cfgAntes?.automacaoAtiva}->${cfgDepois?.automacaoAtiva}`,
  );

  await limpar();
  if (workerPausado) religarWorkerReal();
  console.log(`\n${passou} ok, ${falhou} falha(s). Dados de teste removidos.`);
  process.exit(falhou ? 1 : 0);
}

async function campanhaDeTeste(alvos: typeof leads.$inferSelect[]) {
  const [c] = await db
    .insert(campanhas)
    .values({ nome: `${MARCA} — ${crypto.randomUUID().slice(0, 8)}`, status: "rascunho" })
    .returning();
  await enfileirar(c.id, alvos);
  return c.id;
}

async function semMensagens(campanhaId: string) {
  const m = await db.select().from(mensagens).where(eq(mensagens.campanhaId, campanhaId));
  return m.length === 0;
}

async function limpar() {
  const antigos = await db.select({ id: leads.id }).from(leads).where(like(leads.placeId, `${MARCA}:%`));
  const camps = await db.select({ id: campanhas.id }).from(campanhas).where(like(campanhas.nome, `${MARCA}%`));
  const ids = camps.map((c) => c.id);

  if (ids.length) {
    await db.delete(geracaoFila).where(inArray(geracaoFila.campanhaId, ids));
    await db.delete(mensagens).where(inArray(mensagens.campanhaId, ids));
    await db.delete(eventos).where(inArray(eventos.campanhaId, ids));
    await db.delete(campanhas).where(inArray(campanhas.id, ids));
  }
  if (antigos.length) {
    const leadIds = antigos.map((l) => l.id);
    await db.delete(geracaoFila).where(inArray(geracaoFila.leadId, leadIds));
    await db.delete(mensagens).where(inArray(mensagens.leadId, leadIds));
    await db.delete(eventos).where(inArray(eventos.leadId, leadIds));
    await db.delete(leads).where(inArray(leads.id, leadIds));
  }
}

main().catch(async (e) => {
  console.error("FALHOU:", e);
  await limpar().catch(() => {});
  if (workerPausado) religarWorkerReal();
  process.exit(1);
});
