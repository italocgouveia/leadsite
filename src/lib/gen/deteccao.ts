/**
 * Detectores de texto suspeito no HTML gerado.
 *
 * Separado de validar.ts porque aqui só tem expressão regular e nenhuma
 * dependência — dá pra testar isolado sem banco nem modelo.
 */

/** Só o texto visível — não queremos casar com nome de classe do Tailwind. */
export function textoVisivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Clichês de texto gerado por IA
// ---------------------------------------------------------------------------

const EXPRESSOES: { re: RegExp; rotulo: string }[] = [
  // Sem \b no fim: em JS o \b é ASCII, e "é" não conta como caractere de
  // palavra — a fronteira nunca casa depois de vogal acentuada.
  { re: /não é (apenas|só) .{2,40}?, é /i, rotulo: '"não é só X, é Y"' },
  { re: /\bmuito mais (que|do que)\b/i, rotulo: '"muito mais que"' },
  { re: /\bexcelência\b/i, rotulo: "excelência" },
  { re: /\bexperiência única\b/i, rotulo: "experiência única" },
  { re: /\bo melhor do mercado\b/i, rotulo: "o melhor do mercado" },
  { re: /\balto padrão\b/i, rotulo: "alto padrão" },
  { re: /\bsob medida\b/i, rotulo: "sob medida" },
  { re: /\bfeito com (amor|carinho)\b/i, rotulo: "feito com amor" },
  { re: /\bpaixão pelo que fazemos\b/i, rotulo: "paixão pelo que fazemos" },
  { re: /\bcuidado em cada detalhe\b/i, rotulo: "cuidado em cada detalhe" },
  {
    re: /\bsua satisfação é (a )?nossa (maior )?prioridade\b/i,
    rotulo: "satisfação é nossa prioridade",
  },
  { re: /\batendimento humanizado\b/i, rotulo: "atendimento humanizado" },
  { re: /\bque você (merece|exige)\b/i, rotulo: '"que você merece/exige"' },
  { re: /\bpronto para (transformar|começar|dar)\b/i, rotulo: "CTA em pergunta retórica" },
  { re: /\b(bora|que tal) (agendar|começar|marcar)\b/i, rotulo: "CTA em pergunta retórica" },
  { re: /\breferência (na região|no segmento)\b/i, rotulo: "referência na região" },
  { re: /\bsoluç(ão|ões) (inovadora|completa|personalizada)/i, rotulo: "soluções inovadoras" },
  { re: /\brituais? de\b/i, rotulo: '"ritual de…"' },
  { re: /\brealçar a beleza natural\b/i, rotulo: "realçar a beleza natural" },
];

export function detectarCliches(html: string): string[] {
  const texto = textoVisivel(html);
  const achados = new Set<string>();

  for (const { re, rotulo } of EXPRESSOES) {
    if (re.test(texto)) achados.add(rotulo);
  }

  // Estatística inventada — o lead não traz nenhum desses números.
  // Sem \b inicial: "+" não é caractere de palavra, então não há fronteira
  // entre o espaço anterior e o "+" de "+500".
  if (/(\+\s?\d{2,}|\d{2,}\+)\s*(clientes|anos|atendimentos|cortes)/i.test(texto)) {
    achados.add("estatística inventada");
  }
  if (/\b100%\s*(de\s*)?(satisfação|dedicação|qualidade|garantia)/i.test(texto)) {
    achados.add("estatística inventada (100%)");
  }

  // Etiqueta em CAIXA ALTA acima de seção: uma passa, três viram padrão.
  const etiquetas = html.match(
    /<(?:p|span|div|h[3-6])[^>]*>\s*[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ\s&]{7,40}\s*<\//g,
  );
  if (etiquetas && etiquetas.length >= 3) {
    achados.add(`${etiquetas.length} etiquetas em CAIXA ALTA acima das seções`);
  }

  return [...achados];
}

// ---------------------------------------------------------------------------
// Depoimento inventado
// ---------------------------------------------------------------------------

/**
 * O erro mais grave que o gerador pode cometer.
 *
 * Um site de referência que analisamos trazia três depoimentos assinados
 * ("Mariana, Uberlândia") rotulados como "cliente verificado" — todos criados
 * pelo modelo. Não existe um único depoimento real na base, então qualquer
 * citação atribuída a alguém é fabricação.
 */
const PADROES_DEPOIMENTO: RegExp[] = [
  /\bdepoimentos?\b/gi,
  /\bcliente\s+verificad[oa]\b/gi,
  /\bo que (?:os |nossos )?clientes (?:dizem|falam|acham)\b/gi,
  /\bavalia(?:ção|ções) (?:d[eo]s? )?client/gi,
  // citação entre aspas seguida de atribuição a um nome próprio
  /[“"][^"”]{25,240}[”"]\s*[—–-]?\s*[A-ZÁÂÃÉÊÍÓÔÕÚÇ][a-záâãéêíóôõúç]{2,}/g,
];

export function detectarDepoimentos(html: string): string[] {
  const texto = textoVisivel(html);
  const achados = new Set<string>();

  for (const re of PADROES_DEPOIMENTO) {
    for (const m of texto.matchAll(re)) {
      achados.add(m[0].trim().slice(0, 70));
    }
  }

  return [...achados];
}

// ---------------------------------------------------------------------------
// Horário de funcionamento inventado
// ---------------------------------------------------------------------------

/**
 * Nenhum lead traz horário — nem do OpenStreetMap, nem do Places (não pedimos
 * openingHours na FieldMask). Então QUALQUER dia ou faixa de horário no site
 * foi inventado pelo modelo. Entregar "de terça a sábado" para quem abre
 * segunda queima você na frente do cliente.
 */
const PADROES_HORARIO: RegExp[] = [
  // intervalo de dias: "de terça a sábado", "segunda à sexta"
  /(?:de\s+)?(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?\s*(?:a|à|até|-|–)\s*(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)/gi,
  // faixa de horas: "das 9h às 18h", "de 8:00 as 17:00"
  /(?:das|de)\s*\d{1,2}\s*(?:h|:\d{2})\s*(?:às|as|a|até|-|–)\s*\d{1,2}\s*(?:h|:\d{2})/gi,
  /\baberto\s+(?:de|das|todos os dias|diariamente|aos)/gi,
  /\bfuncionamos?\s+(?:de|das|todos os dias)/gi,
  /\bhor[áa]rio\s+de\s+(?:funcionamento|atendimento)/gi,
  /\batendemos\s+(?:de|das|aos|todos os dias)/gi,
];

export function detectarHorarios(html: string): string[] {
  const texto = textoVisivel(html);
  const achados = new Set<string>();

  for (const re of PADROES_HORARIO) {
    for (const m of texto.matchAll(re)) achados.add(m[0].trim());
  }

  return [...achados];
}
