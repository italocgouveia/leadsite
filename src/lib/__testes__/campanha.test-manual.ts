import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { eq, inArray } from "drizzle-orm";
import { db, leads, mensagens, campanhas, eventos } from "@/lib/db";
import { montarCampanha, iniciar, pausar, parar, progresso } from "@/lib/campanha";
import { configuracoes } from "@/lib/db";
import { lerConfig, proximaDaFila } from "@/lib/fila";
import { pontuar } from "@/lib/pontuacao";

/**
 * Ciclo completo da campanha, contra o banco real, com leads descartáveis.
 * O que protege: montar não envia, pausar realmente pausa, encerrar cancela
 * o pendente, e a integração inválida bloqueia o início.
 */
async function main() {
  let falhas = 0;
  const ok = (t: string, c: boolean, d = "") => {
    console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
    if (!c) falhas++;
  };

  /**
   * A validação de integração agora BLOQUEIA iniciar campanha com provedor
   * inválido — comportamento correto, mas que dependia da config real do
   * usuário para o teste passar. Aqui a config é salva, trocada por uma
   * válida durante o teste e restaurada no fim, exatamente como estava.
   */
  const [cfgOriginal] = await db.select().from(configuracoes);
  const restaurar = async () => {
    if (!cfgOriginal) return;
    await db
      .update(configuracoes)
      .set({
        provedorUrl: cfgOriginal.provedorUrl,
        provedorTipo: cfgOriginal.provedorTipo,
        provedorBaseUrl: cfgOriginal.provedorBaseUrl,
        provedorInstancia: cfgOriginal.provedorInstancia,
        provedorToken: cfgOriginal.provedorToken,
        provedorTestadoEm: cfgOriginal.provedorTestadoEm,
      })
      .where(eq(configuracoes.id, cfgOriginal.id));
  };

  /**
   * A validação agora lê os campos separados (tipo/base/instancia/token), não
   * mais a URL inteira. O teste configura os mesmos campos que a tela.
   */
  const configurarProvedor = async (baseUrl: string, valido: boolean) => {
    if (!cfgOriginal) return;
    await db
      .update(configuracoes)
      .set({
        provedorTipo: "evolution",
        provedorBaseUrl: baseUrl,
        provedorInstancia: "teste",
        provedorToken: "chave-de-teste",
        provedorTestadoEm: valido ? new Date() : null,
      })
      .where(eq(configuracoes.id, cfgOriginal.id));
  };

  console.log("\n[trava de integracao]");
  await configurarProvedor("https://leads-eosin.vercel.app/api/automacao/status", true);

  const provisoria = await db
    .insert(campanhas)
    .values({ nome: "ZZ Trava", status: "rascunho" })
    .returning();
  const bloqueado = await iniciar(provisoria[0].id);
  ok(
    "recusa iniciar com webhook no lugar do provedor",
    bloqueado.ok === false,
    bloqueado.ok ? "iniciou quando nao devia" : bloqueado.erro.slice(0, 70),
  );
  if (!bloqueado.ok) console.log(`     -> ${bloqueado.erro.slice(0, 90)}`);
  await db.delete(campanhas).where(eq(campanhas.id, provisoria[0].id));

  // Com URL válida, o ciclo normal deve funcionar.
  await configurarProvedor("https://provedor-de-teste.example.com", true);

  const criados: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [l] = await db.insert(leads).values({
      placeId: `zz-camp-${Date.now()}-${i}`, nome: `ZZ Camp ${i}`, categoria: "car_repair",
      cidade: "Uberlândia", statusSite: "sem-site", score: 50,
      whatsapp: `https://wa.me/553499911100${i}`, horarios: "Seg a Sex 8-18",
      endereco: "Rua X", avaliacoes: 50,
    }).returning();
    criados.push(l.id);
  }

  console.log("\n[pontuacao]");
  const [amostra] = await db.select().from(leads).where(eq(leads.id, criados[0]));
  const p = pontuar(amostra);
  console.log(`  ${amostra.nome}: ${p.emoji} ${p.total} (${p.rotulo})`);
  p.criterios.filter(c => c.ganhou).forEach(c => console.log(`     +${c.pontos} ${c.rotulo}`));
  ok("oficina com zap e volume fica quente", p.total >= 60, String(p.total));

  /**
   * A régua antiga rebaixava a 39 quem não tinha WhatsApp. Isso foi REMOVIDO:
   * oportunidade e contactabilidade viraram eixos separados, e uma empresa
   * excelente sem contato encontrado vira caso de enriquecimento, não lixo.
   */
  const semZap = { ...amostra, whatsapp: null, telefone: null };
  const pSem = pontuar(semZap);
  ok("oportunidade NAO cai por falta de WhatsApp",
     pSem.total === pontuar(amostra).total,
     `${pSem.total} vs ${pontuar(amostra).total}`);
  ok("mas a contactabilidade cai", pSem.contato.score < pontuar(amostra).contato.score,
     `${pSem.contato.score} vs ${pontuar(amostra).contato.score}`);

  console.log("\n[montar]");
  const r = await montarCampanha({ nome: "ZZ Teste", leadIds: criados, produto: "sistema" });
  ok("criou mensagens para os 3", r.criadas === 3, `${r.criadas} / pulados ${r.pulados.length}`);

  const pr1 = await progresso(r.campanha.id);
  ok("campanha nasce em rascunho", r.campanha.status === "rascunho", r.campanha.status);
  ok("mensagens nascem em rascunho", pr1.rascunho === 3 && pr1.aprovadas === 0, JSON.stringify(pr1));
  ok("montar NAO envia nada", pr1.enviadas === 0);

  /**
   * ISOLAMENTO: este teste roda contra o banco REAL (às vezes com campanhas
   * de verdade já aprovadas e aguardando envio). `proximaDaFila` é global —
   * não filtra por campanha — então nunca dá pra assumir fila vazia.
   *
   * Prioridade absurdamente alta garante que as mensagens DESTE teste vençam
   * qualquer pontuação real na ordenação, e as asserções abaixo checam que o
   * candidato devolvido É (ou NÃO É) desta campanha — nunca "fila vazia".
   * Isso prova a mesma coisa sem exigir um banco limpo, e sem cancelar ou
   * tocar em nenhuma mensagem de outra campanha.
   */
  await db
    .update(mensagens)
    .set({ prioridade: 999_999_999 })
    .where(eq(mensagens.campanhaId, r.campanha.id));

  console.log("\n[fila respeita a campanha]");
  const cfg = await lerConfig();
  const daCampanha = (m: { lead: { id: string } } | null) => !!m && criados.includes(m.lead.id);

  const antesDeAprovar = await proximaDaFila(cfg);
  ok("rascunho nao entra na fila", !daCampanha(antesDeAprovar));

  await iniciar(r.campanha.id);
  const pr2 = await progresso(r.campanha.id);
  ok("iniciar aprova os rascunhos", pr2.aprovadas === 3, JSON.stringify(pr2));

  const naFila = await proximaDaFila(cfg);
  ok("agora a fila entrega", daCampanha(naFila), naFila ? naFila.lead.nome : "nada");

  await pausar(r.campanha.id);
  const pausada = await proximaDaFila(cfg);
  ok("pausada nao entrega (trava de servidor)", !daCampanha(pausada));

  await iniciar(r.campanha.id);
  ok("retomar volta a entregar", daCampanha(await proximaDaFila(cfg)));

  console.log("\n[encerrar]");
  const fim = await parar(r.campanha.id);
  const pr3 = await progresso(r.campanha.id);
  ok("encerrar cancela o pendente", fim.canceladas === 3 && pr3.aprovadas === 0, JSON.stringify(pr3));

  console.log("\n[log]");
  const logs = await db.select().from(eventos).where(eq(eventos.campanhaId, r.campanha.id));
  ok("registrou os eventos", logs.length >= 3, `${logs.length} eventos`);
  logs.forEach(l => console.log(`     ${l.tipo}: ${l.descricao}`));

  await db.delete(campanhas).where(eq(campanhas.id, r.campanha.id));
  await db.delete(leads).where(inArray(leads.id, criados));
  ok("limpou o cenario", (await db.select().from(mensagens).where(inArray(mensagens.leadId, criados))).length === 0);

  // A config do usuário volta EXATAMENTE como estava, inclusive se inválida.
  await restaurar();
  const [conferindo] = await db.select().from(configuracoes);
  ok(
    "config do usuario restaurada",
    conferindo?.provedorUrl === cfgOriginal?.provedorUrl &&
      conferindo?.provedorBaseUrl === cfgOriginal?.provedorBaseUrl &&
      conferindo?.provedorToken === cfgOriginal?.provedorToken,
    `base=${conferindo?.provedorBaseUrl}`,
  );

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
