import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, geracaoFila, mensagens, leads, eventos, type Lead } from "@/lib/db";
import { lerConfig, podeContatar } from "@/lib/fila";
import { pontuar } from "@/lib/pontuacao";
import { gerarMensagemProspeccao } from "@/lib/gen/mensagem-prospeccao";
import { montarMensagemUniversal } from "@/lib/mensagem-universal";

/**
 * O motor da fila de geração por IA.
 *
 * REGRA QUE ORGANIZA TUDO AQUI: gerar, aprovar e enviar são três etapas
 * separadas, e este arquivo faz só a PRIMEIRA. Nada neste módulo fala com o
 * WhatsApp, com a bridge ou com provedor nenhum. O produto final de uma
 * geração bem-sucedida é uma linha em `mensagens` com status `rascunho` — o
 * estado mais inofensivo que existe: fora da fila de envio, esperando você
 * aprovar. Se este módulo inteiro rodar desgovernado, o estrago máximo é
 * rascunho demais no banco.
 *
 * NÃO EXISTE FALLBACK PARA O MOTOR ANTIGO. Se a IA falhar, o item fica
 * `pendente` (cota) ou `erro` (falha real) e o lead continua disponível para
 * a próxima campanha. O motor determinístico escreve sobre SITE, que é
 * exatamente o que estas campanhas não querem oferecer — cair nele em
 * silêncio seria mandar a mensagem errada achando que mandou a certa.
 */

/** Falhas REAIS toleradas antes de desistir do item. É o freio do retry. */
export const MAX_TENTATIVAS = 3;

/** Item reservado há mais que isto = processo morreu. Volta para a fila. */
export const PRESO_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Respiro entre duas chamadas ao Gemini, no mesmo processo.
 *
 * O free tier limita por MINUTO, e gerar é uma chamada por lead em sequência.
 * Sem espaçar, um lote rápido gasta o minuto inteiro nos primeiros itens e o
 * resto volta 429 — não porque a cota do dia acabou, mas porque foi tudo
 * junto. 4s dá ~15 por minuto, abaixo de qualquer limite por minuto do free.
 */
const INTERVALO_MS = Number(process.env.GERACAO_INTERVALO_MS ?? 4000);

/** Teto do backoff de cota. Além disto, esperar mais não ajuda em nada. */
const ESPERA_MAX_MS = 30 * 60 * 1000;

/** 1min, 2min, 4min... até 30min. Cresce porque cota não volta em segundos. */
function atrasoPorCota(esperas: number): number {
  return Math.min(60_000 * 2 ** Math.min(esperas, 10), ESPERA_MAX_MS);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Erro de cota/rate limit — o relógio, não o lead. */
function ehCota(msg: string): boolean {
  return /cota|quota|rate.?limit|429|resource_exhausted/i.test(msg);
}

/**
 * Coloca os leads na fila da campanha.
 *
 * `onConflictDoNothing` no índice (campanha, lead) é o que torna enfileirar
 * IDEMPOTENTE: chamar duas vezes com a mesma lista não duplica nada, não
 * ressuscita item já `pronta` e não zera contador de item em andamento.
 * Iniciar a mesma campanha duas vezes vira um no-op, sem checagem no código.
 */
export async function enfileirar(campanhaId: string, alvos: Lead[]) {
  if (!alvos.length) return { enfileirados: 0 };

  const linhas = await db
    .insert(geracaoFila)
    .values(
      alvos.map((lead) => ({
        campanhaId,
        leadId: lead.id,
        prioridade: pontuar(lead).total,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: geracaoFila.id });

  return { enfileirados: linhas.length };
}

/**
 * Devolve para a fila os itens presos em `processando`.
 *
 * Um item só fica preso de um jeito: o processo que o reservou morreu antes
 * de terminar (deploy no meio, timeout da função, máquina desligada). Sem
 * isto o lead ficaria parado para sempre num estado que ninguém revisita —
 * perdido de um jeito silencioso, que é o pior.
 *
 * Roda no começo de todo lote, de graça: é um UPDATE só.
 */
export async function recuperarPresos(): Promise<number> {
  const corte = sql`now() - make_interval(secs => ${PRESO_TIMEOUT_MS / 1000})`;

  const voltaram = await db
    .update(geracaoFila)
    .set({
      status: "pendente",
      processandoDesde: null,
      erro: "Processo interrompido no meio da geração — item recuperado.",
      atualizadoEm: new Date(),
    })
    .where(
      and(
        eq(geracaoFila.status, "processando"),
        or(isNull(geracaoFila.processandoDesde), lt(geracaoFila.processandoDesde, corte)),
      ),
    )
    .returning({ id: geracaoFila.id });

  return voltaram.length;
}

/**
 * Reserva UM item para este processo, atomicamente.
 *
 * Mesma trava que a fila de envio já usa: UPDATE condicional + `.returning()`.
 * Um UPDATE com WHERE é atômico por linha no Postgres, então dois workers que
 * tentarem o mesmo item são serializados pelo banco e o segundo encontra o
 * WHERE já falso (o status não é mais `pendente`) — volta zero linha, que é o
 * "perdi a corrida". Sem transação, sem lock explícito, sem SQL cru.
 *
 * O laço existe porque o candidato pode ser roubado entre o SELECT e o
 * UPDATE; nesse caso tenta o próximo. É limitado, não gira para sempre.
 */
export async function reservarItem(opcoes: { campanhaId?: string } = {}) {
  /**
   * Todo tempo aqui é do BANCO (`now()`), nunca `new Date()` do Node.
   *
   * Não é preciosismo: medido nesta máquina, o relógio do Neon está ~1,7s à
   * frente do local. Como a linha nasce com `proxima_tentativa_em = now()` do
   * servidor, comparar contra o relógio do Node fazia toda campanha recém
   * criada parecer agendada para o futuro — a primeira drenagem reservava
   * ZERO itens e a fila parecia travada logo depois de criada. Os dois lados
   * da comparação têm que sair do mesmo relógio.
   */
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const candidatos = await db
      .select({ id: geracaoFila.id })
      .from(geracaoFila)
      .where(
        and(
          eq(geracaoFila.status, "pendente"),
          lte(geracaoFila.proximaTentativaEm, sql`now()`),
          opcoes.campanhaId ? eq(geracaoFila.campanhaId, opcoes.campanhaId) : undefined,
        ),
      )
      .orderBy(desc(geracaoFila.prioridade), asc(geracaoFila.criadoEm))
      .limit(5);

    if (!candidatos.length) return null;

    for (const c of candidatos) {
      const [reservado] = await db
        .update(geracaoFila)
        .set({ status: "processando", processandoDesde: sql`now()`, atualizadoEm: sql`now()` })
        .where(and(eq(geracaoFila.id, c.id), eq(geracaoFila.status, "pendente")))
        .returning();

      if (reservado) return reservado;
    }
  }

  return null;
}

export type ResultadoItem =
  | { fim: "pronta"; leadId: string; solucao: string }
  | { fim: "pulada"; leadId: string; motivo: string }
  | { fim: "erro"; leadId: string; motivo: string }
  | { fim: "adiada"; leadId: string; motivo: string };

/**
 * Escritor alternativo da mensagem. Em produção NUNCA é passado.
 *
 * Sem ele, a primeira abordagem é a copy universal — determinística, sem IA e
 * sem cota. Com ele, os testes conseguem provocar 429, timeout e JSON quebrado
 * para verificar que o backoff, o retry e a retenção de lead continuam
 * inteiros; de outro jeito só dava para testar esses caminhos esperando a cota
 * estourar sozinha, que é justamente o que não se controla.
 *
 * Note que essa maquinaria de cota ficou DORMENTE para a primeira mensagem:
 * ela existe e está testada, mas nenhum caminho de produção a exercita hoje.
 * Fica de pé porque a IA volta a escrever quando houver contexto — depois da
 * resposta do lead.
 */
export type Gerador = typeof gerarMensagemProspeccao;

/**
 * Gera a mensagem de UM item já reservado.
 *
 * Idempotente de verdade: se aquele lead já tem mensagem NESTA campanha, o
 * item fecha como `pronta` apontando para a mensagem que já existe, e o
 * Gemini nem é chamado. É o que garante que mensagem pronta nunca é
 * regenerada — nem por lote repetido, nem por recuperação de item preso, nem
 * por dois workers subindo ao mesmo tempo.
 */
export async function processarItem(
  item: typeof geracaoFila.$inferSelect,
  gerar?: Gerador,
): Promise<ResultadoItem> {
  /**
   * Rede de segurança em volta de TUDO que acontece depois da reserva.
   *
   * O item já está em `processando` quando esta função começa. Qualquer erro
   * daqui em diante que escape sem tratar deixa ele preso nesse estado — e
   * `processando` é o único estado que ninguém revisita: `reservarItem` só
   * olha `pendente`, e `recuperarPresos` só age depois de 5 minutos. Uma
   * falha de rede ao ler a config (que acontece, o banco é HTTP) custava
   * cinco minutos de lead parado.
   *
   * O `catch` principal lá embaixo cobre a geração em si. Este cobre o resto:
   * as leituras de lead, config e campanha, que ficam fora dele.
   */
  try {
    return await gerarItem(item, gerar);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro inesperado";
    await db
      .update(geracaoFila)
      .set({
        status: "pendente",
        processandoDesde: null,
        erro: `Falha inesperada, item devolvido à fila: ${motivo}`,
        atualizadoEm: new Date(),
      })
      .where(eq(geracaoFila.id, item.id));
    return { fim: "adiada", leadId: item.leadId, motivo };
  }
}

async function gerarItem(
  item: typeof geracaoFila.$inferSelect,
  gerar?: Gerador,
): Promise<ResultadoItem> {
  const agora = new Date();

  const [jaTem] = await db
    .select({ id: mensagens.id, produto: mensagens.produto })
    .from(mensagens)
    .where(and(eq(mensagens.campanhaId, item.campanhaId), eq(mensagens.leadId, item.leadId)))
    .limit(1);

  if (jaTem) {
    await db
      .update(geracaoFila)
      .set({
        status: "pronta",
        mensagemId: jaTem.id,
        solucao: jaTem.produto,
        processandoDesde: null,
        atualizadoEm: agora,
      })
      .where(eq(geracaoFila.id, item.id));
    return { fim: "pronta", leadId: item.leadId, solucao: jaTem.produto ?? "" };
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, item.leadId)).limit(1);
  if (!lead) return fecharPulado(item, "Lead não existe mais.");

  const cfg = await lerConfig();
  // Mesma regra da tela: quem nao entraria na campanha nao vira mensagem.
  const check = await podeContatar(lead, cfg, { paraNovaCampanha: true });
  if (!check.pode) return fecharPulado(item, check.motivo);

  try {
    /**
     * PRIMEIRA ABORDAGEM É DETERMINÍSTICA — o Gemini não é chamado aqui.
     *
     * Antes, cada lead ia para a IA escolher produto e escrever um argumento
     * próprio. O problema não era técnico: na primeira mensagem não existe
     * contexto real do negócio, então o "argumento personalizado" era palpite
     * a partir do ramo, escrito com a confiança de quem constatou algo.
     *
     * A inteligência comercial continua inteira e entra DEPOIS da resposta,
     * quando há o que analisar (ver lib/proxima-acao, lib/diagnostico,
     * lib/objecoes). Aqui vai a mesma copy para todos, com o nome da empresa.
     *
     * Efeito colateral bem-vindo: gerar campanha deixou de consumir cota. Um
     * lote de 30 leads passou de 30 chamadas de IA para zero, e parou de
     * depender de 429, retry e backoff para simplesmente existir.
     *
     * O parâmetro `gerar` continua na assinatura porque os testes de
     * concorrência da fila o injetam — mas nenhum caminho de produção o usa
     * para a primeira mensagem.
     */
    const analise = gerar
      ? await gerar(lead, {})
      : {
      mensagem: montarMensagemUniversal(lead),
      /**
       * Sem produto e sem oportunidade: a primeira mensagem não escolhe o que
       * vender. Gravar um palpite aqui faria a revisão exibir uma decisão
       * comercial que ninguém tomou.
       */
      solucao: null as string | null,
      oportunidade: null as string | null,
    };

    /**
     * `ON CONFLICT DO NOTHING`, apoiado no índice único parcial
     * `mensagens_viva_por_lead_idx` — uma mensagem VIVA (rascunho, aprovada
     * ou na-fila) por (campanha, lead).
     *
     * POR QUE PRECISA DE ÍNDICE, E NÃO SÓ DE UMA CHECAGEM
     *
     * A versão anterior fazia `INSERT ... WHERE NOT EXISTS` achando que um
     * statement único bastava. Não basta: em READ COMMITTED os dois processos
     * avaliam o NOT EXISTS antes de qualquer um comitar, e os dois inserem.
     * O teste de concorrência pegou isso em 2 de 4 execuções — duas mensagens
     * para a mesma pessoa, que na ponta são dois WhatsApp para o mesmo número.
     * Só uma restrição no banco resolve de verdade.
     *
     * O índice é PARCIAL de propósito. Um único total em (campanha_id,
     * lead_id) recusaria dado real e legítimo: há uma campanha antiga com 6
     * mensagens `respondida` do mesmo lead, que é uma conversa, não uma
     * duplicata. Restringir aos estados vivos protege exatamente o que precisa
     * ser protegido — a fila de saída — sem tocar no histórico.
     *
     * O caminho que dispara isto é real, não teórico: uma chamada de IA lenta
     * passa dos 5 minutos, `recuperarPresos` devolve o item para a fila
     * achando que o processo morreu, outro worker gera e salva, e então o
     * primeiro processo (que estava só lento, não morto) volta e tenta
     * inserir a sua versão.
     */
    const gravado = await db.execute(sql`
      INSERT INTO mensagens (lead_id, campanha_id, texto, produto, origem, status, rodada, prioridade)
      VALUES (${lead.id}::uuid, ${item.campanhaId}::uuid, ${analise.mensagem}, ${analise.solucao},
              'ia', 'rascunho', 0, ${item.prioridade})
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const linhas = (Array.isArray(gravado) ? gravado : gravado.rows) as { id: string }[];

    /**
     * Zero linhas = outro processo gerou este lead enquanto este aqui
     * escrevia. A mensagem dele vale tanto quanto a minha; o item aponta para
     * a que já está lá e a minha simplesmente não existe. Nada a desfazer.
     */
    const mensagemId =
      linhas[0]?.id ??
      (
        await db
          .select({ id: mensagens.id })
          .from(mensagens)
          .where(
            and(eq(mensagens.campanhaId, item.campanhaId), eq(mensagens.leadId, lead.id)),
          )
          .limit(1)
      )[0]?.id;

    await db
      .update(geracaoFila)
      .set({
        status: "pronta",
        mensagemId,
        solucao: analise.solucao,
        // O "porquê" da escolha, para a revisão não ser leitura de texto solto.
        oportunidade: analise.oportunidade,
        erro: null,
        processandoDesde: null,
        atualizadoEm: new Date(),
      })
      .where(eq(geracaoFila.id, item.id));

    // Vazio: a primeira abordagem não escolhe solução. Ver a nota acima.
    return { fim: "pronta", leadId: lead.id, solucao: analise.solucao ?? "" };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro desconhecido";

    /**
     * Cota NÃO é falha do lead: adia sem queimar tentativa e sem virar erro.
     * O item volta para `pendente` com hora marcada e é gerado quando a cota
     * voltar. É isto que cumpre "nunca perder lead por falta de cota".
     */
    if (ehCota(motivo)) {
      const esperas = item.esperas + 1;
      await db
        .update(geracaoFila)
        .set({
          status: "pendente",
          esperas,
          proximaTentativaEm: sql`now() + make_interval(secs => ${atrasoPorCota(item.esperas) / 1000})`,
          erro: `Aguardando cota do Gemini: ${motivo}`,
          processandoDesde: null,
          atualizadoEm: new Date(),
        })
        .where(eq(geracaoFila.id, item.id));
      return { fim: "adiada", leadId: lead.id, motivo };
    }

    // Falha real: conta tentativa e desiste no teto. Aqui o retry termina.
    const tentativas = item.tentativas + 1;
    const desistiu = tentativas >= MAX_TENTATIVAS;
    await db
      .update(geracaoFila)
      .set({
        status: desistiu ? "erro" : "pendente",
        tentativas,
        proximaTentativaEm: sql`now() + make_interval(secs => 30)`,
        erro: motivo,
        processandoDesde: null,
        atualizadoEm: new Date(),
      })
      .where(eq(geracaoFila.id, item.id));

    return desistiu
      ? { fim: "erro", leadId: lead.id, motivo }
      : { fim: "adiada", leadId: lead.id, motivo };
  }
}

async function fecharPulado(
  item: typeof geracaoFila.$inferSelect,
  motivo: string,
): Promise<ResultadoItem> {
  await db
    .update(geracaoFila)
    .set({ status: "pulada", erro: motivo, processandoDesde: null, atualizadoEm: new Date() })
    .where(eq(geracaoFila.id, item.id));
  return { fim: "pulada", leadId: item.leadId, motivo };
}

/**
 * Manda a IA escrever de novo para UM lead.
 *
 * Não gera na hora, de propósito: devolve o item para a mesma fila que todo o
 * resto usa. Gerar direto aqui seria um segundo caminho de geração, com outra
 * contagem de cota e outro tratamento de 429 — exatamente o tipo de atalho que
 * depois manda mensagem duplicada.
 *
 * A mensagem antiga é CANCELADA, não apagada: ela já foi mostrada na revisão,
 * e histórico de campanha não some porque alguém pediu outra versão. Cancelar
 * também é o que libera o índice único de mensagem viva para a nova entrar.
 *
 * Recusa mexer em mensagem que você editou à mão (`origem: manual`) — refazer
 * por cima seria jogar fora seu texto sem avisar.
 */
export async function regenerar(
  mensagemId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const [msg] = await db.select().from(mensagens).where(eq(mensagens.id, mensagemId)).limit(1);
  if (!msg) return { ok: false, erro: "Mensagem não encontrada." };
  if (!msg.campanhaId) return { ok: false, erro: "Mensagem fora de campanha." };
  if (msg.status !== "rascunho") {
    return { ok: false, erro: "Só dá para regenerar enquanto está em rascunho." };
  }
  if (msg.origem === "manual") {
    return { ok: false, erro: "Esta mensagem foi editada à mão — regenerar apagaria seu texto." };
  }

  const agora = new Date();
  await db
    .update(mensagens)
    .set({ status: "cancelada", erro: "Substituída por nova geração", atualizadoEm: agora })
    .where(eq(mensagens.id, mensagemId));

  /**
   * Devolve o item da fila para `pendente` e zera os contadores: é um pedido
   * novo, não a continuação das tentativas do anterior.
   */
  const [item] = await db
    .update(geracaoFila)
    .set({
      status: "pendente",
      mensagemId: null,
      erro: null,
      tentativas: 0,
      esperas: 0,
      processandoDesde: null,
      proximaTentativaEm: sql`now()`,
      atualizadoEm: agora,
    })
    .where(
      and(eq(geracaoFila.campanhaId, msg.campanhaId), eq(geracaoFila.leadId, msg.leadId)),
    )
    .returning({ id: geracaoFila.id });

  // Campanha antiga, anterior à fila persistente: recria o item.
  if (!item) {
    await db
      .insert(geracaoFila)
      .values({
        campanhaId: msg.campanhaId,
        leadId: msg.leadId,
        prioridade: msg.prioridade,
      })
      .onConflictDoNothing();
  }

  return { ok: true };
}

export type ResumoLote = {
  geradas: number;
  puladas: number;
  erros: number;
  adiadas: number;
  /** Bateu na cota: quem chama deve PARAR de pedir lote agora. */
  pausadoPorCota: boolean;
  recuperados: number;
  restantes: number;
};

/**
 * Drena a fila até acabar o orçamento. É o único ponto de entrada do trabalho.
 *
 * Chamado por três lugares, todos passando pelo mesmo código: o serviço local
 * (que roda 24/7 e é o dono do ritmo), o cron da Vercel (rede de segurança) e
 * a tela de disparos (aceleração enquanto você está olhando). Nenhum dos três
 * é obrigatório para a fila andar — é justamente esse o ponto.
 *
 * Três freios, todos necessários:
 *  - `max`: teto de itens por chamada.
 *  - `orcamentoMs`: teto de tempo, porque função serverless morre no meio.
 *  - cota: na primeira 429 o lote ENCERRA. Insistir seria gastar o orçamento
 *    para receber o mesmo "não" — e como item adiado volta para `pendente`,
 *    um laço que ignorasse isto nunca veria `restantes` zerar.
 */
export async function processarLote(
  opcoes: { max?: number; campanhaId?: string; orcamentoMs?: number; gerar?: Gerador } = {},
): Promise<ResumoLote> {
  const max = opcoes.max ?? 5;
  const orcamentoMs = opcoes.orcamentoMs ?? 60_000;
  const limite = Date.now() + orcamentoMs;

  const recuperados = await recuperarPresos();
  const r: ResumoLote = {
    geradas: 0,
    puladas: 0,
    erros: 0,
    adiadas: 0,
    pausadoPorCota: false,
    recuperados,
    restantes: 0,
  };

  for (let i = 0; i < max; i++) {
    if (Date.now() >= limite) break;

    const item = await reservarItem({ campanhaId: opcoes.campanhaId });
    if (!item) break;

    if (i > 0) await dormir(INTERVALO_MS);

    const res = await processarItem(item, opcoes.gerar);
    if (res.fim === "pronta") r.geradas++;
    else if (res.fim === "pulada") r.puladas++;
    else if (res.fim === "erro") r.erros++;
    else {
      r.adiadas++;
      if (ehCota(res.motivo)) {
        r.pausadoPorCota = true;
        break;
      }
    }
  }

  r.restantes = await contarPendentes(opcoes.campanhaId);

  /**
   * Evento inserido aqui, e não via `registrar` de lib/campanha: aquele
   * módulo importa este, e importar de volta fecharia um ciclo — que em ESM
   * resolve como `undefined` na hora errada, dependendo de quem carregou
   * primeiro. Um insert direto custa a mesma linha e não tem esse risco.
   */
  if (r.geradas || r.erros || r.puladas) {
    await db.insert(eventos).values({
      tipo: "geracao.lote",
      descricao: `${r.geradas} gerada(s), ${r.puladas} pulada(s), ${r.erros} erro(s)`,
      campanhaId: opcoes.campanhaId,
    });
  }

  return r;
}

async function contarPendentes(campanhaId?: string): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(geracaoFila)
    .where(
      and(
        inArray(geracaoFila.status, ["pendente", "processando"]),
        campanhaId ? eq(geracaoFila.campanhaId, campanhaId) : undefined,
      ),
    );
  return linha?.n ?? 0;
}

export type EstadoGeracao = {
  total: number;
  pendente: number;
  processando: number;
  pronta: number;
  pulada: number;
  erro: number;
  /** Quando o próximo item adiado por cota volta a ser tentado. */
  proximaTentativaEm: string | null;
  /** Motivos de quem não entrou — o que a tela precisa mostrar sem mentir. */
  problemas: { motivo: string; quantos: number }[];
};

/** Estado da fila para a tela, sem processar nada. */
export async function estadoGeracao(campanhaId?: string): Promise<EstadoGeracao> {
  const linhas = await db
    .select({
      status: geracaoFila.status,
      erro: geracaoFila.erro,
      proxima: geracaoFila.proximaTentativaEm,
      esperas: geracaoFila.esperas,
    })
    .from(geracaoFila)
    .where(campanhaId ? eq(geracaoFila.campanhaId, campanhaId) : undefined);

  const conta = (s: string) => linhas.filter((l) => l.status === s).length;

  const agrupado = new Map<string, number>();
  for (const l of linhas) {
    if ((l.status === "pulada" || l.status === "erro") && l.erro) {
      agrupado.set(l.erro, (agrupado.get(l.erro) ?? 0) + 1);
    }
  }

  /**
   * Só conta como "esperando cota" quem foi ADIADO de propósito (`esperas`).
   * Item recém-criado também tem `proximaTentativaEm` tecnicamente à frente do
   * relógio local por causa da diferença entre os dois relógios — sem este
   * filtro, campanha nova aparecia na tela como se estivesse esperando cota.
   */
  const agora = Date.now();
  const esperando = linhas
    .filter((l) => l.status === "pendente" && l.esperas > 0 && l.proxima?.getTime() > agora)
    .map((l) => l.proxima!.getTime());

  return {
    total: linhas.length,
    pendente: conta("pendente"),
    processando: conta("processando"),
    pronta: conta("pronta"),
    pulada: conta("pulada"),
    erro: conta("erro"),
    proximaTentativaEm: esperando.length ? new Date(Math.min(...esperando)).toISOString() : null,
    problemas: [...agrupado.entries()]
      .map(([motivo, quantos]) => ({ motivo, quantos }))
      .sort((a, b) => b.quantos - a.quantos)
      .slice(0, 5),
  };
}
