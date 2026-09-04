import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, campanhas, mensagens, leads, eventos, type Lead } from "@/lib/db";
import { podeContatar, lerConfig } from "@/lib/fila";
import { estadoIntegracao } from "@/lib/integracao";
import { montarProposta } from "@/lib/proposta";
import { montarPropostaSistema, avaliarSistema } from "@/lib/sistemas";
import { avaliar } from "@/lib/oportunidade";
import { pontuar } from "@/lib/pontuacao";
import { gerarMensagemProspeccao } from "@/lib/gen/mensagem-prospeccao";
import { enfileirar, processarLote, estadoGeracao } from "@/lib/gen/fila-geracao";

/**
 * Campanhas: montar, iniciar, pausar, acompanhar.
 *
 * A campanha é o container que faz "Iniciar campanha" significar algo. Ela
 * responde a pergunta que decide o próximo lote: *daqueles 40 contatos de
 * oficina, quantos responderam?* Sem isso a fila é um balde único.
 *
 * DECISÃO IMPORTANTE: montar a campanha **não** envia nada. Ela nasce em
 * `rascunho` com as mensagens em `rascunho`. Você revisa, aprova e só então
 * inicia. Um botão que pesquisa, escreve e dispara no mesmo clique é como se
 * manda 40 mensagens erradas antes de ler a primeira.
 */

export type Progresso = {
  total: number;
  rascunho: number;
  aprovadas: number;
  enviadas: number;
  entregues: number;
  respondidas: number;
  erros: number;
  canceladas: number;
  /** Quanto já saiu, sobre o total. */
  percentual: number;
  taxaResposta: number;
};

export async function registrar(
  tipo: string,
  descricao: string,
  extra: { campanhaId?: string; leadId?: string; dados?: Record<string, unknown> } = {},
) {
  await db.insert(eventos).values({ tipo, descricao, ...extra });
}

/**
 * Cria a campanha e monta um rascunho de mensagem para cada lead elegível.
 *
 * Devolve os PULADOS com motivo. Em lote, silêncio sobre o que não entrou é
 * como você acha que montou 40 contatos e montou 12.
 */
export async function montarCampanha(params: {
  nome: string;
  leadIds: string[];
  /**
   * Texto ÚNICO e literal para todos os leads da campanha, escrito pela
   * pessoa. Quando presente, IGNORA `usarIA`/`produto`/`textoPara` por
   * completo — o texto vai para o banco exatamente como foi digitado.
   * Continua existindo para quem quer controle total do texto, mas não é
   * mais o padrão de /disparos — ver `usarIA`.
   */
  mensagem?: string;
  /**
   * Uma mensagem DIFERENTE por lead, escrita pela IA (ver
   * lib/gen/mensagem-prospeccao.ts). É o padrão de /disparos: nicho +
   * abordagem entram, cada lead sai com um texto próprio, nunca copiado dos
   * outros. Ignorado se `mensagem` também vier — `mensagem` sempre vence.
   */
  usarIA?: boolean;
  produto?: "site" | "chatbot" | "sistema";
  filtro?: Record<string, unknown>;
}) {
  const cfg = await lerConfig();

  const [campanha] = await db
    .insert(campanhas)
    .values({
      nome: params.nome,
      status: "rascunho",
      produto: params.produto ?? null,
      filtro: params.filtro ?? null,
    })
    .returning();

  const alvos = await db.select().from(leads).where(inArray(leads.id, params.leadIds));
  const pulados: { nome: string; motivo: string }[] = [];
  let criadas = 0;

  /**
   * Sequencial, um lead de cada vez — de propósito, não `Promise.all`.
   * Gerar por IA é uma chamada de rede por lead; disparar todas juntas é o
   * que estoura a cota por minuto do Gemini gratuito no primeiro lote de 20.
   */
  for (const lead of alvos) {
    const check = await podeContatar(lead, cfg);
    if (!check.pode) {
      pulados.push({ nome: lead.nome, motivo: check.motivo });
      continue;
    }

    let texto: string | null;
    let origem: "modelo" | "ia" = "modelo";
    /** Solução escolhida pela IA; vira o `produto` da mensagem. */
    let solucaoEscolhida: string | null = null;

    if (params.mensagem) {
      texto = params.mensagem;
    } else if (params.usarIA) {
      try {
        const analise = await gerarMensagemProspeccao(lead, { produto: params.produto });
        texto = analise.mensagem;
        solucaoEscolhida = analise.solucao;
        origem = "ia";
      } catch (e) {
        /**
         * Lead pulado volta na próxima campanha; mensagem quebrada sai no
         * WhatsApp de um estranho. Por isso falha aqui NÃO vira fallback
         * para o motor determinístico: ele escreveria sobre site, que é
         * exatamente o que esta campanha não quer oferecer.
         */
        pulados.push({
          nome: lead.nome,
          motivo: `Falha ao gerar mensagem por IA: ${e instanceof Error ? e.message : "erro desconhecido"}`,
        });
        continue;
      }
    } else {
      texto = textoPara(lead, params.produto);
    }

    if (!texto) {
      pulados.push({ nome: lead.nome, motivo: "Sem mensagem possível para este ramo." });
      continue;
    }

    await db.insert(mensagens).values({
      leadId: lead.id,
      campanhaId: campanha.id,
      texto,
      /**
       * Com IA, guarda a SOLUÇÃO que ela escolheu (ex.: "sistema-sob-medida")
       * — é o que a tela mostra depois para explicar a abordagem. Sem IA,
       * mantém o comportamento antigo: produto forçado, ou o palpite do
       * motor determinístico.
       */
      produto:
        solucaoEscolhida ??
        params.produto ??
        (params.mensagem || params.usarIA ? null : avaliar(lead).produto),
      origem,
      status: "rascunho",
      rodada: 0,
      // Mais quente sai primeiro, aqui também. Ver a coluna no schema.
      prioridade: pontuar(lead).total,
    });
    criadas++;
  }

  await registrar(
    "campanha.criada",
    `"${campanha.nome}": ${criadas} mensagens, ${pulados.length} puladas`,
    { campanhaId: campanha.id, dados: { criadas, pulados: pulados.length } },
  );

  return { campanha, criadas, pulados };
}

/**
 * Cria a campanha VAZIA e ENFILEIRA os leads para geração por IA.
 *
 * Existe porque gerar por IA leva ~15–30s POR LEAD: um lote de 40 não cabe em
 * requisição HTTP nenhuma. Aqui a criação responde na hora e o trabalho fica
 * numa fila persistente (tabela `geracao_fila`), processada por quem estiver
 * disponível — o serviço local, o cron, ou a própria tela.
 *
 * A versão anterior guardava os pendentes dentro de `campanhas.filtro` e
 * dependia de um laço no NAVEGADOR para andar. Fechar a aba parava a geração.
 * Agora a aba não participa: ela só olha.
 */
export async function criarCampanhaParaGerar(params: {
  nome: string;
  leadIds: string[];
  produto?: "site" | "chatbot" | "sistema";
  filtro?: Record<string, unknown>;
}) {
  const [campanha] = await db
    .insert(campanhas)
    .values({
      nome: params.nome,
      status: "rascunho",
      produto: params.produto ?? null,
      filtro: params.filtro ?? null,
    })
    .returning();

  const alvos = await db.select().from(leads).where(inArray(leads.id, params.leadIds));
  const { enfileirados } = await enfileirar(campanha.id, ordenarPorPontuacao(alvos));

  await registrar("campanha.enfileirada", `"${campanha.nome}": ${enfileirados} leads na fila`, {
    campanhaId: campanha.id,
    dados: { enfileirados },
  });

  return { campanha, total: enfileirados };
}

/**
 * Processa um lote da campanha. Mantida como atalho para a tela: quem faz o
 * trabalho de verdade é `processarLote` em lib/gen/fila-geracao.
 *
 * Chamar isto é OPCIONAL — a fila anda sem ninguém pedir. Serve para acelerar
 * enquanto você está com /disparos aberto, e para o cron cutucar.
 */
export async function gerarPendentes(campanhaId: string, tamanhoLote = 3) {
  const [c] = await db.select().from(campanhas).where(eq(campanhas.id, campanhaId)).limit(1);
  if (!c) return { ok: false as const, erro: "Campanha não encontrada." };

  const lote = await processarLote({ campanhaId, max: tamanhoLote, orcamentoMs: 90_000 });
  const estado = await estadoGeracao(campanhaId);

  return {
    ok: true as const,
    restantes: lote.restantes,
    geradas: estado.pronta,
    pulados: estado.problemas.map((p) => ({ nome: `${p.quantos} lead(s)`, motivo: p.motivo })),
    /**
     * Sinaliza para quem chama PARAR de pedir lote agora. Sem isto, o laço da
     * tela giraria pedindo lote atrás de lote e recebendo o mesmo erro de
     * cota — e como item adiado volta para `pendente`, `restantes` nunca
     * zeraria: laço infinito.
     */
    pausadoPorCota: lote.pausadoPorCota,
    estado,
  };
}

/** Qual motor escreve a mensagem, conforme o produto escolhido. */
export function textoPara(
  lead: Lead,
  produto?: "site" | "chatbot" | "sistema",
): string | null {
  if (produto === "sistema") return montarPropostaSistema(lead);
  if (produto === "site" || produto === "chatbot") return montarProposta(lead).mensagem;

  // Sem produto definido: sistema quando o ramo encaixa, senão o motor padrão.
  return avaliarSistema(lead).serve
    ? (montarPropostaSistema(lead) ?? montarProposta(lead).mensagem)
    : montarProposta(lead).mensagem;
}

export async function progresso(campanhaId: string): Promise<Progresso> {
  const linhas = await db
    .select({ status: mensagens.status })
    .from(mensagens)
    .where(eq(mensagens.campanhaId, campanhaId));

  const conta = (s: string) => linhas.filter((l) => l.status === s).length;
  const total = linhas.length;
  const enviadas = conta("enviada") + conta("entregue") + conta("respondida");
  const respondidas = conta("respondida");

  return {
    total,
    rascunho: conta("rascunho"),
    aprovadas: conta("aprovada") + conta("na-fila"),
    enviadas,
    entregues: conta("entregue") + respondidas,
    respondidas,
    erros: conta("erro"),
    canceladas: conta("cancelada"),
    percentual: total ? Math.round((enviadas / total) * 100) : 0,
    taxaResposta: enviadas ? Math.round((respondidas / enviadas) * 100) : 0,
  };
}

/**
 * Inicia: aprova o que ainda é rascunho e marca a campanha como rodando.
 *
 * Aprovar aqui é intencional — você revisou a lista na tela antes de clicar.
 * O que a função NÃO faz é enviar: quem envia é a fila, um por vez, com as
 * travas de intervalo e teto diário revalidadas a cada mensagem.
 */
export async function iniciar(campanhaId: string) {
  const [c] = await db.select().from(campanhas).where(eq(campanhas.id, campanhaId)).limit(1);
  if (!c) return { ok: false as const, erro: "Campanha não encontrada." };

  /**
   * Recusa iniciar com a integração quebrada. Aprovar 40 mensagens que vão
   * todas dar erro não é "começar a campanha" — é gastar a fila e sujar o
   * histórico com falha que já era previsível aqui.
   */
  const integracao = await estadoIntegracao();
  if (!integracao.pronta) {
    const falta = integracao.pendencias.filter((p) => !p.feito).map((p) => p.item);
    return {
      ok: false as const,
      erro: integracao.erro ?? `WhatsApp não configurado. Falta: ${falta.join(", ")}.`,
      pendencias: integracao.pendencias,
    };
  }
  if (c.status === "concluida" || c.status === "cancelada") {
    return { ok: false as const, erro: `Campanha já ${c.status}.` };
  }

  const agora = new Date();

  /**
   * NÃO aprova mensagem de lead que já tem outra esperando envio.
   *
   * A fila recusa contatar quem já tem mensagem viva — é o que impede a mesma
   * pessoa receber duas abordagens. Só que a checagem acontece na hora do
   * envio, e a aprovação em lote não olhava para isso: aprovar duas campanhas
   * que contêm o mesmo lead criava DUAS mensagens vivas para ele, e as duas
   * passavam a se bloquear.
   *
   * O resultado observado em 04/09 foi uma fila parada com 123 aprovadas e
   * nenhuma candidata: 26 leads travados em pares, e a tela sem explicar nada
   * porque, do ponto de vista dela, tudo estava aprovado.
   *
   * O lead pulado aqui não some — continua em `rascunho`, e entra assim que a
   * mensagem anterior dele sair.
   */
  const jaTemViva = db
    .select({ leadId: mensagens.leadId })
    .from(mensagens)
    .where(inArray(mensagens.status, ["aprovada", "na-fila"]));

  const aprovadas = await db
    .update(mensagens)
    .set({ status: "aprovada", aprovadaEm: agora, erro: null, atualizadoEm: agora })
    .where(
      and(
        eq(mensagens.campanhaId, campanhaId),
        eq(mensagens.status, "rascunho"),
        notInArray(mensagens.leadId, jaTemViva),
      ),
    )
    .returning({ id: mensagens.id });

  const [restantes] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(and(eq(mensagens.campanhaId, campanhaId), eq(mensagens.status, "rascunho")));

  await db
    .update(campanhas)
    .set({ status: "rodando", iniciadaEm: c.iniciadaEm ?? agora, atualizadoEm: agora })
    .where(eq(campanhas.id, campanhaId));

  await registrar("campanha.iniciada", `"${c.nome}": ${aprovadas.length} aprovadas` + ((restantes?.n ?? 0) ? `, ${restantes.n} adiadas (lead ja tem mensagem na fila)` : ""), {
    campanhaId,
  });

  return {
    ok: true as const,
    aprovadas: aprovadas.length,
    /** Ficaram em rascunho porque o lead ja tinha mensagem esperando envio. */
    adiadas: restantes?.n ?? 0,
  };
}

/**
 * Pausa: nada é perdido, as mensagens ficam aprovadas esperando.
 * `parar` cancela o que ainda não saiu — o que já foi, já foi.
 */
export async function pausar(campanhaId: string) {
  const agora = new Date();
  await db
    .update(campanhas)
    .set({ status: "pausada", atualizadoEm: agora })
    .where(eq(campanhas.id, campanhaId));
  await registrar("campanha.pausada", "Campanha pausada", { campanhaId });
  return { ok: true as const };
}

export async function parar(campanhaId: string) {
  const agora = new Date();

  const canceladas = await db
    .update(mensagens)
    .set({ status: "cancelada", erro: "Campanha encerrada", atualizadoEm: agora })
    .where(
      and(
        eq(mensagens.campanhaId, campanhaId),
        inArray(mensagens.status, ["rascunho", "aprovada", "na-fila"]),
      ),
    )
    .returning({ id: mensagens.id });

  await db
    .update(campanhas)
    .set({ status: "concluida", concluidaEm: agora, atualizadoEm: agora })
    .where(eq(campanhas.id, campanhaId));

  await registrar(
    "campanha.encerrada",
    `${canceladas.length} contato(s) pendente(s) cancelado(s)`,
    { campanhaId },
  );

  return { ok: true as const, canceladas: canceladas.length };
}

/** Campanhas com progresso, para a tela. */
export async function listarComProgresso() {
  const lista = await db.select().from(campanhas).orderBy(sql`${campanhas.criadoEm} desc`);
  return Promise.all(
    lista.map(async (c) => ({ ...c, progresso: await progresso(c.id) })),
  );
}

/** Ordena leads pela pontuação — melhores primeiro. */
export function ordenarPorPontuacao(lista: Lead[]): Lead[] {
  return [...lista].sort((a, b) => pontuar(b).total - pontuar(a).total);
}
