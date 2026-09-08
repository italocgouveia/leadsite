import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, leads, enriquecimentoFila, type Lead } from "@/lib/db";
import { precisaEnriquecer } from "@/lib/enriquecimento";
import {
  validarTelefone,
  linkWhatsapp,
  formatarTelefone,
  telefoneDoLead,
  dddCompativel,
} from "@/lib/telefone";
import { ehPlataformaCompartilhada } from "@/lib/places/audit";
import { consultarOverpass } from "@/lib/osm/search";

/**
 * A fila que procura o telefone dos melhores leads que não têm.
 *
 * O QUE ELA NUNCA FAZ
 *
 * Não gera mensagem, não aprova, não enfileira envio, não fala com a Bridge.
 * O único efeito possível de um item processado é gravar um telefone num lead
 * — e mesmo isso só acontece sob as travas abaixo.
 *
 * AS TRAVAS
 *
 *  - nunca sobrescreve telefone existente (a checagem é refeita na hora de
 *    gravar, não só na hora de enfileirar: entre uma coisa e outra alguém pode
 *    ter digitado o número à mão);
 *  - nunca grava número que não passe em `validarTelefone`;
 *  - nunca grava número que já pertença a OUTRO lead — número repetido é sinal
 *    de que a fonte devolveu o telefone errado, não de que achamos um lead
 *    novo;
 *  - grava sempre a origem, a data e a confiança junto do número.
 *
 * E não afirma WhatsApp em lugar nenhum: o que se acha aqui é TELEFONE. Quem
 * confirma conta de WhatsApp é o envio, e isso continua sendo assunto da fila
 * de mensagens.
 */

/** Confiança de cada fonte, de 0 a 100. */
const CONFIANCA: Record<string, number> = {
  /** A tag veio do próprio cadastro do estabelecimento no mapa. */
  osm: 85,
  /** Número no site da própria empresa: é ela dizendo o número dela. */
  "site-proprio": 90,
  /** Diretório de empresas do Google, com o número que o dono cadastrou. */
  places: 95,
};

/** Abaixo disto o número não é gravado — vira `nao_encontrado`. */
const CONFIANCA_MINIMA = 70;

export type Achado = { telefone: string; fonte: string; confianca: number } | null;

// ══════════════════════════════════════════════════════════ fontes

/**
 * O número já está no cadastro, num campo que ninguém leu?
 *
 * A coleta grava tags cruas do mapa em `dadosOsm`. Se alguma delas for um
 * telefone (`phone`, `contact:phone`, `contact:mobile`), o dado já é nosso e
 * não custa consulta nenhuma. É a primeira fonte por isso: de graça e imediata.
 */
export function fonteCadastro(lead: Lead): Achado {
  const osm = lead.dadosOsm ?? {};
  for (const [chave, valor] of Object.entries(osm)) {
    if (!/(^|:)(phone|mobile|whatsapp)$/i.test(chave)) continue;
    const tel = validarTelefone(valor);
    if (tel) return { telefone: tel.formatado, fonte: "osm", confianca: CONFIANCA.osm };
  }
  return null;
}

/**
 * O telefone no site da própria empresa.
 *
 * Só o domínio do lead, nunca uma busca aberta: o número no rodapé do site de
 * uma oficina é o número daquela oficina. Um número achado numa página
 * qualquer que cita o nome dela não é — e é por isso que não existe fonte de
 * "busca na web" aqui.
 */
export async function fonteSiteProprio(lead: Lead): Promise<Achado> {
  if (!lead.website?.trim()) return null;

  /**
   * SÓ DOMÍNIO PRÓPRIO. Facebook, Instagram, Linktree e keepo.io hospedam
   * milhares de negócios na mesma página, e o número que aparece ali costuma
   * ser da plataforma, não da empresa.
   *
   * Medido: raspar essas páginas deu o MESMO telefone — (61) 98787-1047 — para
   * "Fazendeiro Lanches" e "Casa do Salgado", duas empresas sem relação. Um
   * número compartilhado por duas empresas não é o número de nenhuma das duas.
   */
  if (ehPlataformaCompartilhada(lead.website)) return null;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    const res = await fetch(lead.website, {
      redirect: "follow",
      signal: controle.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadSiteBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);

    /**
     * Procura padrões de telefone brasileiro no texto e valida cada candidato.
     * `validarTelefone` é quem decide — aqui só se separa o que parece número
     * do que não parece, e nenhum candidato reprovado é aproveitado.
     */
    const candidatos = html.match(/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g) ?? [];
    for (const bruto of candidatos) {
      const tel = validarTelefone(bruto);
      if (!tel) continue;

      /**
       * O DDD tem de bater com o estado do lead. Medido nesta base, sem a
       * checagem entrava DDD 17 (Rio Preto) e DDD 11 (São Paulo) em leads de
       * Uberlândia — números de outra empresa, provavelmente de quem fez o
       * site. Número da região errada é palpite, e palpite não vira cadastro.
       */
      if (!dddCompativel(tel.formatado, lead.estado)) continue;

      return {
        telefone: tel.formatado,
        fonte: "site-proprio",
        confianca: CONFIANCA["site-proprio"],
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reconsulta o elemento no OpenStreetMap — GRÁTIS, e por isso vem antes do
 * Places.
 *
 * O mapa é editado por voluntários todo dia: um estabelecimento coletado sem
 * telefone hoje pode ganhar a tag `phone` na semana que vem. Como o lead
 * guarda o id do elemento (`osm:node/123`), dá para perguntar de novo só por
 * aquele ponto — uma consulta minúscula, sem varrer a cidade.
 *
 * É a fonte que sustenta a regra de não depender de API paga: ela funciona
 * sozinha, para sempre, sem chave nenhuma.
 */
export async function fonteOsm(lead: Lead): Promise<Achado> {
  const m = lead.placeId?.match(/^osm:(node|way|relation)\/(\d+)$/);
  if (!m) return null;
  const [, tipo, id] = m;

  try {
    const dados = await consultarOverpass(
      `[out:json][timeout:25];${tipo}(${id});out tags;`,
    );
    const tags = (dados.elements?.[0]?.tags ?? {}) as Record<string, string>;

    for (const chave of ["phone", "contact:phone", "contact:mobile", "mobile"]) {
      const tel = validarTelefone(tags[chave]);
      if (tel && dddCompativel(tel.formatado, lead.estado)) {
        return { telefone: tel.formatado, fonte: "osm", confianca: CONFIANCA.osm };
      }
    }
    return null;
  } catch {
    // Espelho do Overpass fora do ar não é erro do lead — só não achou hoje.
    return null;
  }
}

/**
 * Google Places — só quando a chave está configurada.
 *
 * Devolve `null` sem chave, e isso NÃO é erro: é a resposta certa para "esta
 * fonte não está disponível". Medido nesta instalação: `GOOGLE_PLACES_API_KEY`
 * está vazia, então este caminho não roda hoje.
 */
export async function fontePlaces(lead: Lead): Promise<Achado> {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  if (!chave?.trim()) return null;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": chave,
        "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber",
      },
      body: JSON.stringify({
        textQuery: `${lead.nome} ${lead.endereco ?? ""} ${lead.cidade ?? ""}`.trim(),
        languageCode: "pt-BR",
        regionCode: "BR",
        maxResultCount: 1,
      }),
    });
    if (!res.ok) return null;
    const corpo = (await res.json()) as {
      places?: { nationalPhoneNumber?: string }[];
    };
    const tel = validarTelefone(corpo.places?.[0]?.nationalPhoneNumber);
    return tel
      ? { telefone: tel.formatado, fonte: "places", confianca: CONFIANCA.places }
      : null;
  } catch {
    return null;
  }
}

/**
 * As fontes, da mais barata para a mais cara — e as GRATUITAS primeiro.
 *
 * A ordem é a política: o CRM tem de funcionar inteiro sem nenhuma API paga.
 * `places` é a última e devolve `null` sem chave, o que não é erro — é a
 * resposta certa para "esta fonte não está disponível aqui". Tirar o Places da
 * lista não muda o comportamento das outras três.
 */
const FONTES: { nome: string; buscar: (l: Lead) => Promise<Achado> | Achado }[] = [
  { nome: "cadastro", buscar: fonteCadastro },
  { nome: "osm", buscar: fonteOsm },
  { nome: "site-proprio", buscar: fonteSiteProprio },
  { nome: "places", buscar: fontePlaces },
];

/** As fontes que funcionam sem nenhuma chave de API. Usado nos testes. */
export const FONTES_GRATUITAS = ["cadastro", "osm", "site-proprio"];

// ══════════════════════════════════════════════════════════ a fila

export type ResumoFila = {
  pendente: number;
  processando: number;
  encontrado: number;
  nao_encontrado: number;
  erro: number;
  total: number;
};

/** Enfileira todos os leads que `precisaEnriquecer` aprova. Não processa nada. */
export async function enfileirar(): Promise<{ novos: number; jaNaFila: number }> {
  const base = await db.select().from(leads);
  const candidatos = base
    .map((lead) => ({ lead, e: precisaEnriquecer(lead) }))
    .filter(({ e }) => e.precisa);

  if (!candidatos.length) return { novos: 0, jaNaFila: 0 };

  /**
   * `ON CONFLICT DO NOTHING` sobre o índice único por lead: reenfileirar é
   * inofensivo e não reseta o estado de quem já foi processado. É o mesmo
   * padrão da fila de geração, e pela mesma razão — o botão da tela pode ser
   * clicado duas vezes.
   */
  const inseridos = await db
    .insert(enriquecimentoFila)
    .values(
      candidatos.map(({ lead, e }) => ({
        leadId: lead.id,
        prioridade: e.ordem ?? 4,
        faixa: e.prioridade,
        motivo: e.motivo,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: enriquecimentoFila.id });

  return { novos: inseridos.length, jaNaFila: candidatos.length - inseridos.length };
}

/** Reserva ATÔMICA do próximo item: dois processos nunca pegam o mesmo. */
async function reservar(): Promise<typeof enriquecimentoFila.$inferSelect | null> {
  const [item] = await db
    .select()
    .from(enriquecimentoFila)
    .where(eq(enriquecimentoFila.status, "pendente"))
    .orderBy(asc(enriquecimentoFila.prioridade), asc(enriquecimentoFila.criadoEm))
    .limit(1);
  if (!item) return null;

  const [reservado] = await db
    .update(enriquecimentoFila)
    .set({
      status: "processando",
      processandoDesde: new Date(),
      tentativas: sql`${enriquecimentoFila.tentativas} + 1`,
      atualizadoEm: new Date(),
    })
    .where(
      and(eq(enriquecimentoFila.id, item.id), eq(enriquecimentoFila.status, "pendente")),
    )
    .returning();

  return reservado ?? null;
}

/**
 * Grava o telefone achado — com todas as travas.
 *
 * Devolve o motivo da recusa quando não grava, porque um item que termina em
 * `nao_encontrado` sem explicação faz alguém repetir a consulta para sempre.
 */
async function gravar(
  lead: Lead,
  achado: NonNullable<Achado>,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (achado.confianca < CONFIANCA_MINIMA) {
    return { ok: false, motivo: `confiança ${achado.confianca} abaixo do mínimo` };
  }

  const tel = validarTelefone(achado.telefone);
  if (!tel) return { ok: false, motivo: "número achado não é telefone brasileiro válido" };

  /**
   * Relê o lead do banco antes de gravar. Entre enfileirar e processar pode ter
   * passado meia hora, e alguém pode ter digitado o telefone à mão — sobrescrever
   * isso seria trocar dado conferido por dado achado.
   */
  const [atual] = await db.select().from(leads).where(eq(leads.id, lead.id)).limit(1);
  if (!atual) return { ok: false, motivo: "lead não existe mais" };
  if (validarTelefone(telefoneDoLead(atual))) {
    return { ok: false, motivo: "lead já tinha telefone — nada foi sobrescrito" };
  }

  /**
   * Número que já é de OUTRO lead não entra. Duas empresas com a mesma linha
   * quase sempre significa que a fonte devolveu o estabelecimento errado, e o
   * estrago de mandar mensagem para o número de outra empresa é maior que o
   * ganho de ter mais um lead contatável.
   */
  const repetido = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.telefone, tel.formatado), sql`${leads.id} <> ${lead.id}::uuid`))
    .limit(1);
  if (repetido.length) {
    return { ok: false, motivo: "número já pertence a outro lead" };
  }

  await db
    .update(leads)
    .set({
      telefone: tel.formatado,
      whatsapp: linkWhatsapp(tel.formatado),
      telefoneOrigem: achado.fonte,
      telefoneEncontradoEm: new Date(),
      telefoneConfianca: achado.confianca,
      atualizadoEm: new Date(),
    })
    .where(eq(leads.id, lead.id));

  return { ok: true };
}

export type ResultadoItem = {
  leadId: string;
  lead: string;
  status: "encontrado" | "nao_encontrado" | "erro";
  telefone?: string;
  fonte?: string;
  detalhe?: string;
};

/** Processa UM item. Nunca lança: falha vira estado `erro` com a mensagem. */
async function processarItem(
  item: typeof enriquecimentoFila.$inferSelect,
): Promise<ResultadoItem> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, item.leadId)).limit(1);
  if (!lead) {
    await db
      .update(enriquecimentoFila)
      .set({ status: "erro", erro: "lead removido", atualizadoEm: new Date() })
      .where(eq(enriquecimentoFila.id, item.id));
    return { leadId: item.leadId, lead: "(removido)", status: "erro", detalhe: "lead removido" };
  }

  const tentadas: string[] = [];
  let recusa = "nenhuma fonte devolveu telefone";

  try {
    for (const fonte of FONTES) {
      tentadas.push(fonte.nome);
      const achado = await fonte.buscar(lead);
      if (!achado) continue;

      const r = await gravar(lead, achado);
      if (r.ok) {
        await db
          .update(enriquecimentoFila)
          .set({
            status: "encontrado",
            telefoneEncontrado: achado.telefone,
            fonte: achado.fonte,
            confianca: achado.confianca,
            fontesTentadas: tentadas,
            processandoDesde: null,
            atualizadoEm: new Date(),
          })
          .where(eq(enriquecimentoFila.id, item.id));
        return {
          leadId: lead.id,
          lead: lead.nome,
          status: "encontrado",
          telefone: achado.telefone,
          fonte: achado.fonte,
        };
      }
      recusa = r.motivo;
    }

    await db
      .update(enriquecimentoFila)
      .set({
        status: "nao_encontrado",
        erro: recusa,
        fontesTentadas: tentadas,
        processandoDesde: null,
        atualizadoEm: new Date(),
      })
      .where(eq(enriquecimentoFila.id, item.id));
    return { leadId: lead.id, lead: lead.nome, status: "nao_encontrado", detalhe: recusa };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(enriquecimentoFila)
      .set({
        status: "erro",
        erro: msg.slice(0, 300),
        fontesTentadas: tentadas,
        processandoDesde: null,
        atualizadoEm: new Date(),
      })
      .where(eq(enriquecimentoFila.id, item.id));
    return { leadId: lead.id, lead: lead.nome, status: "erro", detalhe: msg.slice(0, 120) };
  }
}

/** Drena um lote da fila, do mais prioritário para o menos. */
export async function processarLote(
  { max = 10 }: { max?: number } = {},
): Promise<{ processados: ResultadoItem[]; encontrados: number }> {
  const processados: ResultadoItem[] = [];
  for (let i = 0; i < max; i++) {
    const item = await reservar();
    if (!item) break;
    processados.push(await processarItem(item));
  }
  return {
    processados,
    encontrados: processados.filter((p) => p.status === "encontrado").length,
  };
}

/** Devolve item preso em `processando` há muito tempo para a fila. */
export async function recuperarPresos(minutos = 15): Promise<number> {
  const voltaram = await db
    .update(enriquecimentoFila)
    .set({ status: "pendente", processandoDesde: null, atualizadoEm: new Date() })
    .where(
      and(
        eq(enriquecimentoFila.status, "processando"),
        sql`${enriquecimentoFila.processandoDesde} < now() - (${minutos} || ' minutes')::interval`,
      ),
    )
    .returning({ id: enriquecimentoFila.id });
  return voltaram.length;
}

export async function estadoDaFila(): Promise<ResumoFila> {
  const linhas = await db
    .select({ status: enriquecimentoFila.status, quantos: sql<number>`count(*)::int` })
    .from(enriquecimentoFila)
    .groupBy(enriquecimentoFila.status);

  const r: ResumoFila = {
    pendente: 0,
    processando: 0,
    encontrado: 0,
    nao_encontrado: 0,
    erro: 0,
    total: 0,
  };
  for (const l of linhas) {
    r[l.status as keyof ResumoFila] = Number(l.quantos);
    r.total += Number(l.quantos);
  }
  return r;
}

/** Os itens da fila com o nome do lead, para a tela. */
export async function listarFila(limite = 50) {
  return db
    .select({
      id: enriquecimentoFila.id,
      leadId: enriquecimentoFila.leadId,
      lead: leads.nome,
      categoria: leads.categoria,
      status: enriquecimentoFila.status,
      prioridade: enriquecimentoFila.prioridade,
      faixa: enriquecimentoFila.faixa,
      motivo: enriquecimentoFila.motivo,
      telefoneEncontrado: enriquecimentoFila.telefoneEncontrado,
      fonte: enriquecimentoFila.fonte,
      erro: enriquecimentoFila.erro,
    })
    .from(enriquecimentoFila)
    .innerJoin(leads, eq(leads.id, enriquecimentoFila.leadId))
    .orderBy(
      sql`array_position(ARRAY['pendente','processando','encontrado','nao_encontrado','erro'], ${enriquecimentoFila.status})`,
      asc(enriquecimentoFila.prioridade),
    )
    .limit(limite);
}

/** Remove da fila itens cujo lead já ganhou telefone por outro caminho. */
export async function limparResolvidos(): Promise<number> {
  const comTelefone = await db
    .select({ id: leads.id, telefone: leads.telefone })
    .from(leads);
  const ids = comTelefone.filter((l) => validarTelefone(l.telefone)).map((l) => l.id);
  if (!ids.length) return 0;

  const removidos = await db
    .delete(enriquecimentoFila)
    .where(
      and(
        inArray(enriquecimentoFila.leadId, ids),
        inArray(enriquecimentoFila.status, ["pendente", "processando"]),
      ),
    )
    .returning({ id: enriquecimentoFila.id });
  return removidos.length;
}

/** Reexportado para os testes cobrirem a normalização junto da fila. */
export { formatarTelefone };
