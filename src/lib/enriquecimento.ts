import type { Lead } from "@/lib/db/schema";
import { prioridadeComercial, type NivelPrioridade } from "@/lib/pontuacao";
import { avaliarSistema } from "@/lib/sistemas";
import { classificarPorte, ehCategoriaDeGrandePorte } from "@/lib/porte";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";

/**
 * Quem vale a pena caçar o telefone.
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 *
 * Medido na base: 1.057 leads, 997 com encaixe de sistema, 907 com encaixe
 * FORTE — e 12 prontos para prospecção. O gargalo não é qualidade do lead, é
 * contato: 783 não têm telefone nenhum. Baixar a régua resolveria o número e
 * pioraria a operação; achar o telefone resolve os dois.
 *
 * A ARMADILHA QUE QUASE QUEBROU ISTO
 *
 * A gaveta A/B/C/D exige celular para chegar em A ou B. Logo, TODO lead sem
 * telefone é C ou D — e "os leads A sem telefone" que este recurso deveria
 * pescar simplesmente não existem. Ordenar a fila por `prioridadeComercial`
 * devolveria uma fila vazia.
 *
 * Por isso a prioridade usa a QUALIDADE POTENCIAL: a gaveta em que o lead
 * cairia SE tivesse um celular. É a pergunta certa para esta fila — "vale a
 * pena procurar o número deste negócio?" — e é honesta, porque não afirma nada
 * sobre o lead: só simula o único dado que falta.
 *
 * Funções puras. Não tocam no banco, não chamam fonte externa, não enviam nada.
 */

/** Encaixe FORTE: o sistema encosta em 4 ou mais processos do negócio. */
export const MODULOS_POTENCIAL_FORTE = 4;

export type Enriquecimento = {
  precisa: boolean;
  prioridade: "alta" | "media" | "baixa" | null;
  motivo: string;
  /**
   * A ordem exata dos quatro escalões pedidos, para a fila não depender de
   * empates dentro de "alta"/"media":
   *   1 = A + potencial forte · 2 = B + potencial forte
   *   3 = A + potencial       · 4 = B + potencial
   * `null` quando não entra na fila.
   */
  ordem: 1 | 2 | 3 | 4 | null;
  /** A gaveta que o lead alcançaria com um celular. */
  qualidadePotencial: NivelPrioridade;
};

/**
 * Um celular válido qualquer, só para responder "e se tivesse telefone?".
 *
 * Nunca é gravado, nunca sai desta função e nunca vira `lead.telefone`. Existe
 * para medir a qualidade do NEGÓCIO sem o eixo de contato contaminar o
 * resultado — ver o comentário do topo.
 */
const CELULAR_HIPOTETICO = "(34) 99999-9999";

/**
 * Em que gaveta este lead cairia se tivesse um celular?
 *
 * Para quem já tem telefone, é a própria gaveta real — a simulação só substitui
 * o que está faltando.
 */
export function qualidadePotencial(lead: Lead): NivelPrioridade {
  if (validarTelefone(telefoneDoLead(lead))) return prioridadeComercial(lead).nivel;
  return prioridadeComercial({
    ...lead,
    telefone: CELULAR_HIPOTETICO,
    whatsapp: null,
  } as Lead).nivel;
}

/**
 * Este lead entra na fila de enriquecimento?
 *
 * Responde `precisa: false` com motivo em TODOS os casos de saída, e não só um
 * booleano seco: a tela precisa dizer por que um lead bom não está na fila, ou
 * a pessoa vai procurar o telefone dele à mão sem saber que o sistema já
 * decidiu que não vale.
 */
export function precisaEnriquecer(lead: Lead): Enriquecimento {
  const potencial = qualidadePotencial(lead);
  const negar = (motivo: string): Enriquecimento => ({
    precisa: false,
    prioridade: null,
    motivo,
    ordem: null,
    qualidadePotencial: potencial,
  });

  // ---------- quem já tem contato não é problema desta fila ----------
  const tel = validarTelefone(telefoneDoLead(lead));
  if (tel) {
    /**
     * Telefone FIXO continua sendo um lead com contato — ele só não entra em
     * campanha de WhatsApp. Enriquecer aqui seria procurar um segundo número,
     * e a regra é clara: não substituir nem duplicar telefone existente. O
     * caminho para o fixo é a validação de WhatsApp, não o enriquecimento.
     */
    return negar(
      tel.tipo === "fixo"
        ? "Já tem telefone fixo — falta confirmar WhatsApp, não achar número"
        : "Já tem telefone",
    );
  }
  if (lead.telefone?.trim()) {
    return negar("Tem telefone cadastrado, mas inválido — corrigir à mão");
  }

  // ---------- quem não deve ser trabalhado ----------
  if (lead.naoContatar) return negar("Pediu para não ser contatado");
  const ENCERRADOS = ["sem-interesse", "ja-tem-sistema", "opt-out", "contato-invalido"];
  if (ENCERRADOS.includes(lead.etapa)) return negar(`Já encerrado: ${lead.etapa}`);

  const classe = classificarPorte(lead);
  if (classe.rede) return negar(`Rede ou franquia: ${classe.motivosRede[0]}`);
  if (ehCategoriaDeGrandePorte(lead.categoria)) return negar("Ramo de grande porte");

  const encaixe = avaliarSistema(lead);
  if (!encaixe.serve) return negar("Nenhuma solução da ICG Tech se encaixa no ramo");

  /**
   * C e D ficam de fora por decisão explícita: esforço de enriquecimento é
   * caro (consulta externa, e às vezes paga) e só se justifica onde existe
   * venda provável. Sobrar lead na base não custa nada; procurar o telefone de
   * todos, sim.
   */
  if (potencial !== "A" && potencial !== "B") {
    return negar(`Qualidade potencial ${potencial} — não compensa o esforço`);
  }

  const forte = encaixe.modulos.length >= MODULOS_POTENCIAL_FORTE;
  const ordem: 1 | 2 | 3 | 4 =
    potencial === "A" ? (forte ? 1 : 3) : forte ? 2 : 4;

  return {
    precisa: true,
    prioridade: ordem <= 2 ? "alta" : ordem === 3 ? "media" : "baixa",
    motivo:
      `Lead ${potencial} com ${forte ? "forte potencial" : "potencial"} de sistema ` +
      `(${encaixe.sistema.toLowerCase()}), mas sem telefone`,
    ordem,
    qualidadePotencial: potencial,
  };
}

// ══════════════════════════════ por que tantos D ══════════════════════════

export type MotivoGaveta =
  | "opt-out"
  | "ja-trabalhado"
  | "rede-ou-grande"
  | "sem-potencial-sistema"
  | "sem-telefone"
  | "inativo"
  | "duplicado"
  | "outros";

export const ROTULO_MOTIVO: Record<MotivoGaveta, string> = {
  "opt-out": "Pediu para não ser contatado",
  "ja-trabalhado": "Já trabalhado ou encerrado",
  "rede-ou-grande": "Rede, franquia ou ramo de grande porte",
  "sem-potencial-sistema": "Nenhum sistema se encaixa no ramo",
  "sem-telefone": "Sem telefone e sem Instagram",
  inativo: "Marcado como extinto no mapa",
  duplicado: "Possível duplicata de outro cadastro",
  outros: "Outros",
};

/**
 * POR QUE este lead caiu onde caiu.
 *
 * A ordem das checagens é a mesma de `prioridadeComercial`, e tem de ser: um
 * diagnóstico que devolvesse motivo diferente do que a gaveta de fato usou
 * seria pior que nenhum — mandaria consertar a coisa errada.
 *
 * Existe para o painel poder abrir "D — 840" em causas. Sem isso, 840 leads em
 * D parecem uma base ruim; com isso, ficam visíveis como "783 só precisam de
 * telefone", que é um problema com solução.
 */
export function motivoDaGaveta(
  lead: Lead,
  ctx: { possivelDuplicata?: boolean } = {},
): MotivoGaveta {
  if (lead.naoContatar) return "opt-out";
  const ENCERRADOS = ["sem-interesse", "ja-tem-sistema", "opt-out", "contato-invalido"];
  if (ENCERRADOS.includes(lead.etapa)) return "ja-trabalhado";

  const classe = classificarPorte(lead);
  if (classe.rede || ehCategoriaDeGrandePorte(lead.categoria)) return "rede-ou-grande";

  if (!validarTelefone(telefoneDoLead(lead)) && !lead.instagram) return "sem-telefone";
  if (!avaliarSistema(lead).serve) return "sem-potencial-sistema";

  const osm = lead.dadosOsm ?? {};
  if (Object.keys(osm).some((k) => /^(disused|abandoned|was|removed)/i.test(k))) return "inativo";
  if (ctx.possivelDuplicata) return "duplicado";
  return "outros";
}

/**
 * O lead tem WhatsApp CONFIRMADO?
 *
 * Confirmado significa provado: uma mensagem que realmente saiu para este
 * número, ou uma resposta que chegou dele. A Bridge recusa número sem conta,
 * então um envio concluído é evidência de verdade.
 *
 * Formato de celular NÃO entra aqui, em nenhuma hipótese. Celular é "possível
 * WhatsApp"; só o envio prova. Manter os dois separados é o que impede a tela
 * de prometer alcance que não existe.
 */
export function whatsappConfirmado(historico: {
  enviouComSucesso: boolean;
  recebeuResposta: boolean;
}): boolean {
  return historico.enviouComSucesso || historico.recebeuResposta;
}

/** Como o contato do lead deve aparecer na tela. Três estados, nunca dois. */
export type EstadoContato = "confirmado" | "possivel-celular" | "telefone" | "sem-contato";

export function estadoDoContato(lead: Lead, confirmado: boolean): EstadoContato {
  if (confirmado) return "confirmado";
  const tel = validarTelefone(telefoneDoLead(lead));
  if (!tel) return "sem-contato";
  return tel.tipo === "celular" ? "possivel-celular" : "telefone";
}

export const ROTULO_CONTATO: Record<EstadoContato, string> = {
  confirmado: "🟢 WhatsApp confirmado",
  "possivel-celular": "📱 possível celular",
  telefone: "📞 telefone",
  "sem-contato": "🔎 precisa telefone",
};
