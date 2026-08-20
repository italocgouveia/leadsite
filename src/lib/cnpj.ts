/**
 * CNPJ: validação, formatação e extração de texto solto.
 *
 * A validação de dígito verificador NÃO é enfeite aqui. Medido no HTML dos
 * sites dos leads reais: de 6 sequências de 14 dígitos encontradas, 5 eram
 * lixo — valores de CSS, coordenadas, ids concatenados. Sem os dígitos, o
 * sistema consultaria a Receita com número inventado e mostraria "não
 * encontrado" como se a empresa não existisse.
 */

/** Só os dígitos. */
export function limpar(cnpj: string): string {
  return String(cnpj).replace(/\D/g, "");
}

/** 12.345.678/0001-90 */
export function formatar(cnpj: string): string {
  const c = limpar(cnpj);
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

function digito(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function valido(cnpj: string): boolean {
  const c = limpar(cnpj);
  if (c.length !== 14) return false;
  // 00000000000000 passa na conta dos dígitos, mas não é CNPJ de ninguém.
  if (/^(\d)\1{13}$/.test(c)) return false;
  return (
    digito(c.slice(0, 12), PESOS_1) === Number(c[12]) &&
    digito(c.slice(0, 13), PESOS_2) === Number(c[13])
  );
}

/**
 * Acha CNPJs válidos dentro de um texto qualquer (o HTML de um site, por
 * exemplo). Aceita as formas pontuada e crua, e devolve só os que passam no
 * dígito verificador, sem repetição e na ordem em que apareceram.
 */
export function extrairDeTexto(texto: string): string[] {
  const padrao = /\b(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})\b/g;
  const achados = new Set<string>();

  for (const m of texto.matchAll(padrao)) {
    const c = m.slice(1).join("");
    if (valido(c)) achados.add(c);
  }

  return [...achados];
}
