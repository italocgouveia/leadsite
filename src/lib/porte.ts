import type { Lead } from "@/lib/db/schema";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";
import { nichoPrioritario } from "@/lib/nichos-locais";

/**
 * Que tamanho tem este negócio — e, principalmente, o que NÃO se sabe.
 *
 * A REGRA QUE MANDA AQUI: porte só recebe um valor quando existe PROVA.
 *
 * O OpenStreetMap não publica faturamento, número de funcionários nem porte da
 * Receita. Então, para a esmagadora maioria dos leads, a resposta honesta é
 * `desconhecido` — e é isso que este módulo devolve. Preencher "microempresa"
 * porque o lead parece pequeno seria inventar um dado oficial, e quem lê a
 * tela não teria como saber que foi chute.
 *
 * O que existe de verdade é prova para o lado GRANDE: uma tag `brand` no mapa,
 * um nome de rede nacional, um sufixo societário de capital aberto. Ninguém
 * cria uma rede por acidente — esses sinais são afirmativos, e por isso o
 * único porte que este arquivo declara sozinho é `grande`.
 *
 * Os sinais de pequeno vêm separados, em `sinais`, e são explicitamente
 * HIPÓTESE. O score pode usá-los para priorizar; a tela mostra "porte
 * desconhecido" do mesmo jeito. Essa separação é o assunto inteiro deste
 * arquivo: priorizar por indício é legítimo, afirmar por indício não é.
 */

export type Porte = "mei" | "micro" | "pequena" | "media" | "grande" | "desconhecido";

/**
 * O porte SUPOSTO a partir de indícios. Nunca vira `porte`.
 *
 * A diferença entre os dois campos é a coisa mais importante deste arquivo:
 *
 *   `porte`          o que se SABE. Só recebe valor com prova, e por isso é
 *                    `desconhecido` para quase toda a base.
 *   `porteEstimado`  o que se SUPÕE, a partir de sinais observáveis. Serve
 *                    para ordenar a fila e nada mais.
 *
 * A tela mostra os dois com rótulos diferentes ("porte não informado" x
 * "parece pequeno"), justamente para ninguém ler a estimativa como cadastro.
 */
export type PorteEstimado = "pequeno" | "medio" | "grande" | "desconhecido";

export type Classificacao = {
  porte: Porte;
  /** De onde veio o porte. `nenhuma` sempre acompanha `desconhecido`. */
  fonte: "receita" | "rede-identificada" | "nenhuma";
  /** É rede, franquia ou corporação? Peso negativo forte no score. */
  rede: boolean;
  /** Por que foi considerado rede. Vazio quando não é. */
  motivosRede: string[];
  /** Indícios de negócio pequeno. HIPÓTESE, nunca afirmação de porte. */
  sinais: string[];
  /** Palpite de tamanho a partir dos indícios. Nunca é dado oficial. */
  porteEstimado: PorteEstimado;
  /** As evidências que sustentam o palpite, para a tela poder mostrar. */
  evidenciasPorte: string[];
};

/**
 * Redes, franquias e marcas nacionais que aparecem em cidade do interior.
 *
 * Casamento por palavra inteira no nome (ver `contemMarca`), nunca por
 * substring solta: "Bob's" não pode casar dentro de "Bobinas do Zé", e
 * "Oi" dentro de "Oficina" derrubaria meia base para prioridade C.
 */
const REDES = [
  // bancos e cooperativas
  "banco do brasil", "bradesco", "itau", "itaú", "santander", "caixa economica",
  "caixa econômica", "sicoob", "sicredi", "banco inter", "nubank", "safra", "btg",
  // telecom
  "vivo", "claro", "tim", "oi fibra", "algar telecom",
  // supermercado e atacado
  "carrefour", "assai", "assaí", "atacadao", "atacadão", "pao de acucar",
  "pão de açúcar", "extra hipermercado", "bahamas", "bretas", "supermercados bh",
  "makro", "tenda atacado", "sam's club",
  // farmácia
  "drogaria araujo", "drogaria araújo", "drogasil", "droga raia", "pague menos",
  "ultrafarma", "pacheco", "farmacias sao joao",
  // varejo
  "casas bahia", "magazine luiza", "magalu", "americanas", "renner", "riachuelo",
  "c&a", "marisa", "havan", "centauro", "decathlon", "leroy merlin", "telha norte",
  // alimentação
  "mcdonald", "burger king", "bob's", "bobs", "subway", "habib's", "habibs",
  "giraffas", "spoleto", "china in box", "outback", "madero", "coco bambu",
  "pizza hut", "domino's", "dominos", "kfc", "starbucks", "cacau show",
  "chocolates brasil cacau", "kopenhagen", "sodie doces", "casa do pao de queijo",
  "casa do pão de queijo", "divino fogao", "divino fogão",
  // beleza e moda
  "o boticario", "o boticário", "natura", "avon", "jequiti", "chilli beans",
  "otica diniz", "ótica diniz", "oticas carol", "óticas carol",
  // academias
  "smart fit", "smartfit", "bodytech", "bluefit", "selfit", "panobianco",
  // educação
  "kumon", "wizard", "ccaa", "fisk", "cna", "yazigi", "yázigi", "microlins",
  "senai", "senac", "sesi", "sesc", "sebrae", "uniube", "ufu", "pitagoras",
  "pitágoras", "estacio", "estácio", "unopar", "anhanguera", "kroton",
  // saúde
  "unimed", "hapvida", "amil", "uniodonto", "odontocompany", "sorridents",
  "oral unic", "imperial odonto", "clinicas doutor",
  // automotivo e locação
  "localiza", "movida", "unidas", "bosch car service", "jeep", "chevrolet",
  "volkswagen", "toyota", "hyundai", "fiat", "renault", "honda automoveis",
  // pet e outros
  "petz", "cobasi", "petland", "correios", "shopping center",
];

/**
 * Sufixos e palavras que denunciam estrutura corporativa de verdade.
 *
 * A sigla "S/A" é tratada à parte, com delimitadores explícitos em vez de
 * `\b`. Motivo medido: o `\b` do JavaScript é ASCII, então em "Instituto de
 * Saúde Ocular" ele enxerga uma fronteira entre "Sa" e "úde" e o padrão antigo
 * (`s\.?\/?a\.?`) casava dentro da palavra "Saúde" — uma clínica de olhos
 * virava "corporação" e caía para prioridade C.
 */
const SOCIEDADE_ANONIMA = /(^|[\s\-.,])(s\/a|s\.a\.?|sa)([\s\-.,]|$)/i;

const CORPORATIVO =
  /\b(sociedade an[oô]nima|holding|corpora[çc][ãa]o|corporation|incorporad|group|grupo empresarial|multinacional|ind[uú]stria e com[ée]rcio de)\b/i;

/** As duas formas juntas, que é como o resto do arquivo pergunta. */
function pareceCorporacao(texto: string): boolean {
  return CORPORATIVO.test(texto) || SOCIEDADE_ANONIMA.test(texto);
}

/**
 * Categorias que praticamente não existem em versão "negócio de bairro".
 * Não são prova de porte sozinhas, mas somadas a nome de rede fecham o caso.
 */
const CATEGORIA_GRANDE =
  /\b(bank|supermarket|hypermarket|mall|department_store|hospital|university|college|car(?!_repair|_parts|_wash)|fuel|cinema|stadium|wholesale|government|townhall|courthouse|prison|police)\b/i;

/**
 * O ramo em si já é de grande porte?
 *
 * Separado de `ehRede` porque responde outra pergunta: não é "pertence a uma
 * rede", é "este tipo de negócio não existe em versão de bairro". Banco,
 * hospital, universidade e órgão público não compram sistema do jeito que uma
 * oficina compra — a decisão passa por licitação ou por matriz.
 */
export function ehCategoriaDeGrandePorte(categoria?: string | null): boolean {
  return CATEGORIA_GRANDE.test(categoria ?? "");
}

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * A marca aparece no nome como palavra, não como pedaço de outra palavra.
 *
 * Sem a checagem de fronteira, "tim" casaria em "Ótica Timóteo" e "oi" em
 * "Oficina" — e cada falso positivo aqui manda um lead bom para o fim da fila.
 */
function contemMarca(nome: string, marca: string): boolean {
  const alvo = semAcento(nome);
  const m = semAcento(marca).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${m}([^a-z0-9]|$)`, "i").test(alvo);
}

/** O lead é de uma rede/franquia/corporação? Só com evidência. */
export function ehRede(lead: Pick<Lead, "nome" | "categoria" | "dadosOsm" | "razaoSocial">): {
  rede: boolean;
  motivos: string[];
} {
  const motivos: string[] = [];
  const nome = lead.nome ?? "";

  const marca = REDES.find((m) => contemMarca(nome, m));
  if (marca) motivos.push(`rede nacional (${marca})`);

  /**
   * `brand` e `operator` do OSM só contam quando apontam para uma rede
   * CONHECIDA. Sozinhas elas não provam nada, e medir na base deixou isso
   * evidente:
   *
   *  - `operator` costuma trazer a razão social do próprio negócio. "Tatu
   *    Molas, Freios e Soldas" aparece operada por "Tatu Molas, Freios e
   *    Soldas" — uma oficina de bairro, não uma franquia.
   *  - `brand` costuma ser a marca que a loja VENDE. "Pneuara" com brand
   *    "Michelin" e "Guerra Moto Peças" com brand "Moura Baterias" são
   *    exatamente o pequeno comércio independente que esta base procura.
   *
   * Tratar essas tags como prova rebaixava 148 leads a prioridade C — e a
   * maioria era o alvo, não o ruído. Petz, Cobasi e Óticas Carol continuam
   * detectados, porque o nome delas está na lista curada acima.
   */
  const osm = lead.dadosOsm ?? {};
  const redeNaTag = [osm.brand, osm.operator]
    .filter(Boolean)
    .map((v) => REDES.find((m) => contemMarca(v as string, m)))
    .find(Boolean);
  if (redeNaTag && !marca) motivos.push(`rede nacional no mapa (${redeNaTag})`);

  if (pareceCorporacao(nome) || (lead.razaoSocial && pareceCorporacao(lead.razaoSocial))) {
    motivos.push("estrutura societária de capital aberto no nome");
  }

  if (CATEGORIA_GRANDE.test(lead.categoria ?? "")) {
    motivos.push(`categoria de grande porte (${lead.categoria})`);
  }

  return { rede: motivos.length > 0, motivos };
}

/**
 * Indícios de negócio pequeno. HIPÓTESE — nunca vira porte declarado.
 *
 * Cada item é verificável no cadastro: ou o campo está lá, ou não está. Não há
 * item de "parece pequeno".
 */
function sinaisDePequeno(lead: Lead): string[] {
  const sinais: string[] = [];

  /**
   * Independente = não caiu em nenhuma evidência de rede. Antes o teste era
   * "não tem tag `brand`", o que punia a loja de autopeças por informar qual
   * marca ela revende — o oposto do que se quer medir.
   */
  if (!ehRede(lead).rede) sinais.push("negócio independente");

  const tel = validarTelefone(telefoneDoLead(lead));
  if (tel?.tipo === "celular") {
    // Empresa grande atende em fixo com PABX; celular como telefone principal
    // é o padrão de quem atende do próprio aparelho.
    sinais.push("telefone principal é celular");
  }
  if (lead.instagram && !lead.website) sinais.push("presença só no Instagram");
  if (lead.endereco && !/shopping|centro comercial|mall/i.test(lead.endereco)) {
    sinais.push("endereço de rua");
  }
  if (nichoPrioritario(lead.categoria)) sinais.push("ramo de serviço local");

  /**
   * Nome de gente no nome do negócio: "Oficina do João", "Studio da Bella",
   * "Dr. Ana". É o jeito como profissional autônomo e empresa familiar se
   * nomeiam — rede nacional nunca faz isso.
   */
  if (/\b(d[oa]s?|dr\.?|dra\.?|studio|st[úu]dio|ateli[êe]|espa[çc]o|casa d[oa])\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(lead.nome ?? "")) {
    sinais.push("nome de profissional ou família");
  }

  return sinais;
}

/**
 * Classifica o porte do lead.
 *
 * Devolve `desconhecido` com convicção: é a resposta certa quando a fonte não
 * publica porte, e é o que impede a tela de exibir um dado oficial que ninguém
 * apurou.
 */
export function classificarPorte(lead: Lead): Classificacao {
  const { rede, motivos } = ehRede(lead);
  const sinais = sinaisDePequeno(lead);

  if (rede) {
    return {
      porte: "grande",
      fonte: "rede-identificada",
      rede: true,
      motivosRede: motivos,
      sinais,
      porteEstimado: "grande",
      evidenciasPorte: motivos,
    };
  }

  /**
   * A estimativa é uma contagem de indícios, não uma inferência sofisticada —
   * e é assim de propósito, porque cada indício é conferível na tela.
   *
   * Três ou mais sinais é "pequeno": telefone celular, endereço de rua, nome de
   * profissional e ramo de serviço local, juntos, descrevem um negócio que
   * atende do próprio balcão. Um ou dois sinais não sustentam palpite nenhum e
   * ficam em `desconhecido`, que continua sendo uma resposta legítima.
   *
   * `medio` nunca é atribuído por indício: não existe sinal gratuito que
   * separe médio de pequeno, e inventar essa fronteira daria à tela uma
   * precisão que o dado não tem.
   */
  const porteEstimado: PorteEstimado = sinais.length >= 3 ? "pequeno" : "desconhecido";

  return {
    porte: "desconhecido",
    fonte: "nenhuma",
    rede: false,
    motivosRede: [],
    sinais,
    porteEstimado,
    evidenciasPorte: sinais,
  };
}

export const ROTULO_PORTE_ESTIMADO: Record<PorteEstimado, string> = {
  pequeno: "Parece pequeno",
  medio: "Parece médio",
  grande: "Rede ou grande porte",
  desconhecido: "Tamanho indefinido",
};

export const ROTULO_PORTE: Record<Porte, string> = {
  mei: "MEI",
  micro: "Microempresa",
  pequena: "Pequena empresa",
  media: "Média empresa",
  grande: "Grande empresa / rede",
  desconhecido: "Porte não informado",
};

/**
 * O lead se comporta como pequeno negócio?
 *
 * É a pergunta que o painel realmente faz — "mostre os pequenos" — e ela é
 * respondível por indício, diferente de "qual é o porte dele". Rede nunca
 * passa, por mais sinais que acumule.
 */
export function pareceNegocioLocal(lead: Lead): boolean {
  const c = classificarPorte(lead);
  return !c.rede && c.sinais.length >= 2;
}
