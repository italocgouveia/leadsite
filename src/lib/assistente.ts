import type { Lead } from "@/lib/db/schema";
import { avaliarOportunidadeComercial } from "@/lib/oportunidade-comercial";
import { probabilidadeComercial } from "@/lib/probabilidade";
import { avaliarSistema, modulosLegiveis } from "@/lib/sistemas";
import { canalDoLead, instagramDoLead, temSiteProprio, ROTULO_CANAL } from "@/lib/canais";
import { classificarPorte } from "@/lib/porte";
import { alcanceDoLead, ROTULO_ALCANCE } from "@/lib/territorio";
import { categoriaSingular } from "@/lib/categoria-nome";
import { montarAbordagem } from "@/lib/abordagem-montada";
import { OBJECOES } from "@/lib/objecoes";

/**
 * 🤖 O ASSISTENTE COMERCIAL — e as duas travas que o tornam aceitável.
 *
 * TRAVA 1: ELE SÓ VÊ O QUE EXISTE.
 *
 * `dossie()` monta o retrato do lead a partir dos campos gravados e das
 * funções que já decidem tudo no CRM. Nada de "pesquise sobre a empresa": o
 * modelo recebe uma lista fechada de fatos e não tem de onde tirar outros.
 *
 * TRAVA 2: FATO E HIPÓTESE CHEGAM SEPARADOS.
 *
 * O dossiê já vem dividido em CONFIRMADO e HIPÓTESE, e a instrução exige que a
 * resposta preserve a separação. Um modelo que recebe tudo misturado devolve
 * tudo misturado, e aí "provavelmente é pequena" vira "é pequena" na frente do
 * cliente.
 *
 * E FUNCIONA SEM CHAVE.
 *
 * Sem `GEMINI_API_KEY`, `perguntasFrequentes()` responde as perguntas mais
 * comuns de forma determinística, com os mesmos dados. É o §13: nenhuma parte
 * do CRM pode ter o estado "sem API paga = quebrado".
 */

export type Dossie = {
  confirmado: string[];
  hipoteses: string[];
  /** O que não sabemos — e que o modelo é proibido de preencher. */
  desconhecido: string[];
};

/**
 * O retrato do lead, com cada linha marcada pela sua natureza.
 *
 * CONFIRMADO é o que está gravado ou o que a empresa publicou. HIPÓTESE é
 * conclusão nossa — porte estimado, encaixe de sistema, dor provável.
 * DESCONHECIDO é o que falta, listado de propósito: é a lista que impede o
 * modelo de "completar" o que não existe.
 */
export function dossie(lead: Lead): Dossie {
  const encaixe = avaliarSistema(lead);
  const prob = probabilidadeComercial(lead);
  const classe = classificarPorte(lead);
  const ig = instagramDoLead(lead);
  const o = avaliarOportunidadeComercial(lead);

  const confirmado: string[] = [
    `Nome cadastrado: ${lead.nome}`,
    `Ramo: ${categoriaSingular(lead.categoria) || "não classificado"}`,
    `Cidade: ${lead.cidade ?? "não informada"}${lead.estado ? `/${lead.estado}` : ""}`,
    `Alcance da operação: ${ROTULO_ALCANCE[alcanceDoLead(lead)]}`,
    `Canal disponível: ${ROTULO_CANAL[canalDoLead(lead)]}`,
    `Etapa no funil: ${lead.etapa}`,
  ];
  if (lead.bairro) confirmado.push(`Bairro: ${lead.bairro}`);
  if (lead.telefone) confirmado.push("Tem telefone cadastrado");
  if (ig) confirmado.push(`Instagram: @${ig.username}`);
  if (temSiteProprio(lead)) confirmado.push(`Site próprio: ${lead.website}`);
  if (lead.horarios) confirmado.push(`Horário publicado: ${lead.horarios}`);
  if (lead.avaliacoes) confirmado.push(`${lead.avaliacoes} avaliações públicas`);
  if (lead.nota) confirmado.push(`Nota pública: ${lead.nota}`);
  if (classe.rede) confirmado.push(`É rede/franquia: ${classe.motivosRede[0]}`);
  if (lead.memoriaComercial?.dorConfirmada) {
    confirmado.push(`Dor CONFIRMADA pelo próprio cliente: ${lead.memoriaComercial.dorConfirmada}`);
  }

  const hipoteses: string[] = [];
  if (classe.porteEstimado === "pequeno") {
    hipoteses.push(`Parece negócio pequeno/local — indícios: ${classe.sinais.join(", ")}`);
  }
  if (encaixe.serve) {
    hipoteses.push(`Sistema que talvez sirva: ${encaixe.sistema} (${modulosLegiveis(encaixe.modulos)})`);
  }
  if (prob.dor.tipo === "provavel") {
    hipoteses.push(`Dor PROVÁVEL (não confirmada): ${prob.dor.texto} — sinais: ${prob.dor.sinais.join(", ")}`);
  }
  hipoteses.push(`Prioridade calculada: ${prob.pontos}/100 · ${o.classificacao}`);

  const desconhecido: string[] = [];
  if (!lead.telefone) desconhecido.push("telefone");
  if (!ig) desconhecido.push("Instagram utilizável");
  if (!temSiteProprio(lead)) desconhecido.push("site próprio");
  if (!lead.horarios) desconhecido.push("horário de funcionamento");
  if (!lead.avaliacoes) desconhecido.push("volume de avaliações");
  if (classe.porte === "desconhecido") desconhecido.push("porte oficial (nenhuma fonte declara)");
  desconhecido.push("faturamento", "número de funcionários", "sistema que usa hoje");

  return { confirmado, hipoteses, desconhecido };
}

/** O texto que vai ao modelo. Fechado, rotulado e sem espaço para inventar. */
export function promptDoLead(lead: Lead): { sistema: string; entrada: string } {
  const d = dossie(lead);
  return {
    sistema: [
      "Você é um assistente de um vendedor de sistemas de gestão para pequenos negócios em Uberlândia-MG.",
      "",
      "REGRAS ABSOLUTAS:",
      "1. Use SOMENTE os dados do dossiê abaixo. Você não tem acesso a mais nada.",
      "2. NUNCA afirme algo que esteja na lista DESCONHECIDO. Se precisar dele, diga que falta.",
      "3. Preserve a separação: o que está em HIPÓTESE continua sendo hipótese na sua resposta.",
      "   Escreva 'provavelmente', 'talvez', 'vale perguntar' — nunca afirme como fato.",
      "4. Não invente número, funcionário, faturamento, avaliação, dor ou concorrente.",
      "5. Responda em português do Brasil, direto, sem introdução e sem elogio ao vendedor.",
      "6. No máximo 8 linhas.",
    ].join("\n"),
    entrada: [
      "=== CONFIRMADO (pode afirmar) ===",
      ...d.confirmado.map((x) => `• ${x}`),
      "",
      "=== HIPÓTESE (só como possibilidade) ===",
      ...d.hipoteses.map((x) => `• ${x}`),
      "",
      "=== DESCONHECIDO (proibido afirmar) ===",
      `• ${d.desconhecido.join(", ")}`,
    ].join("\n"),
  };
}

/* ═══════════════ o modo sem IA, que sempre funciona ═══════════════ */

export type PerguntaFrequente = {
  id: string;
  pergunta: string;
  responder: (lead: Lead) => string;
};

/**
 * As perguntas que o vendedor faz todo dia, respondidas com o que já foi
 * calculado — sem modelo nenhum. Existem por dois motivos: funcionam sem
 * chave, e são mais confiáveis que qualquer geração, porque saem das mesmas
 * funções que decidem a fila.
 */
export const PERGUNTAS: PerguntaFrequente[] = [
  {
    id: "vale-o-tempo",
    pergunta: "Essa empresa vale meu tempo?",
    responder: (lead) => {
      const o = avaliarOportunidadeComercial(lead);
      const p = probabilidadeComercial(lead);
      if (!o.temPotencialDeSolucao) return "Não. Nenhuma solução da ICG Tech se encaixa neste ramo.";
      if (o.aguardandoCanal)
        return `Como empresa, sim — prioridade ${p.pontos}/100. Mas não há canal de contato, então hoje ela é alvo de enriquecimento, não de abordagem.`;
      if (!o.elegivel) return `Hoje não: ${o.bloqueios.join(" · ")}.`;
      return `Sim. Prioridade ${p.pontos}/100, ${o.classificacao}. ${o.motivos.slice(0, 3).join(" · ")}.`;
    },
  },
  {
    id: "o-que-vendo",
    pergunta: "O que devo vender?",
    responder: (lead) => {
      const e = avaliarSistema(lead);
      if (!e.serve) return "Nada do catálogo atual se encaixa neste ramo.";
      return `${e.sistema}. Módulos: ${modulosLegiveis(e.modulos)}.`;
    },
  },
  {
    id: "qual-canal",
    pergunta: "Qual canal devo usar?",
    responder: (lead) => {
      const c = canalDoLead(lead);
      if (c === "ambos") return "Os dois. Comece pelo WhatsApp; o Instagram serve de reforço se não responder.";
      if (c === "whatsapp") return "WhatsApp. Pode entrar em campanha automática ou você aborda à mão.";
      if (c === "instagram") return "Instagram, à mão. Este lead nunca entra em disparo automático.";
      if (c === "site") return "Nenhum ainda. Abra o site e procure WhatsApp ou Instagram — é por aí que o canal aparece.";
      return "Nenhum. Precisa de enriquecimento antes de qualquer abordagem.";
    },
  },
  {
    id: "qual-dor",
    pergunta: "Qual dor devo investigar?",
    responder: (lead) => {
      const d = probabilidadeComercial(lead).dor;
      if (d.tipo === "confirmada") return `Já confirmada pelo cliente: ${d.texto}. Não precisa investigar — precisa resolver.`;
      if (d.tipo === "provavel")
        return `Hipótese: ${d.texto}. Sustentada por ${d.sinais.join(", ")}. NÃO afirme — pergunte como ele faz isso hoje.`;
      return "Não há sinal suficiente para supor uma dor. Use a abordagem consultiva e deixe ele contar.";
    },
  },
  {
    id: "o-que-falo",
    pergunta: "O que eu falo?",
    responder: (lead) => {
      const a = montarAbordagem(lead);
      if (!a.abertura) return "Faltam dados para montar uma abordagem honesta. Enriqueça o cadastro primeiro.";
      return `${a.abertura}\n\n${a.valor}\n\n${a.pergunta}`.trim();
    },
  },
  {
    id: "resumo",
    pergunta: "Resuma esse lead.",
    responder: (lead) => {
      const d = dossie(lead);
      return [
        `CONFIRMADO: ${d.confirmado.slice(0, 5).join(" · ")}`,
        `HIPÓTESE: ${d.hipoteses.join(" · ")}`,
        `NÃO SABEMOS: ${d.desconhecido.join(", ")}`,
      ].join("\n\n");
    },
  },
  {
    id: "objecoes",
    pergunta: "Como respondo às objeções mais comuns?",
    responder: () =>
      OBJECOES.slice(0, 4)
        .map((o) => `${o.nome}: ${o.pergunta}`)
        .join("\n") + "\n\nAs respostas completas estão em /materiais.",
  },
];

export function responderSemIA(lead: Lead, id: string): string | null {
  return PERGUNTAS.find((p) => p.id === id)?.responder(lead) ?? null;
}
