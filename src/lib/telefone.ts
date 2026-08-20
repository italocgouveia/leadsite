/**
 * Validação de telefone brasileiro.
 *
 * A versão anterior só checava o comprimento, e passou um lead com
 * "+55 34 0 07710522" — que virou link de WhatsApp para um número inexistente.
 * Clicar e cair em "número inválido" na frente do cliente é o tipo de detalhe
 * que derruba a confiança na ferramenta inteira.
 *
 * Regra real do Brasil:
 *  - DDD de 11 a 99 (não existe DDD começando em 0 nem em 1 sozinho)
 *  - celular: 9 dígitos, começando obrigatoriamente com 9
 *  - fixo: 8 dígitos, começando de 2 a 5
 */

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37,
  38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66,
  67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

export type TelefoneValidado = {
  /** Só dígitos, com DDI: 5534991345424 */
  e164: string;
  /** Formatado para exibição: (34) 99134-5424 */
  formatado: string;
  tipo: "celular" | "fixo";
};

export function validarTelefone(bruto?: string | null): TelefoneValidado | null {
  if (!bruto) return null;

  let d = bruto.replace(/\D/g, "");

  // Remove DDI e o zero de operadora, se vierem.
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");

  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return null;

  const numero = d.slice(2);

  if (numero.length === 9) {
    // Celular precisa começar com 9. "007710522" cai fora aqui.
    if (!numero.startsWith("9")) return null;
    return {
      e164: `55${d}`,
      formatado: `(${d.slice(0, 2)}) ${numero.slice(0, 5)}-${numero.slice(5)}`,
      tipo: "celular",
    };
  }

  // Fixo: primeiro dígito entre 2 e 5.
  if (!/^[2-5]/.test(numero)) return null;
  return {
    e164: `55${d}`,
    formatado: `(${d.slice(0, 2)}) ${numero.slice(0, 4)}-${numero.slice(4)}`,
    tipo: "fixo",
  };
}

/**
 * Link do WhatsApp. Fixo também vira link: muito comércio usa WhatsApp Business
 * em número fixo, então vale tentar — mas só depois de o número ser válido.
 */
export function linkWhatsapp(telefone?: string | null): string | null {
  const v = validarTelefone(telefone);
  return v ? `https://wa.me/${v.e164}` : null;
}

/** Telefone limpo para exibição, ou null se o número for inválido. */
export function formatarTelefone(telefone?: string | null): string | null {
  return validarTelefone(telefone)?.formatado ?? null;
}
