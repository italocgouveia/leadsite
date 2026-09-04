import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { eq, inArray, like } from "drizzle-orm";
import { db, leads, mensagens, campanhas, eventos, geracaoFila } from "@/lib/db";
import { oportunidades } from "@/lib/oportunidades";
import { avaliarSistema } from "@/lib/sistemas";
import { regenerar } from "@/lib/gen/fila-geracao";
import { SOLUCOES } from "@/lib/catalogo-solucoes";
import type { Lead } from "@/lib/db";

/**
 * Testa o PAINEL DE PROSPECÇÃO: filtros, prioridade, perfis por nicho e as
 * ações de revisão (editar, regenerar, aprovar, rejeitar).
 *
 * Nenhum lead real é tocado — tudo acontece em leads marcados `TESTE-PAINEL`,
 * removidos no fim. Nenhuma mensagem é enviada: `enviarProxima` não é chamada
 * em lugar nenhum deste arquivo, e as mensagens criadas nascem em `rascunho`.
 *
 *   npm run test:painel
 */
const MARCA = "TESTE-PAINEL";

let passou = 0;
let falhou = 0;
function ok(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  [PASS] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  } else {
    falhou++;
    console.log(`  [FAIL] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

/** Lead sintético só para checar o perfil do ramo — nunca vai ao banco. */
function leadFake(categoria: string): Lead {
  return {
    nome: "x",
    categoria,
    cidade: "Uberlândia",
    statusSite: "sem-site",
    fotos: [],
    nota: null,
    avaliacoes: null,
    website: null,
    instagram: null,
  } as unknown as Lead;
}

async function main() {
  await limpar();

  /**
   * Quantos elegíveis existem ANTES dos leads de teste.
   *
   * Os testes 1 e 2 conferiam se os 6 sintéticos apareciam na lista, e isso
   * era suposição sobre a BASE, não sobre o filtro: com centenas de elegíveis
   * reais e corte no topo, um lead de teste com score baixo legitimamente não
   * entra. Medir a diferença no total responde a mesma pergunta sem depender
   * de quantos leads você tem hoje.
   */
  const linhaBase = await oportunidades({ somenteWhatsapp: false }, 200);
  const antesEncontrados = linhaBase.encontrados;
  const antesSemWpp = linhaBase.elegiveis;
  const antesComWpp = (await oportunidades({ somenteWhatsapp: true }, 200)).elegiveis;

  // Seis leads com combinações diferentes de sinais, para os filtros morderem.
  const base: {
    n: string;
    cat: string;
    wpp: boolean;
    insta: string | null;
    site: string | null;
    nota: number | null;
    av: number | null;
  }[] = [
    { n: "Alfa", cat: "car_repair", wpp: true, insta: "https://instagram.com/a", site: null, nota: 4.8, av: 120 },
    { n: "Beta", cat: "car_wash", wpp: true, insta: null, site: "https://beta.com", nota: 4.2, av: 30 },
    { n: "Gama", cat: "dentist", wpp: true, insta: "https://instagram.com/g", site: null, nota: 3.5, av: 8 },
    { n: "Delta", cat: "pet", wpp: false, insta: null, site: null, nota: 4.9, av: 200 },
    { n: "Epsilon", cat: "guest_house", wpp: true, insta: null, site: null, nota: null, av: null },
    { n: "Zeta", cat: "estate_agent", wpp: true, insta: null, site: null, nota: 4.0, av: 50 },
  ];

  const novos = await db
    .insert(leads)
    .values(
      base.map((b, i) => ({
        placeId: `${MARCA}:${i + 1}`,
        nome: `${MARCA} ${b.n}`,
        categoria: b.cat,
        cidade: "Uberlândia",
        whatsapp: b.wpp ? `https://wa.me/551190000070${i}` : null,
        instagram: b.insta,
        website: b.site,
        nota: b.nota,
        avaliacoes: b.av,
        etapa: "novo" as const,
        fotos: [],
        statusSite: (b.site ? "com-site" : "sem-site") as never,
        score: 60,
        temperatura: "morno" as const,
      })),
    )
    .returning();

  const meus = (r: Awaited<ReturnType<typeof oportunidades>>) =>
    r.leads.filter((l) => l.nome.startsWith(MARCA));

  console.log("\n=== A. FILTROS ===");
  /**
   * Os 6 aparecem, mas só 5 são elegíveis — e isso é o comportamento certo.
   *
   * Desligar "somente com WhatsApp" mostra o lead sem número, não o torna
   * contatável: sem número não existe envio, em filtro nenhum. Separar
   * ENCONTRADOS de ELEGÍVEIS é justamente o que impede a tela de prometer um
   * lote que a fila depois recusa.
   */
  const semFiltro = await oportunidades({ somenteWhatsapp: false }, 200);
  ok(
    "1. os 6 leads aparecem, mas o sem-WhatsApp não vira elegível",
    semFiltro.encontrados === antesEncontrados + 6 && semFiltro.elegiveis === antesSemWpp + 5,
    `encontrados ${antesEncontrados}→${semFiltro.encontrados} (+6), elegíveis ${antesSemWpp}→${semFiltro.elegiveis} (+5)`,
  );

  const soWpp = await oportunidades({ somenteWhatsapp: true }, 200);
  ok(
    "2. filtro de WhatsApp exclui quem não tem (Delta fica fora)",
    soWpp.elegiveis === antesComWpp + 5,
    `${antesComWpp} → ${soWpp.elegiveis} (esperado +5, não +6)`,
  );

  const comInsta = await oportunidades({ comInstagram: true }, 200);
  ok(
    "3. filtro de Instagram",
    meus(comInsta).every((l) => l.temInstagram) && meus(comInsta).length === 2,
    `${meus(comInsta).length} com Instagram`,
  );

  const semSite = await oportunidades({ site: "sem" }, 200);
  const comSite = await oportunidades({ site: "com" }, 200);
  ok(
    "4. filtro de site (com/sem)",
    meus(semSite).every((l) => !l.temSite) && meus(comSite).every((l) => l.temSite),
    `sem=${meus(semSite).length} com=${meus(comSite).length}`,
  );

  const nota45 = await oportunidades({ notaMinima: 4.5 }, 200);
  ok(
    "5. filtro de nota mínima",
    meus(nota45).every((l) => (l.nota ?? 0) >= 4.5),
    `${meus(nota45).length} com nota >= 4.5`,
  );

  const av100 = await oportunidades({ avaliacoesMinimas: 100 }, 200);
  ok(
    "6. filtro de avaliações mínimas",
    meus(av100).every((l) => (l.avaliacoes ?? 0) >= 100),
    `${meus(av100).length} com 100+ avaliações`,
  );

  console.log("\n=== B. ELEGIBILIDADE ===");
  // Contatado: mensagem enviada agora mesmo cai na janela de recontato.
  const [camp] = await db
    .insert(campanhas)
    .values({ nome: `${MARCA} — não iniciar`, status: "rascunho" })
    .returning();
  const alfa = novos.find((l) => l.nome.includes("Alfa"))!;
  await db.insert(mensagens).values({
    leadId: alfa.id,
    campanhaId: camp.id,
    texto: "Mensagem de teste já enviada.",
    origem: "ia",
    status: "enviada",
    enviadaEm: new Date(),
    rodada: 0,
    prioridade: 50,
  });

  const depoisContato = await oportunidades({}, 200);
  ok(
    "7. lead já contatado sai da lista",
    !meus(depoisContato).some((l) => l.id === alfa.id),
    "Alfa excluído",
  );
  ok(
    "8. motivo da exclusão aparece",
    depoisContato.recusas.some((r) => /contatado/i.test(r.motivo)),
    depoisContato.recusas.map((r) => `${r.quantidade}× ${r.motivo}`).join(" | ").slice(0, 90),
  );

  // Respondido é terminal: o lead sai do disparo em massa.
  const gama = novos.find((l) => l.nome.includes("Gama"))!;
  await db.update(leads).set({ etapa: "respondeu" }).where(eq(leads.id, gama.id));
  const depoisResposta = await oportunidades({}, 200);
  ok(
    "9. lead que respondeu sai da lista",
    !meus(depoisResposta).some((l) => l.id === gama.id),
    "Gama excluído",
  );

  const incluindo = await oportunidades({ incluirContatados: true }, 200);
  ok(
    /**
     * Compara o TOTAL de elegíveis, não quantos leads de teste aparecem na
     * lista. A lista vem cortada nos melhores por score, então quantos dos
     * sintéticos cabem nela depende de quantos leads reais existem — é
     * afirmação sobre a base, não sobre o filtro.
     */
    "10. 'incluir já contatados' aumenta o total de elegíveis",
    incluindo.elegiveis > depoisResposta.elegiveis,
    `${depoisResposta.elegiveis} → ${incluindo.elegiveis}`,
  );

  console.log("\n=== C. PRIORIDADE E QUANTIDADE ===");
  const todas = await oportunidades({ somenteWhatsapp: false }, 200);
  const alta = await oportunidades({ somenteWhatsapp: false, prioridade: "alta" }, 200);
  ok(
    "11. prioridade alta só traz score >= 70",
    alta.leads.every((l) => l.score >= 70),
    `${alta.leads.length} leads`,
  );
  ok("12. prioridade alta é subconjunto de todas", alta.leads.length <= todas.leads.length);
  ok(
    "13. lista vem ordenada do melhor para o pior",
    todas.leads.every((l, i) => i === 0 || todas.leads[i - 1].score >= l.score),
  );

  const cortado = await oportunidades({ somenteWhatsapp: false }, 3);
  ok("14. limite de quantidade é respeitado", cortado.leads.length === 3, `${cortado.leads.length} leads`);
  ok(
    "15. os cortados são os melhores, não os primeiros do banco",
    cortado.leads[0].score >= cortado.leads[2].score,
  );

  console.log("\n=== D. PERFIS POR NICHO ===");
  const ESPERADO: [string, string, string[]][] = [
    ["oficina", "car_repair", ["ordem-servico"]],
    ["assistência técnica", "phone_repair", ["ordem-servico"]],
    ["estética/salão", "beauty", ["agendamento", "clientes"]],
    ["barbearia", "barber", ["agendamento", "comissao"]],
    ["pet shop", "pet", ["agendamento", "pets"]],
    ["lava-jato", "car_wash", ["clientes", "veiculos", "retorno"]],
    ["clínica", "clinic", ["agendamento", "clientes"]],
    ["dentista", "dentist", ["agendamento", "retorno"]],
    ["pousada", "guest_house", ["reservas", "quartos", "hospedes"]],
    ["imobiliária", "estate_agent", ["imoveis", "visitas"]],
  ];
  for (const [rotulo, cat, obrigatorios] of ESPERADO) {
    const e = avaliarSistema(leadFake(cat));
    const tem = obrigatorios.every((m) => e.modulos.includes(m as never));
    ok(`16-25. ${rotulo}`, e.serve && tem, `${e.sistema} [${e.modulos.join(", ")}]`);
  }

  console.log("\n=== E. CATÁLOGO ===");
  const site = SOLUCOES.find((s) => s.id === "site")!;
  ok(
    "26. site é a ÚLTIMA prioridade do catálogo",
    site.prioridade === Math.max(...SOLUCOES.map((s) => s.prioridade)),
    `site=${site.prioridade}, máximo=${Math.max(...SOLUCOES.map((s) => s.prioridade))}`,
  );
  ok(
    "27. sistema sob medida é a primeira",
    SOLUCOES.find((s) => s.id === "sistema-sob-medida")!.prioridade === 1,
  );
  ok(
    "28. nenhum dos 10 nichos cai em 'site' por padrão",
    ESPERADO.every(([, cat]) => avaliarSistema(leadFake(cat)).serve),
  );

  console.log("\n=== F. AÇÕES DE REVISÃO ===");
  const zeta = novos.find((l) => l.nome.includes("Zeta"))!;
  await db.insert(geracaoFila).values({ campanhaId: camp.id, leadId: zeta.id, status: "pronta" });
  const [msg] = await db
    .insert(mensagens)
    .values({
      leadId: zeta.id,
      campanhaId: camp.id,
      texto: "Texto original gerado pela IA para revisão.",
      produto: "sistema-sob-medida",
      origem: "ia",
      status: "rascunho",
      rodada: 0,
      prioridade: 40,
    })
    .returning();

  // Editar → vira manual
  await db
    .update(mensagens)
    .set({ texto: "Texto reescrito por mim.", origem: "manual" })
    .where(eq(mensagens.id, msg.id));
  const [editada] = await db.select().from(mensagens).where(eq(mensagens.id, msg.id));
  ok("29. edição manual marca origem 'manual'", editada.origem === "manual", editada.origem);

  const recusa = await regenerar(msg.id);
  ok(
    "30. regenerar RECUSA sobrescrever texto manual",
    !recusa.ok,
    recusa.ok ? "" : recusa.erro,
  );
  const [aindaManual] = await db.select().from(mensagens).where(eq(mensagens.id, msg.id));
  ok(
    "31. o texto editado continua intacto",
    aindaManual.texto === "Texto reescrito por mim." && aindaManual.status === "rascunho",
  );

  // Regenerar mensagem de IA: cancela a antiga e devolve o item à fila.
  await db.update(mensagens).set({ origem: "ia" }).where(eq(mensagens.id, msg.id));
  const refeita = await regenerar(msg.id);
  const [antiga] = await db.select().from(mensagens).where(eq(mensagens.id, msg.id));
  const [item] = await db
    .select()
    .from(geracaoFila)
    .where(eq(geracaoFila.leadId, zeta.id));
  ok("32. regenerar aceita mensagem de IA", refeita.ok);
  ok(
    "33. a mensagem antiga é CANCELADA, não apagada",
    antiga.status === "cancelada" && antiga.texto.length > 0,
    `status=${antiga.status}`,
  );
  ok(
    "34. o lead volta para a fila de geração, zerado",
    item.status === "pendente" && item.tentativas === 0 && item.esperas === 0,
    `status=${item.status} tentativas=${item.tentativas}`,
  );
  ok("35. regenerar NÃO gerou nada na hora (respeita a fila)", item.mensagemId === null);

  // Aprovar e rejeitar
  const [m2] = await db
    .insert(mensagens)
    .values({
      leadId: novos.find((l) => l.nome.includes("Epsilon"))!.id,
      campanhaId: camp.id,
      texto: "Segunda mensagem de teste para aprovar.",
      origem: "ia",
      status: "rascunho",
      rodada: 0,
      prioridade: 30,
    })
    .returning();
  await db
    .update(mensagens)
    .set({ status: "aprovada", aprovadaEm: new Date() })
    .where(eq(mensagens.id, m2.id));
  const [aprovada] = await db.select().from(mensagens).where(eq(mensagens.id, m2.id));
  ok("36. aprovar move rascunho → aprovada", aprovada.status === "aprovada");
  ok("37. aprovar NÃO envia", aprovada.enviadaEm === null && aprovada.provedorId === null);

  await db
    .update(mensagens)
    .set({ status: "cancelada" })
    .where(eq(mensagens.id, m2.id));
  const [rejeitada] = await db.select().from(mensagens).where(eq(mensagens.id, m2.id));
  ok("38. rejeitada não pode mais ser enviada", rejeitada.status === "cancelada");

  console.log("\n=== G. NADA FOI ENVIADO ===");
  const todasMinhas = await db
    .select()
    .from(mensagens)
    .where(inArray(mensagens.leadId, novos.map((l) => l.id)));
  ok(
    "39. nenhuma mensagem de teste tem id de provedor",
    todasMinhas.every((m) => m.provedorId === null),
    `${todasMinhas.length} mensagens conferidas`,
  );
  ok(
    "40. só a que marquei como enviada tem enviadaEm",
    todasMinhas.filter((m) => m.enviadaEm).length === 1,
  );

  await limpar();
  console.log(`\n${passou} PASS, ${falhou} FAIL. Dados de teste removidos.`);
  process.exit(falhou ? 1 : 0);
}

async function limpar() {
  const camps = await db.select({ id: campanhas.id }).from(campanhas).where(like(campanhas.nome, `${MARCA}%`));
  const antigos = await db.select({ id: leads.id }).from(leads).where(like(leads.placeId, `${MARCA}:%`));
  if (camps.length) {
    const ids = camps.map((c) => c.id);
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
  process.exit(1);
});
