/**
 * O que a ICG Tech vende, em ordem de prioridade comercial.
 *
 * Existe porque a prospecção deixou de ser "máquina de vender site". Site
 * continua no catálogo, mas é a ÚLTIMA opção — não a padrão. O que vende
 * melhor é resolver um processo que o dono faz na mão todo dia: agendar,
 * orçar, anotar pedido, confirmar reserva, cobrar quem sumiu.
 *
 * `prioridade` é o que a IA usa para desempatar quando mais de uma solução
 * caberia. Menor = tenta primeiro. Não é regra rígida: um lead sem nenhuma
 * presença digital pode legitimamente puxar site (prioridade 6) na frente de
 * um sistema, e o prompt diz isso explicitamente.
 */

export type IdSolucao =
  | "sistema-sob-medida"
  | "automacao-processo"
  | "chatbot-atendimento"
  | "sistema-gestao"
  | "catalogo-agendamento"
  | "site";

export type Solucao = {
  id: IdSolucao;
  /** Como aparece na prévia, para você entender a escolha da IA. */
  rotulo: string;
  prioridade: number;
  /** Como falar disso com o dono, na língua dele — não em termo técnico. */
  comoFalar: string;
};

export const SOLUCOES: Solucao[] = [
  {
    id: "sistema-sob-medida",
    rotulo: "Sistema sob medida",
    prioridade: 1,
    comoFalar:
      "um sistema feito para o jeito que ESSE negócio trabalha, resolvendo a tarefa manual específica do ramo",
  },
  {
    id: "automacao-processo",
    rotulo: "Automação de processo",
    prioridade: 2,
    comoFalar:
      "automatizar uma parte repetitiva do dia a dia — confirmação, lembrete, retorno de cliente que sumiu, aviso quando o serviço fica pronto",
  },
  {
    id: "chatbot-atendimento",
    rotulo: "Atendimento automático no WhatsApp",
    prioridade: 3,
    comoFalar:
      "um atendente no WhatsApp que responde na hora as perguntas repetidas de preço e horário, e chama uma pessoa quando precisa",
  },
  {
    id: "sistema-gestao",
    rotulo: "Sistema de gestão",
    prioridade: 4,
    comoFalar:
      "organizar cliente, histórico, financeiro e equipe num lugar só, no lugar de planilha e caderno",
  },
  {
    id: "catalogo-agendamento",
    rotulo: "Catálogo / agendamento / orçamento / pedidos",
    prioridade: 5,
    comoFalar:
      "uma página onde o cliente vê serviço ou cardápio e já agenda, pede ou fecha orçamento sozinho",
  },
  {
    id: "site",
    rotulo: "Site",
    prioridade: 6,
    comoFalar:
      "um site que funcione como canal de negócio — trazendo e organizando contato novo, não só uma vitrine bonita",
  },
];

export function solucaoPorId(id: string): Solucao | undefined {
  return SOLUCOES.find((s) => s.id === id);
}

/** Bloco pronto para entrar no prompt, já na ordem de prioridade. */
export function catalogoParaPrompt(): string {
  return SOLUCOES.map(
    (s) => `${s.prioridade}. [${s.id}] ${s.rotulo} — ${s.comoFalar}`,
  ).join("\n");
}
