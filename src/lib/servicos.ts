import type { Lead } from "@/lib/db/schema";
import { avaliar } from "@/lib/oportunidade";
import { avaliarSistema } from "@/lib/sistemas";

/**
 * O que você vende. A lista fechada, na sua linguagem.
 *
 * Existe separada de `oportunidade.ts` (que devolve "site" | "chatbot" |
 * "site-e-chatbot") porque são coisas diferentes: aquilo é o PALPITE do
 * sistema a partir do ramo e da presença online; isto é o CATÁLOGO do que
 * você oferece, e inclui coisas que nenhum dado do mapa consegue sugerir,
 * como loja virtual ou manutenção.
 *
 * A escolha salva no lead sempre vence o palpite. O sistema pode achar que
 * uma oficina precisa de site, mas se na conversa apareceu que a dor é ordem
 * de serviço, quem manda é o que você marcou.
 */

export const SERVICOS = [
  { valor: "site", rotulo: "Site institucional", curto: "Site" },
  { valor: "landing", rotulo: "Landing page", curto: "Landing" },
  { valor: "sistema", rotulo: "Sistema personalizado", curto: "Sistema" },
  { valor: "loja", rotulo: "Loja virtual", curto: "Loja" },
  { valor: "app", rotulo: "Aplicativo", curto: "App" },
  { valor: "automacao", rotulo: "Automação / IA", curto: "Automação" },
  { valor: "manutencao", rotulo: "Manutenção", curto: "Manutenção" },
  { valor: "outro", rotulo: "Outro", curto: "Outro" },
] as const;

export type Servico = (typeof SERVICOS)[number]["valor"];

export const VALORES_SERVICO = SERVICOS.map((s) => s.valor) as readonly string[];

export function rotuloServico(v?: string | null): string {
  return SERVICOS.find((s) => s.valor === v)?.curto ?? "—";
}

/**
 * O serviço a oferecer: sua escolha, ou o palpite do sistema.
 *
 * Devolve também `sugerido` para a tela poder mostrar a diferença — um
 * serviço que o sistema chutou não deve parecer uma decisão que você tomou.
 */
export function servicoDoLead(lead: Lead): { valor: Servico; sugerido: boolean } {
  if (lead.servico && VALORES_SERVICO.includes(lead.servico)) {
    return { valor: lead.servico as Servico, sugerido: false };
  }

  // Sistema tem motor próprio e é o encaixe mais forte quando o ramo bate.
  if (avaliarSistema(lead).serve) return { valor: "sistema", sugerido: true };

  const p = avaliar(lead).produto;
  if (p === "chatbot") return { valor: "automacao", sugerido: true };
  return { valor: "site", sugerido: true };
}
