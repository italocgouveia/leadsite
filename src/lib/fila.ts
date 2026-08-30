import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, leads, mensagens, campanhas, configuracoes, conversas, type Lead } from "@/lib/db";
import { estadoIntegracao, lerConfigProvedor } from "@/lib/integracao";
import { provedorDe } from "@/lib/providers";
import { resolverSaudacao } from "@/lib/saudacao";

/** Separado para os testes conseguirem fixar a hora sem mexer no relógio. */
const agoraDoEnvio = () => new Date();

/**
 * Log estruturado da fila — uma linha JSON por evento, para dar resposta a
 * "quem chamou a fila, quando, e o que aconteceu" sem precisar reconstruir a
 * história a partir de conexão de rede e processo, como foi preciso da vez
 * que descobrimos a bridge chamando `/api/externo/fila` sozinha.
 *
 * Puro log — nunca decide nada, nunca muda o que a função devolve. Uma linha
 * por chamada de `enviarProxima`, correlacionada por `requestId`.
 */
function logFila(evento: string, dados: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), modulo: "fila", evento, ...dados }));
}

/**
 * Fila de envio de WhatsApp.
 *
 * Este arquivo existe para uma coisa: **impedir que o seu número seja banido**.
 *
 * API não-oficial de WhatsApp funciona automatizando o WhatsApp Web, e a Meta
 * bane número que dispara em volume para quem nunca falou com você. As travas
 * abaixo não são conforto de usuário, são o que mantém a operação viva:
 *
 *  1. um envio por vez, com intervalo — nada de rajada;
 *  2. teto diário — o volume é o que chama atenção;
 *  3. nunca dois contatos para o mesmo lead dentro da janela de recontato;
 *  4. lead que respondeu para de receber, para sempre;
 *  5. `naoContatar` é trava dura e vem antes de tudo.
 *
 * Por isso elas moram no SERVIDOR, checadas a cada envio. Se ficassem só na
 * tela, um clique errado atropelaria todas.
 */

export type Config = {
  automacaoAtiva: boolean;
  provedorUrl: string | null;
  provedorToken: string | null;
  intervaloSegundos: number;
  limiteDiario: number;
  janelaRecontatoDias: number;
  horarioEnvioAtivo: boolean;
  horarioInicio: string;
  horarioFim: string;
  variacaoAleatoriaAtiva: boolean;
};

/** Piso de segurança. Abaixo disso o padrão de envio vira robô óbvio. */
const INTERVALO_MINIMO = 30;
const LIMITE_MAXIMO = 200;

/**
 * Depois de quanto tempo `na-fila` deixa de significar "alguém está enviando
 * isto agora" e passa a significar "o processo morreu no meio do envio".
 *
 * Os provedores (Evolution/WAHA/custom) têm timeout de 25s cada. 3 minutos dá
 * folga generosa para uma tentativa real terminar, mesmo com uma trava lenta
 * ou uma retentativa de rede — sem deixar a mensagem presa por horas se o
 * processo cair de verdade.
 */
const PROCESSANDO_TIMEOUT_MS = 3 * 60_000;

/**
 * Quantas vezes uma mensagem pode ser RECLAMADA como travada antes de o
 * sistema desistir e marcar erro sozinho.
 *
 * Sem este teto, uma mensagem cujo processo mata o worker toda vez (ex.: um
 * bug que trava sempre no mesmo envio) reclamaria para sempre, tentativa após
 * tentativa, sem nunca sair do estado "preso" — e sem nunca aparecer como
 * erro para você notar.
 */
const LIMITE_TENTATIVAS_PRESA = 5;

/**
 * Quantas vezes um envio pode falhar por motivo TEMPORÁRIO (rede, timeout,
 * erro 5xx do provedor) antes de desistir e virar `erro` — separado do teto
 * de mensagem presa acima porque aqui a mensagem nunca chega a ficar presa em
 * `na-fila`: ela volta para `aprovada` e tenta nas próximas chamadas normais
 * do worker, respeitando intervalo/teto do mesmo jeito que qualquer outra.
 * Falha PERMANENTE (ex.: número sem WhatsApp) nunca passa por aqui — vai
 * direto para `erro`, sem retry, porque tentar de novo não muda o resultado.
 */
const LIMITE_TENTATIVAS_ENVIO_TEMPORARIO = 3;

export async function lerConfig(): Promise<Config> {
  const [c] = await db.select().from(configuracoes).limit(1);
  return {
    automacaoAtiva: c?.automacaoAtiva ?? false,
    provedorUrl: c?.provedorUrl ?? null,
    provedorToken: c?.provedorToken ?? null,
    // Mesmo que alguém grave 5 no banco, o mínimo prevalece aqui.
    intervaloSegundos: Math.max(c?.intervaloSegundos ?? 90, INTERVALO_MINIMO),
    limiteDiario: Math.min(c?.limiteDiario ?? 30, LIMITE_MAXIMO),
    janelaRecontatoDias: c?.janelaRecontatoDias ?? 30,
    horarioEnvioAtivo: c?.horarioEnvioAtivo ?? false,
    horarioInicio: c?.horarioInicio ?? "08:00",
    horarioFim: c?.horarioFim ?? "20:00",
    variacaoAleatoriaAtiva: c?.variacaoAleatoriaAtiva ?? false,
  };
}

/**
 * Janela de horário permitido, em America/Sao_Paulo — fixo, não o fuso do
 * servidor (mesma razão de `horaEmSaoPaulo` em lib/saudacao.ts: a Vercel
 * roda em UTC, e sem fixar o fuso a janela "08:00–20:00" viraria outra coisa
 * lá). Não cruza meia-noite: início precisa ser antes do fim.
 */
export type StatusHorario =
  | { permitido: true }
  | { permitido: false; motivo: string; esperarSegundos: number };

function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h % 24) * 60 + (m || 0);
}

export function horarioPermitidoAgora(cfg: Config, agora: Date = new Date()): StatusHorario {
  if (!cfg.horarioEnvioAtivo) return { permitido: true };

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);

  // ICU às vezes devolve "24" para meia-noite em vez de "00" — trata os dois.
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const agoraMin = hora * 60 + minuto;

  const inicio = minutosDoDia(cfg.horarioInicio);
  const fim = minutosDoDia(cfg.horarioFim);

  if (agoraMin >= inicio && agoraMin < fim) return { permitido: true };

  const minutosAteInicio = agoraMin < inicio ? inicio - agoraMin : 24 * 60 - agoraMin + inicio;

  return {
    permitido: false,
    motivo: `Fora do horário permitido (${cfg.horarioInicio}–${cfg.horarioFim}).`,
    esperarSegundos: minutosAteInicio * 60,
  };
}

export function inicioDoDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Quantas já saíram hoje. Conta enviada, entregue e respondida. */
export async function enviadasHoje(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(and(isNotNull(mensagens.enviadaEm), gte(mensagens.enviadaEm, inicioDoDia())));
  return r?.n ?? 0;
}

/** Quando saiu a última — define se já dá para mandar a próxima. */
export async function ultimoEnvio(): Promise<Date | null> {
  const [r] = await db
    .select({ em: mensagens.enviadaEm })
    .from(mensagens)
    .where(isNotNull(mensagens.enviadaEm))
    .orderBy(desc(mensagens.enviadaEm))
    .limit(1);
  return r?.em ?? null;
}

export type Bloqueio =
  | { pode: true }
  | { pode: false; motivo: string; esperarSegundos?: number };

/**
 * Pode mandar AGORA? Checa as travas globais, na ordem de custo.
 */
export async function podeEnviarAgora(cfg: Config): Promise<Bloqueio> {
  if (!cfg.automacaoAtiva) {
    return { pode: false, motivo: "Automação pausada." };
  }

  const horario = horarioPermitidoAgora(cfg);
  if (!horario.permitido) {
    return { pode: false, motivo: horario.motivo, esperarSegundos: horario.esperarSegundos };
  }

  /**
   * Terceira camada de validação: antes de CADA envio.
   *
   * As outras duas (salvar e iniciar campanha) não bastam — a configuração
   * pode ser alterada com a fila já rodando, e aí o worker mandaria para um
   * endereço quebrado sem ninguém perceber.
   */
  const integracao = await estadoIntegracao();
  if (!integracao.pronta) {
    const falta = integracao.pendencias.filter((p) => !p.feito).map((p) => p.item);
    return {
      pode: false,
      motivo:
        integracao.erro ??
        `WhatsApp não configurado. Falta: ${falta.join(", ")}.`,
    };
  }

  const hoje = await enviadasHoje();
  if (hoje >= cfg.limiteDiario) {
    return {
      pode: false,
      motivo: `Teto diário atingido (${hoje}/${cfg.limiteDiario}). Continua amanhã.`,
    };
  }

  const ultimo = await ultimoEnvio();
  if (ultimo) {
    const passou = (Date.now() - ultimo.getTime()) / 1000;
    if (passou < cfg.intervaloSegundos) {
      return {
        pode: false,
        motivo: "Aguardando o intervalo entre envios.",
        esperarSegundos: Math.ceil(cfg.intervaloSegundos - passou),
      };
    }
  }

  return { pode: true };
}

/**
 * Este lead PODE receber contato?
 *
 * Separado da checagem global porque as respostas são diferentes: aqui o "não"
 * é definitivo para aquele lead, lá é "espere".
 */
export async function podeContatar(
  lead: Lead,
  cfg: Config,
  /**
   * Mensagem a ignorar na checagem — a que está sendo avaliada para envio.
   *
   * Sem isto a fila trava em si mesma: a regra "já tem mensagem aguardando"
   * enxergaria a PRÓPRIA mensagem que vai sair e recusaria o lead. Efeito
   * medido: `proximaDaFila` devolvia `null` sempre, e nenhum envio acontecia.
   */
  ignorarMensagemId?: string,
): Promise<Bloqueio> {
  const historico = await db
    .select({ id: mensagens.id, status: mensagens.status, enviadaEm: mensagens.enviadaEm })
    .from(mensagens)
    .where(eq(mensagens.leadId, lead.id));

  return avaliarContato(lead, cfg, historico, ignorarMensagemId);
}

/** O histórico de mensagens de um lead, no mínimo que as regras precisam. */
export type HistoricoLead = {
  id: string;
  status: string;
  enviadaEm: Date | null;
}[];

/**
 * As regras de "este lead pode receber contato?", sem tocar no banco.
 *
 * Existe separada porque a mesma pergunta é feita em dois ritmos: a fila
 * pergunta por UM lead na hora do envio, e o disparo em massa pergunta pela
 * base inteira de uma vez. Com a consulta embutida, avaliar 280 leads eram 280
 * viagens ao banco — e a alternativa, reescrever as regras no outro arquivo,
 * é pior: duas cópias divergem, e a que divergir em silêncio é a que manda
 * mensagem para quem pediu para não receber.
 */
export function avaliarContato(
  lead: Lead,
  cfg: Config,
  todas: HistoricoLead,
  ignorarMensagemId?: string,
): Bloqueio {
  if (lead.naoContatar) {
    return { pode: false, motivo: "Lead marcado como não contatar." };
  }
  if (!lead.whatsapp) {
    return { pode: false, motivo: "Lead sem WhatsApp." };
  }

  const historico = ignorarMensagemId
    ? todas.filter((m) => m.id !== ignorarMensagemId)
    : todas;

  // Respondeu uma vez = nunca mais entra em automação. A conversa virou humana.
  if (historico.some((m) => m.status === "respondida")) {
    return { pode: false, motivo: "Já respondeu — a conversa agora é sua, não da fila." };
  }

  const corte = new Date(Date.now() - cfg.janelaRecontatoDias * 86_400_000);
  const recente = historico.find(
    (m) => m.enviadaEm && m.enviadaEm > corte,
  );
  if (recente) {
    return {
      pode: false,
      motivo: `Já foi contatado nos últimos ${cfg.janelaRecontatoDias} dias.`,
    };
  }

  // Já existe algo aguardando envio: não empilha duas para o mesmo lead.
  if (historico.some((m) => m.status === "na-fila" || m.status === "aprovada")) {
    return { pode: false, motivo: "Já tem mensagem aguardando envio." };
  }

  return { pode: true };
}

/**
 * Escopo opcional de busca. Existe só para os TESTES de concorrência: sem
 * isto, provar isolamento contra a campanha real dependia inteiramente de
 * criar candidatas descartáveis suficientes para nenhuma chamada "vazar"
 * para dados de verdade — funciona, mas é garantia por quantidade, não por
 * estrutura. Com `apenasCampanhaId`, a cláusula SQL nem inclui outras
 * campanhas na consulta: é impossível a busca alcançar a fila real, não
 * apenas improvável. Produção nunca passa isto — sem o parâmetro, o
 * comportamento é idêntico ao de antes.
 */
export type OpcoesFila = { apenasCampanhaId?: string };

/**
 * Próxima da fila: a mais antiga aprovada, cujo lead ainda pode receber.
 *
 * Revalida `podeContatar` no momento do envio, não na hora de entrar na fila.
 * Entre aprovar e disparar podem passar horas — e nesse meio-tempo o lead pode
 * ter respondido ou pedido para não ser mais contatado.
 *
 * Só PREVIEW: não reserva nada. Achar a candidata e reservá-la são passos
 * separados de propósito (ver `reservarMensagem`) — se fosse um passo só,
 * chamar esta função duas vezes seguidas (como os testes fazem, e como o
 * disparo em lote faz para revisar antes de aprovar) já mudaria o estado só
 * de olhar.
 */
export async function proximaDaFila(cfg: Config, opcoes?: OpcoesFila) {
  /**
   * Ordem: prioridade primeiro, `criadoEm` só como desempate.
   *
   * Era só `criadoEm`, e isso não ordenava nada num disparo em lote — todas
   * as linhas do mesmo INSERT carregam o mesmo instante. Quem saía primeiro
   * era o que o banco devolvesse primeiro.
   *
   * O limite de 20 continua: as candidatas são revalidadas uma a uma logo
   * abaixo, e trazer a fila inteira só para descartar 130 seria desperdício.
   * Como a ordenação acontece no BANCO, as 20 que chegam já são as 20 mais
   * quentes — não uma amostra qualquer que depois se ordena em memória.
   *
   * `na-fila` só entra aqui quando está PRESA (reservada há mais tempo que
   * `PROCESSANDO_TIMEOUT_MS`, ou nunca teve `processandoDesde` gravado — dado
   * de antes desta coluna existir). Uma reserva FRESCA de outro processo fica
   * de fora de propósito: é assim que dois processadores rodando ao mesmo
   * tempo naturalmente disputam mensagens DIFERENTES em vez de brigar pela
   * mesma — a garantia de verdade contra a mesma mensagem sair duas vezes é o
   * UPDATE condicional de `reservarMensagem`, isto aqui só evita a corrida óbvia.
   */
  const corteTravada = new Date(Date.now() - PROCESSANDO_TIMEOUT_MS);
  const condicaoStatus = or(
    eq(mensagens.status, "aprovada"),
    and(
      eq(mensagens.status, "na-fila"),
      or(isNull(mensagens.processandoDesde), lt(mensagens.processandoDesde, corteTravada)),
    ),
  );
  const candidatas = await db
    .select()
    .from(mensagens)
    .where(
      opcoes?.apenasCampanhaId
        ? and(condicaoStatus, eq(mensagens.campanhaId, opcoes.apenasCampanhaId))
        : condicaoStatus,
    )
    .orderBy(desc(mensagens.prioridade), mensagens.criadoEm)
    .limit(20);

  for (const m of candidatas) {
    /**
     * Mensagem travada (chegou aqui com status `na-fila`) que já reclamou
     * demais: desiste e marca erro, em vez de reclamar para sempre.
     */
    if (m.status === "na-fila" && m.tentativas >= LIMITE_TENTATIVAS_PRESA) {
      await db
        .update(mensagens)
        .set({
          status: "erro",
          erro: `Presa em processamento por ${m.tentativas} tentativas — o processo anterior provavelmente caiu no meio do envio.`,
          atualizadoEm: new Date(),
        })
        .where(eq(mensagens.id, m.id));
      continue;
    }

    /**
     * Campanha pausada não entrega, e isso é checado AQUI e não na tela.
     * "Pausar" que só esconde o botão é pausa de mentira: bastaria outra aba
     * aberta com o laço rodando para os envios continuarem.
     *
     * Mensagem sem campanha (avulsa, criada direto na automação) passa.
     */
    if (m.campanhaId) {
      const [c] = await db
        .select({ status: campanhas.status })
        .from(campanhas)
        .where(eq(campanhas.id, m.campanhaId))
        .limit(1);
      if (c && c.status !== "rodando") continue;
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, m.leadId)).limit(1);
    if (!lead) continue;

    // Ignora a própria mensagem: ela é a candidata, não um bloqueio.
    const check = await podeContatar(lead, cfg, m.id);
    if (check.pode) return { mensagem: m, lead };

    // Não some em silêncio: cancela com o motivo, para aparecer no painel.
    await db
      .update(mensagens)
      .set({ status: "cancelada", erro: check.motivo, atualizadoEm: new Date() })
      .where(eq(mensagens.id, m.id));
  }

  return null;
}

/**
 * Reserva uma mensagem para ESTE processo, atomicamente.
 *
 * O coração da trava de concorrência: um único UPDATE condicional, que só
 * afeta a linha se ela ainda estiver no estado esperado. Não precisa de
 * transação nem de `SELECT ... FOR UPDATE` — um UPDATE com WHERE já é atômico
 * por linha no Postgres: se dois processos tentarem isto ao mesmo tempo para
 * a MESMA mensagem, o banco serializa as duas escritas, e a segunda a chegar
 * encontra o WHERE já falso (o status não é mais `aprovada`) e não afeta
 * nenhuma linha. `.returning()` vazio é exatamente esse "perdi a corrida".
 *
 * Aceita reservar tanto `aprovada` (caminho normal) quanto `na-fila` PRESA há
 * mais que `PROCESSANDO_TIMEOUT_MS` (recuperação de um processo que morreu no
 * meio do envio anterior) — mesma trava, mesmo UPDATE.
 */
export async function reservarMensagem(mensagemId: string): Promise<boolean> {
  const corteTravada = new Date(Date.now() - PROCESSANDO_TIMEOUT_MS);
  const agora = new Date();

  const linhas = await db
    .update(mensagens)
    .set({
      status: "na-fila",
      processandoDesde: agora,
      tentativas: sql`${mensagens.tentativas} + 1`,
      atualizadoEm: agora,
    })
    .where(
      and(
        eq(mensagens.id, mensagemId),
        or(
          eq(mensagens.status, "aprovada"),
          and(
            eq(mensagens.status, "na-fila"),
            or(isNull(mensagens.processandoDesde), lt(mensagens.processandoDesde, corteTravada)),
          ),
        ),
      ),
    )
    .returning({ id: mensagens.id });

  return linhas.length > 0;
}

/** Número no formato que os provedores esperam: só dígitos, com 55. */
export function numeroDoLead(lead: Lead): string | null {
  const m = lead.whatsapp?.match(/wa\.me\/(\d+)/);
  return m?.[1] ?? null;
}

export type ResultadoDaVez = {
  enviada: boolean;
  motivo?: string;
  lead?: string;
  proximaEm?: number;
  esperarSegundos?: number;
};

/**
 * Manda UMA mensagem da fila. É o coração do worker.
 *
 * Mora aqui, e não dentro de uma rota, porque duas portas diferentes chamam a
 * mesma coisa: a do painel (sessão do Google, aba aberta) e a externa (token,
 * serviço rodando sozinho). Se cada uma tivesse sua cópia, a que fosse
 * esquecida numa correção viraria a que dispara sem checar alguma trava.
 *
 * Uma por chamada, de propósito: um laço que manda tudo de uma vez é
 * exatamente o padrão que faz a Meta banir o número. Quem repete a chamada é
 * um agendador de fora — e cada chamada revalida TODAS as travas do zero.
 *
 * CONCORRÊNCIA: achar a candidata (`proximaDaFila`) e reservá-la
 * (`reservarMensagem`) são dois passos, e só o segundo é atômico. Isso
 * significa que, sob dois processos rodando ao mesmo tempo, o PRIMEIRO passo
 * pode devolver a mesma candidata para os dois — de propósito o laço abaixo
 * não confia nisso: quem perde a corrida do `reservarMensagem` não desiste,
 * tenta a PRÓXIMA candidata (a que a reserva do outro processo acabou de
 * tornar visível como "a de cima"). O limite de 5 voltas existe só para não
 * girar para sempre se a fila inteira estiver sendo disputada.
 *
 * `opcoes.apenasCampanhaId` não é para uso em produção — ver `OpcoesFila` em
 * `proximaDaFila`. Existe para os testes conseguirem provar isolamento por
 * ESTRUTURA da consulta, não só por quantidade de candidatas descartáveis.
 *
 * `contexto.origem` identifica QUEM chamou (a rota, o worker, um teste) nos
 * logs estruturados — é o que faltou para responder "quem está chamando a
 * fila real?" sem precisar de captura de rede ao vivo da próxima vez.
 */
export async function enviarProxima(
  opcoes?: OpcoesFila,
  contexto?: { origem?: string },
): Promise<ResultadoDaVez> {
  const requestId = crypto.randomUUID();
  const origem = contexto?.origem ?? "desconhecida";
  const inicio = Date.now();
  const duracao = () => Date.now() - inicio;

  logFila("chamada_recebida", { requestId, origem });

  const cfg = await lerConfig();

  const bloqueio = await podeEnviarAgora(cfg);
  if (!bloqueio.pode) {
    logFila("bloqueada", { requestId, origem, motivo: bloqueio.motivo, duracaoMs: duracao() });
    return {
      enviada: false,
      motivo: bloqueio.motivo,
      esperarSegundos: bloqueio.esperarSegundos ?? 0,
    };
  }

  let mensagem, lead, numero: string;
  for (let volta = 0; ; volta++) {
    const alvo = await proximaDaFila(cfg, opcoes);
    if (!alvo) {
      logFila("fila_vazia", { requestId, origem, duracaoMs: duracao() });
      return { enviada: false, motivo: "Fila vazia." };
    }
    logFila("candidata_encontrada", {
      requestId,
      origem,
      mensagemId: alvo.mensagem.id,
      leadId: alvo.lead.id,
      volta,
    });

    const n = numeroDoLead(alvo.lead);
    if (!n) {
      await db
        .update(mensagens)
        .set({ status: "erro", erro: "Número inválido no lead.", atualizadoEm: new Date() })
        .where(eq(mensagens.id, alvo.mensagem.id));
      logFila("erro_numero_invalido", { requestId, origem, mensagemId: alvo.mensagem.id, duracaoMs: duracao() });
      return { enviada: false, motivo: "Número inválido." };
    }

    if (await reservarMensagem(alvo.mensagem.id)) {
      mensagem = alvo.mensagem;
      lead = alvo.lead;
      numero = n;
      logFila("reservada", { requestId, origem, mensagemId: mensagem.id, leadId: lead.id, volta });
      break;
    }

    // Perdeu a corrida: outro processo reservou primeiro. Tenta a próxima.
    logFila("perdeu_corrida", { requestId, origem, mensagemId: alvo.mensagem.id, volta });
    if (volta >= 4) {
      logFila("disputada_demais", { requestId, origem, duracaoMs: duracao() });
      return { enviada: false, motivo: "Fila disputada por outro processo — tente de novo." };
    }
  }

  const cfgProv = await lerConfigProvedor();
  if (!cfgProv) {
    /**
     * Caso raríssimo: `podeEnviarAgora` viu a integração pronta, mas a
     * configuração mudou no instante entre aquela checagem e agora. Devolve a
     * reserva (`aprovada` de novo) em vez de deixar `na-fila` esperando os
     * `PROCESSANDO_TIMEOUT_MS` para ficar disponível de novo — não é uma
     * mensagem travada por falha de envio, é a configuração que sumiu.
     */
    await db
      .update(mensagens)
      .set({ status: "aprovada", processandoDesde: null, atualizadoEm: new Date() })
      .where(eq(mensagens.id, mensagem.id));
    logFila("erro_provedor_nao_configurado", { requestId, origem, mensagemId: mensagem.id, duracaoMs: duracao() });
    return { enviada: false, motivo: "Provedor não configurado." };
  }

  /**
   * A saudação vira "Bom dia"/"Boa tarde" AQUI, no último instante.
   *
   * O texto guardado no banco traz o marcador porque a fila leva dias para
   * escoar: uma campanha montada às 20h grava "Boa noite" e entrega isso na
   * manhã de quinta. Ver lib/saudacao.ts.
   */
  const texto = resolverSaudacao(mensagem.texto, agoraDoEnvio());

  const r = await provedorDe(cfgProv.tipo).enviar(cfgProv, numero, texto);
  const agora = new Date();

  if (!r.ok) {
    /**
     * Sem `status` HTTP (rede caiu, timeout — nunca chegou a ter resposta) ou
     * erro 5xx do provedor: PODE ser passageiro, então tenta de novo um número
     * pequeno de vezes antes de desistir. Qualquer outro caso (4xx, "número
     * não tem WhatsApp", token inválido) é permanente — tentar de novo não
     * muda o resultado, então vai direto para `erro`, sem retry, como sempre.
     */
    const tentativasFeitas = mensagem.tentativas + 1; // reservarMensagem já incrementou no banco
    const temporario = r.status === undefined || r.status >= 500;

    if (temporario && tentativasFeitas < LIMITE_TENTATIVAS_ENVIO_TEMPORARIO) {
      await db
        .update(mensagens)
        .set({
          status: "aprovada",
          processandoDesde: null,
          erro: `Falha temporária (tentativa ${tentativasFeitas}/${LIMITE_TENTATIVAS_ENVIO_TEMPORARIO}): ${r.erro}`,
          atualizadoEm: agora,
        })
        .where(eq(mensagens.id, mensagem.id));
      logFila("envio_falhou_temporario", {
        requestId,
        origem,
        mensagemId: mensagem.id,
        leadId: lead.id,
        erro: r.erro,
        tentativa: tentativasFeitas,
        duracaoMs: duracao(),
      });
      return { enviada: false, motivo: r.erro, lead: lead.nome };
    }

    await db
      .update(mensagens)
      .set({ status: "erro", erro: r.erro, atualizadoEm: agora })
      .where(eq(mensagens.id, mensagem.id));
    logFila("envio_falhou", {
      requestId,
      origem,
      mensagemId: mensagem.id,
      leadId: lead.id,
      erro: r.erro,
      permanente: !temporario,
      duracaoMs: duracao(),
    });
    return { enviada: false, motivo: r.erro, lead: lead.nome };
  }

  await db
    .update(mensagens)
    .set({
      status: "enviada",
      enviadaEm: agora,
      provedorId: r.provedorId,
      erro: null,
      atualizadoEm: agora,
    })
    .where(eq(mensagens.id, mensagem.id));

  logFila("envio_ok", {
    requestId,
    origem,
    mensagemId: mensagem.id,
    leadId: lead.id,
    duracaoMs: duracao(),
  });

  /**
   * Espelha em `conversas`, que é a fonte de verdade da THREAD (central de
   * Conversas e aba do painel do lead). `mensagens` continua sendo a fila —
   * duas tabelas, um evento só.
   */
  await db.insert(conversas).values({
    leadId: lead.id,
    direcao: "enviada",
    autor: "campanha",
    texto,
    provedorMsgId: r.provedorId,
    lida: true,
  });

  /**
   * Variação opcional de até 20% a mais no intervalo — nunca a menos, o piso
   * de segurança continua sendo `cfg.intervaloSegundos`. Existe só para o
   * ritmo não parecer cronometrado por robô; desligada por padrão.
   */
  const jitter = cfg.variacaoAleatoriaAtiva
    ? Math.round(cfg.intervaloSegundos * Math.random() * 0.2)
    : 0;

  return { enviada: true, lead: lead.nome, proximaEm: cfg.intervaloSegundos + jitter };
}

export type StatusWorker = {
  codigo: "rodando" | "aguardando" | "whatsapp-desconectado" | "limite-diario" | "pausado-manualmente" | "erro";
  emoji: "🟢" | "🟡" | "🟠" | "🔴";
  label: string;
};

/**
 * Semáforo único do painel, combinando o estado da bridge (worker
 * ligado/desligado, WhatsApp pareado) com o resultado que `podeEnviarAgora`
 * já calcula — sem duplicar nenhuma trava, só interpretando o motivo que ela
 * devolve. `bridgeAlcancavel:false` cobre tanto "bridge caiu" quanto "bridge
 * nunca foi configurada" — os dois se resolvem do mesmo jeito para quem olha
 * o painel: não dá para saber o estado do worker agora.
 */
export function calcularStatusWorker(params: {
  bridgeAlcancavel: boolean;
  filaWorkerAtivo: boolean | null;
  whatsappConectado: boolean | null;
  bloqueio: Bloqueio;
}): StatusWorker {
  const { bridgeAlcancavel, filaWorkerAtivo, whatsappConectado, bloqueio } = params;

  if (!bridgeAlcancavel) {
    return { codigo: "erro", emoji: "🔴", label: "Bridge inacessível." };
  }
  if (filaWorkerAtivo === false) {
    return { codigo: "pausado-manualmente", emoji: "🔴", label: "Pausado manualmente." };
  }
  if (whatsappConectado === false) {
    return { codigo: "whatsapp-desconectado", emoji: "🟡", label: "WhatsApp desconectado — aguardando reconexão." };
  }
  if (!bloqueio.pode) {
    if (/^Teto diário atingido/.test(bloqueio.motivo)) {
      return { codigo: "limite-diario", emoji: "🟠", label: bloqueio.motivo };
    }
    return { codigo: "aguardando", emoji: "🟡", label: bloqueio.motivo };
  }
  return { codigo: "rodando", emoji: "🟢", label: "Rodando." };
}
