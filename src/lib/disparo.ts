import { eq, inArray } from "drizzle-orm";
import { db, leads, mensagens, campanhas, configuracoes, type Lead } from "@/lib/db";
import { avaliarContato, enviadasHoje, lerConfig, type Config } from "@/lib/fila";
import { estadoIntegracao } from "@/lib/integracao";
import { estimarDuracao } from "@/lib/facetas";
import { resolverSaudacao } from "@/lib/saudacao";
import { registrar, textoPara } from "@/lib/campanha";
import { avaliar } from "@/lib/oportunidade";
import { pontuar } from "@/lib/pontuacao";
import { categoriaSingular } from "@/lib/categoria-nome";
import type { Etapa } from "@/lib/db/schema";

/**
 * Disparo de um clique.
 *
 * O caminho completo — filtrar, montar campanha, revisar, aprovar, ir para
 * outra tela, ligar a automação — existe e continua existindo. Ele é o certo
 * quando você quer escolher o lote. Só que, no dia a dia, a resposta para
 * "para quem eu mando hoje?" quase sempre é "para todo mundo que ainda dá".
 * Cinco telas para dizer isso é o que fazia o disparo não acontecer.
 *
 * Aqui a pergunta é feita uma vez só: *quem ainda pode receber?* — e o botão
 * manda para todos eles.
 *
 * O QUE ESTE ATALHO **NÃO** PULA, e é importante que não pule:
 *
 *   · opt-out, lead que já respondeu, contato recente, mensagem pendente;
 *   · intervalo entre envios e teto diário;
 *   · a revalidação de todas essas travas a cada mensagem, no servidor.
 *
 * Pular a revisão de texto é decisão de conveniência e custa, no máximo, uma
 * mensagem sem graça. Pular as travas acima custa o número. São coisas
 * diferentes e só a primeira foi dispensada.
 */

/** Etapas anteriores ao primeiro contato. Depois disso a conversa é humana. */
const ETAPAS_ANTES_DO_CONTATO: Etapa[] = ["novo", "analisado", "qualificado"];

export type Alvo = { lead: Lead; texto: string };

/** Um motivo de recusa e quantos leads caíram nele. */
export type Recusa = { motivo: string; quantidade: number };

/**
 * Varre a base inteira e devolve quem pode receber agora.
 *
 * Duas consultas no total, não duas por lead: leads e mensagens vêm de uma vez
 * e as regras rodam em memória, pela mesma função que a fila usa no envio.
 */
async function elegiveis(cfg: Config): Promise<{ aptos: Alvo[]; recusas: Recusa[] }> {
  const [base, historico] = await Promise.all([
    db.select().from(leads),
    db
      .select({
        id: mensagens.id,
        leadId: mensagens.leadId,
        status: mensagens.status,
        enviadaEm: mensagens.enviadaEm,
      })
      .from(mensagens),
  ]);

  const porLead = new Map<string, { id: string; status: string; enviadaEm: Date | null }[]>();
  for (const m of historico) {
    const atual = porLead.get(m.leadId);
    if (atual) atual.push(m);
    else porLead.set(m.leadId, [m]);
  }

  const aptos: Alvo[] = [];
  const contagem = new Map<string, number>();
  const recusar = (motivo: string) =>
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);

  for (const lead of base) {
    /**
     * Lead que já saiu do começo do funil não entra em disparo em massa.
     *
     * `avaliarContato` sozinho não pega este caso: um lead movido à mão para
     * "reunião" que nunca recebeu mensagem pelo sistema passaria por todas as
     * travas — e receberia uma abordagem de primeiro contato no meio de uma
     * negociação já em andamento.
     */
    if (!ETAPAS_ANTES_DO_CONTATO.includes(lead.etapa)) {
      recusar("Já está adiante no funil.");
      continue;
    }

    const check = avaliarContato(lead, cfg, porLead.get(lead.id) ?? []);
    if (!check.pode) {
      recusar(check.motivo);
      continue;
    }

    const texto = textoPara(lead);
    if (!texto) {
      recusar("Sem mensagem possível para este ramo.");
      continue;
    }

    aptos.push({ lead, texto });
  }

  // Melhores primeiro: se o teto diário cortar, corta pelo fim da lista.
  aptos.sort((a, b) => pontuar(b.lead).total - pontuar(a.lead).total);

  const recusas = [...contagem.entries()]
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return { aptos, recusas };
}

export type Previa = {
  /** Dá para clicar? Falso quando o WhatsApp não está pronto ou não há alvo. */
  pronto: boolean;
  impedimento: string | null;
  comoResolver: string[];

  total: number;
  hoje: number;
  dias: number;
  tempoHoje: string;

  /**
   * Mensagens já aprovadas esperando a vez.
   *
   * Sobra quando o teto diário corta o disparo no meio: no dia seguinte a tela
   * precisa oferecer "continuar" e não "disparar de novo" — disparar de novo
   * sobre a mesma fila é como se manda a mesma mensagem duas vezes.
   */
  naFila: number;

  enviadasHoje: number;
  limiteDiario: number;
  intervaloSegundos: number;

  segmentos: { nome: string; quantidade: number }[];
  cidades: { nome: string; quantidade: number }[];
  produtos: { nome: string; quantidade: number }[];
  recusas: Recusa[];

  /** Os primeiros da fila, na ordem exata em que vão sair. */
  ordem: { nome: string; cidade: string | null; nota: number; emoji: string }[];
  /** Pontuação do primeiro e do último da fila — mostra a régua em uso. */
  maiorNota: number;
  menorNota: number;

  /** Três mensagens reais, como vão sair. Ver o texto não é aprovar lead. */
  amostra: { nome: string; cidade: string | null; nota: number; texto: string }[];
};

function agrupar(aptos: Alvo[], chave: (l: Lead) => string | null) {
  const m = new Map<string, number>();
  for (const a of aptos) {
    const k = chave(a.lead);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((x, y) => y.quantidade - x.quantidade);
}

/**
 * O que aconteceria se você clicasse. Não grava nada.
 *
 * A tela mostra isto ANTES do botão, e o botão carrega o número no rótulo.
 * "Enviar para 37 empresas" já é a confirmação — não existe um segundo modal
 * perguntando de novo, porque a pergunta está escrita no próprio botão.
 */
export async function previa(): Promise<Previa> {
  const cfg = await lerConfig();
  const [integracao, { aptos, recusas }, jaHoje, pendentes] = await Promise.all([
    estadoIntegracao(),
    elegiveis(cfg),
    enviadasHoje(),
    db
      .select({ id: mensagens.id })
      .from(mensagens)
      .where(inArray(mensagens.status, ["aprovada", "na-fila"])),
  ]);

  const naFila = pendentes.length;
  const restaHoje = Math.max(0, cfg.limiteDiario - jaHoje);
  const hoje = Math.min(aptos.length + naFila, restaHoje);
  const duracao = estimarDuracao(aptos.length, cfg.intervaloSegundos, cfg.limiteDiario);

  const impedimento = !integracao.pronta
    ? (integracao.erro ??
      `WhatsApp não configurado. Falta: ${integracao.pendencias
        .filter((p) => !p.feito)
        .map((p) => p.item)
        .join(", ")}.`)
    : aptos.length === 0 && naFila === 0
      ? "Nenhum lead disponível para contato agora."
      : null;

  return {
    pronto: impedimento === null,
    naFila,
    impedimento,
    comoResolver: !integracao.pronta
      ? integracao.comoCorrigir
      : aptos.length === 0 && naFila === 0
        ? [
            "Busque novos leads na aba Buscar leads",
            "Ou espere a janela de recontato dos que já foram abordados",
          ]
        : [],

    total: aptos.length,
    hoje,
    dias: duracao.dias,
    tempoHoje: estimarDuracao(hoje, cfg.intervaloSegundos, cfg.limiteDiario).legivel,

    enviadasHoje: jaHoje,
    limiteDiario: cfg.limiteDiario,
    intervaloSegundos: cfg.intervaloSegundos,

    segmentos: agrupar(aptos, (l) => categoriaSingular(l.categoria)).slice(0, 8),
    cidades: agrupar(aptos, (l) => l.cidade).slice(0, 6),
    produtos: agrupar(aptos, (l) => avaliar(l).produto ?? null),
    recusas,

    /**
     * `aptos` já está ordenado por pontuação, e é a MESMA ordem que a fila vai
     * seguir — a coluna `prioridade` grava essa pontuação e o banco ordena por
     * ela. Esta lista não é uma prévia decorativa: é o roteiro.
     */
    ordem: aptos.slice(0, 10).map((a) => ({
      nome: a.lead.nome,
      cidade: a.lead.cidade,
      nota: pontuar(a.lead).total,
      emoji: pontuar(a.lead).emoji,
    })),
    maiorNota: aptos.length ? pontuar(aptos[0].lead).total : 0,
    menorNota: aptos.length ? pontuar(aptos[aptos.length - 1].lead).total : 0,

    amostra: aptos.slice(0, 3).map((a) => ({
      nome: a.lead.nome,
      cidade: a.lead.cidade,
      nota: pontuar(a.lead).total,
      // A tela mostra a saudação já resolvida — marcador cru confundiria.
      texto: resolverSaudacao(a.texto),
    })),
  };
}

/** Nome automático: "Disparo — 24 ago, 16h52". */
function nomeAutomatico(): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Disparo — ${dia}, ${hora}`;
}

export type Resultado =
  | { ok: false; erro: string; comoResolver: string[] }
  | { ok: true; campanhaId: string; criadas: number; recusas: Recusa[]; nome: string };

/**
 * O clique.
 *
 * Cria a campanha, escreve as mensagens já APROVADAS, põe a campanha para
 * rodar e liga a automação. Nada é enviado aqui — quem envia é a fila, uma por
 * vez. A diferença para o caminho longo é que ninguém precisa passar em cada
 * mensagem dizendo "pode".
 */
export async function dispararTudo(): Promise<Resultado> {
  const cfg = await lerConfig();

  /**
   * Confere a integração ANTES de criar qualquer coisa.
   *
   * Sem isto, um clique com o WhatsApp fora do ar criaria a campanha e 40
   * mensagens que iriam todas para "erro" — e o próximo disparo encontraria
   * esses 40 leads bloqueados por "já tem mensagem aguardando", que é uma
   * mentira produzida pela própria falha.
   */
  const integracao = await estadoIntegracao();
  if (!integracao.pronta) {
    return {
      ok: false,
      erro:
        integracao.erro ??
        `WhatsApp não configurado. Falta: ${integracao.pendencias
          .filter((p) => !p.feito)
          .map((p) => p.item)
          .join(", ")}.`,
      comoResolver: integracao.comoCorrigir,
    };
  }

  const { aptos, recusas } = await elegiveis(cfg);
  if (aptos.length === 0) {
    return {
      ok: false,
      erro: "Nenhum lead disponível para contato agora.",
      comoResolver: ["Busque novos leads", "Ou espere a janela de recontato"],
    };
  }

  const agora = new Date();
  const nome = nomeAutomatico();

  const [campanha] = await db
    .insert(campanhas)
    .values({
      nome,
      status: "rodando",
      iniciadaEm: agora,
      filtro: { modo: "disparo-total", elegiveis: aptos.length },
    })
    .returning();

  /**
   * Um insert só, com todas as mensagens. Em lote de 200, inserir uma a uma
   * levava mais tempo que o próprio primeiro envio.
   */
  await db.insert(mensagens).values(
    aptos.map((a) => ({
      leadId: a.lead.id,
      campanhaId: campanha.id,
      // A tela mostra a saudação já resolvida — marcador cru confundiria.
      texto: resolverSaudacao(a.texto),
      produto: avaliar(a.lead).produto,
      origem: "modelo" as const,
      // Já nasce aprovada: é exatamente isso que o botão dispensa.
      status: "aprovada" as const,
      aprovadaEm: agora,
      rodada: 0,
      /**
       * A pontuação vira a ordem de saída. Sem isto, `aptos` já vem ordenado
       * por pontuação e a fila descarta essa ordem — todas as linhas deste
       * INSERT nascem com o mesmo `criadoEm`.
       */
      prioridade: pontuar(a.lead).total,
    })),
  );

  // Liga a automação junto. Ter que ligar num outro lugar era mais um passo.
  await db
    .update(configuracoes)
    .set({ automacaoAtiva: true, atualizadoEm: agora })
    .where(eq(configuracoes.id, "default"));

  await registrar(
    "disparo.total",
    `"${nome}": ${aptos.length} mensagens aprovadas de uma vez`,
    { campanhaId: campanha.id, dados: { criadas: aptos.length } },
  );

  return { ok: true, campanhaId: campanha.id, criadas: aptos.length, recusas, nome };
}

/**
 * Para tudo: cancela o que ainda não saiu e desliga a automação.
 *
 * O botão de pânico. Se a mensagem estiver errada, o custo de descobrir isso
 * na terceira de quarenta não pode ser ter que abrir outra tela.
 */
export async function pararTudo(): Promise<{ canceladas: number }> {
  const agora = new Date();

  /**
   * Cancela só o que está NA FILA — `aprovada` e `na-fila`.
   *
   * A versão anterior levava `rascunho` junto, e isso destruía trabalho que
   * nunca foi enfileirado: rascunhos que você escreveu à mão em Automação,
   * possivelmente editados um a um, sumiam ao clicar em "Cancelar o resto" de
   * um disparo que nada tinha a ver com eles.
   *
   * "Parar o envio" e "apagar o que eu ainda estou escrevendo" são coisas
   * diferentes. Este botão faz a primeira.
   *
   * `na-fila` entra porque é o estado de quem já saiu de `aprovada` mas ainda
   * não teve resposta do provedor — deixar de fora prenderia essas mensagens.
   */
  const canceladas = await db
    .update(mensagens)
    .set({ status: "cancelada", erro: "Disparo interrompido por você", atualizadoEm: agora })
    .where(inArray(mensagens.status, ["aprovada", "na-fila"]))
    .returning({ id: mensagens.id });

  await db
    .update(configuracoes)
    .set({ automacaoAtiva: false, atualizadoEm: agora })
    .where(eq(configuracoes.id, "default"));

  await registrar("disparo.interrompido", `${canceladas.length} mensagem(ns) cancelada(s)`);

  return { canceladas: canceladas.length };
}
