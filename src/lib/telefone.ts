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

/**
 * Confere se o número está pronto para o WhatsApp, com DDI.
 *
 * Nasceu de um caso real: o teste de envio recebeu `34998742209` e reportou
 * SUCESSO. O provedor aceitou, mas sem o `55` na frente o WhatsApp lê `34`
 * como código da Espanha — a mensagem saiu para um número que não existe e
 * ninguém percebeu, porque o envio "funcionou".
 *
 * NÃO corrige sozinho. Devolve a sugestão para você confirmar: acrescentar
 * DDI por conta própria é o mesmo tipo de suposição que manda mensagem para
 * a pessoa errada.
 */
export type NumeroParaEnvio =
  | { ok: true; numero: string }
  | { ok: false; erro: string; sugestao?: string };

export function prepararNumero(bruto?: string | null): NumeroParaEnvio {
  const d = String(bruto ?? "").replace(/\D/g, "");

  if (d.length < 10) {
    return { ok: false, erro: "Número curto demais para ser um telefone." };
  }

  // Já tem DDI do Brasil e um DDD válido: pode ir.
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    const ddd = Number(d.slice(2, 4));
    if (!DDDS_VALIDOS.has(ddd)) {
      return { ok: false, erro: `DDD ${ddd} não existe no Brasil.` };
    }
    return { ok: true, numero: d };
  }

  // 10 ou 11 dígitos com DDD válido: falta só o 55.
  if (d.length === 10 || d.length === 11) {
    const ddd = Number(d.slice(0, 2));
    if (DDDS_VALIDOS.has(ddd)) {
      return {
        ok: false,
        erro: `Falta o código do país. Sem o 55, o WhatsApp lê "${d.slice(0, 2)}" como país estrangeiro e a mensagem não chega.`,
        sugestao: `55${d}`,
      };
    }
    return { ok: false, erro: `DDD ${ddd} não existe no Brasil.` };
  }

  // Outros tamanhos podem ser número de fora — não bloqueia, mas avisa.
  return {
    ok: true,
    numero: d,
  };
}

type ClasseTelefoneBR = "celular" | "fixo" | "outro";

/**
 * Fonte única da regra "isto é um celular brasileiro, e quais são as formas
 * equivalentes dele com/sem o nono dígito?". Tanto `variantesTelefoneBR`
 * (usada na BUSCA por lead) quanto `normalizarTelefoneParaComparacao` (usada
 * na COMPARAÇÃO de dois números) partem daqui — duas cópias da mesma regra
 * divergem cedo ou tarde, e a que divergir é a que perde a resposta do lead.
 *
 * Exige DDI 55 + DDD real (reaproveita `DDDS_VALIDOS`, a mesma lista que já
 * valida cadastro de lead) + o dígito extra exatamente na posição do nono
 * dígito do celular. Fixo nunca ganha variante: não existe "nono dígito de
 * fixo", então tratar como se tivesse inventaria uma equivalência que não
 * existe no mundo real.
 */
function classificarBR(d: string): { classe: ClasseTelefoneBR; variantes: string[] } {
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);

    if (DDDS_VALIDOS.has(Number(ddd))) {
      // 9 dígitos com o nono explícito: a variante sem ele é o mesmo celular.
      if (resto.length === 9 && resto.startsWith("9")) {
        return { classe: "celular", variantes: [d, `55${ddd}${resto.slice(1)}`] };
      }
      // 8 dígitos já sem o nono, mas no padrão de celular (começa 6-9).
      if (resto.length === 8 && /^[6-9]/.test(resto)) {
        return { classe: "celular", variantes: [d, `55${ddd}9${resto}`] };
      }
      // 8 dígitos começando 2-5: fixo. Sem variante.
      if (resto.length === 8) {
        return { classe: "fixo", variantes: [d] };
      }
    }
  }

  return { classe: "outro", variantes: [d] };
}

/**
 * Todas as formas de dígitos que representam o MESMO celular brasileiro — a
 * que veio e a alternativa com/sem o nono dígito. Fora do padrão de celular
 * BR reconhecido (DDI diferente de 55, tamanho fora do esperado, DDD
 * inexistente, fixo), devolve só a própria sequência: sem heurística.
 *
 * NÃO altera nada gravado — serve só para buscar no banco todas as formas
 * que o mesmo número pode assumir.
 */
export function variantesTelefoneBR(bruto?: string | null): string[] {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return [];
  return classificarBR(d).variantes;
}

/**
 * Chave determinística para "é o mesmo número BR?", ignorando a presença do
 * nono dígito do celular.
 *
 * `cel:`/`fixo:` na frente garantem que um fixo e um celular NUNCA colidem
 * entre si mesmo se os dígitos coincidirem depois de remover DDI/DDD; um
 * número fora do padrão BR reconhecido não leva prefixo nenhum (só dígitos),
 * o que também nunca colide com uma chave prefixada — e por isso só bate por
 * igualdade exata, nunca por comparação parcial.
 */
export function normalizarTelefoneParaComparacao(bruto?: string | null): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return "";

  const { classe, variantes } = classificarBR(d);
  if (classe === "outro") return d;

  const canonica = variantes.reduce((a, b) => (a.length <= b.length ? a : b));
  return `${classe === "fixo" ? "fixo" : "cel"}:${canonica}`;
}

/** Duas strings de telefone (em qualquer formatação) são o mesmo número BR? */
export function mesmoTelefone(a?: string | null, b?: string | null): boolean {
  const na = normalizarTelefoneParaComparacao(a);
  const nb = normalizarTelefoneParaComparacao(b);
  return na !== "" && na === nb;
}
