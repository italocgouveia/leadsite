import { filtrosParaNicho } from "./tags";

/**
 * Busca de negócios no OpenStreetMap — 100% grátis, sem chave e sem cartão.
 *
 * Duas APIs públicas, ambas abertas:
 *  - Nominatim: transforma "Uberlândia, MG" em uma área do OSM
 *  - Overpass: busca elementos com determinadas tags dentro daquela área
 *
 * TRADE-OFF HONESTO vs. Google Places:
 *  - Cobertura menor. Negócio pequeno de bairro muitas vezes não está mapeado.
 *  - NÃO existe nota nem número de avaliações. O score perde o sinal mais forte
 *    (negócio movimentado), então se apoia mais em telefone e completude.
 *  - Nem todo estabelecimento tem `phone` ou `website` preenchido.
 *  - Em compensação: sem custo, sem cota e sem cadastro.
 *
 * As duas APIs são mantidas por voluntários. Respeite os limites: Nominatim
 * pede no máximo 1 req/s e User-Agent identificando a aplicação.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/**
 * O Overpass é comunitário e devolve 429/504 com frequência em horário de pico
 * (peguei os dois testando). Os espelhos são independentes — tentamos em ordem.
 */
const ESPELHOS_OVERPASS = [
  // Ordem por confiabilidade medida em 19/08/2026: só o primeiro respondeu 200;
  // kumi devolveu 502 em 72s, private.coffee 500 em 57s, mail.ru 504 em 38s.
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const USER_AGENT = "LeadSite/1.0 (ferramenta pessoal de prospeccao)";

export type LugarOsm = {
  osmId: string;
  nome: string;
  categoria?: string;
  endereco?: string;
  bairro?: string;
  telefone?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  email?: string;
  /** Horário real mapeado no OSM — alimenta a seção de horários do site. */
  horarios?: string;
  /** Tags descritivas cruas, pra você conhecer o negócio antes de abordar. */
  extras?: Record<string, string>;
  lat?: number;
  lng?: number;
};

export type BuscaOsmParams = {
  nicho: string;
  cidade: string;
  estado: string;
  bairro?: string;
  quantidade?: number;
  /**
   * Devolver só quem tem telefone, Instagram ou e-mail.
   *
   * Medido em Uberlândia: 1.263 estabelecimentos mapeados, ~10% com contato.
   * Pedir 20 e torcer devolvia 2 aproveitáveis. Pedindo muito e filtrando,
   * as 20 vagas vão todas para leads que dá pra abordar.
   */
  soContataveis?: boolean;
};

export type BuscaOsmResultado = {
  lugares: LugarOsm[];
  /** true quando o nicho não bateu no mapa de tags e caímos na busca por nome. */
  buscaPorNome: boolean;
  /** Quantos existem mapeados no total — mostra o tamanho real do mercado. */
  totalEncontrado: number;
  /** Quantos desses dá pra abordar. */
  totalContatavel: number;
};

type AreaOsm = { tipo: "area"; areaId: number } | { tipo: "raio"; lat: number; lng: number };

/** Nominatim: descobre a área (cidade) ou o ponto central (bairro). */
async function localizar(
  cidade: string,
  estado: string,
  bairro?: string,
): Promise<AreaOsm> {
  const consulta = bairro?.trim()
    ? `${bairro}, ${cidade}, ${estado}, Brasil`
    : `${cidade}, ${estado}, Brasil`;

  const url = `${NOMINATIM}?q=${encodeURIComponent(consulta)}&format=json&limit=1&countrycodes=br`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
    next: { revalidate: 60 * 60 * 24 * 7 },
  });

  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);

  const dados = (await res.json()) as Array<{
    osm_type: string;
    osm_id: number;
    lat: string;
    lon: string;
  }>;

  if (!dados.length) {
    throw new Error(`Não encontrei "${consulta}" no OpenStreetMap`);
  }

  const lugar = dados[0];

  // Com bairro usamos raio: o polígono de bairro no OSM é irregular e
  // frequentemente nem existe. 2km cobre um bairro típico.
  if (bairro?.trim()) {
    return { tipo: "raio", lat: Number(lugar.lat), lng: Number(lugar.lon) };
  }

  // Área do Overpass = offset por tipo + id do OSM. Relação é o caso da cidade.
  if (lugar.osm_type === "relation") {
    return { tipo: "area", areaId: 3600000000 + lugar.osm_id };
  }
  if (lugar.osm_type === "way") {
    return { tipo: "area", areaId: 2400000000 + lugar.osm_id };
  }

  return { tipo: "raio", lat: Number(lugar.lat), lng: Number(lugar.lon) };
}

function montarConsulta(nicho: string, area: AreaOsm, limite: number): {
  ql: string;
  buscaPorNome: boolean;
} {
  const filtros = filtrosParaNicho(nicho);
  const escopo =
    area.tipo === "area" ? "(area.busca)" : `(around:2500,${area.lat},${area.lng})`;

  const corpo = filtros
    ? filtros
        .map((f) => `  nwr["${f.chave}"="${f.valor}"]${f.extra ?? ""}${escopo};`)
        .join("\n")
    : // Sem tag conhecida: procura o texto no nome. Traz menos, mas traz algo.
      `  nwr["name"~"${nicho.replace(/["\\]/g, "")}",i]${escopo};`;

  const cabecalho =
    area.tipo === "area"
      ? `[out:json][timeout:60];\narea(${area.areaId})->.busca;\n(`
      : `[out:json][timeout:60];\n(`;

  return {
    ql: `${cabecalho}\n${corpo}\n);\nout center tags ${limite};`,
    buscaPorNome: !filtros,
  };
}

type ElementoOverpass = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Um lead sem nenhum canal de contato não dá pra abordar. */
function temContato(l: LugarOsm): boolean {
  return Boolean(l.telefone || l.instagram || l.email || l.facebook);
}

export async function buscarNoOsm({
  nicho,
  cidade,
  estado,
  bairro,
  quantidade = 20,
  soContataveis = true,
}: BuscaOsmParams): Promise<BuscaOsmResultado> {
  const area = await localizar(cidade, estado, bairro);

  /**
   * Pede MUITO mais do que precisa.
   *
   * Só ~10% dos estabelecimentos mapeados têm contato. Pedindo 80 pra entregar
   * 20, as vagas iam quase todas pra lead que não dá pra abordar — e a busca
   * parecia inútil. Pedindo 600 e filtrando, as 20 vagas ficam com quem tem
   * telefone ou Instagram. O custo é zero: o Overpass cobra por consulta, não
   * por resultado.
   */
  const limite = soContataveis ? 600 : quantidade * 4;
  const { ql, buscaPorNome } = montarConsulta(nicho, area, limite);

  const dados = await consultarOverpass(ql);

  const todos: LugarOsm[] = [];
  const vistos = new Set<string>();

  for (const el of dados.elements ?? []) {
    const tags = el.tags ?? {};
    const nome = tags.name?.trim();
    if (!nome) continue; // sem nome não serve de lead

    // O mesmo negócio pode aparecer como nó E como polígono. Dedup por nome.
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    todos.push({
      osmId: `${el.type}/${el.id}`,
      nome,
      categoria: tags.shop ?? tags.amenity ?? tags.office ?? tags.leisure ?? tags.healthcare,
      endereco: montarEndereco(tags),
      bairro: tags["addr:suburb"] ?? tags["addr:neighbourhood"],
      telefone:
        tags.phone ??
        tags["contact:phone"] ??
        tags["contact:mobile"] ??
        tags.mobile ??
        tags["phone:mobile"],
      website: tags.website ?? tags["contact:website"] ?? urlDeRedeSocial(tags),
      instagram: urlDoInstagram(tags),
      facebook: urlDoFacebook(tags),
      email: tags.email ?? tags["contact:email"],
      horarios: legivelHorario(tags.opening_hours),
      extras: extrasUteis(tags),
      lat: el.lat ?? el.center?.lat,
      lng: el.lon ?? el.center?.lon,
    });
  }

  // Contatáveis primeiro; entre eles, quem tem cadastro mais completo na frente.
  const ordenados = [...todos].sort((a, b) => pontos(b) - pontos(a));
  const filtrados = soContataveis ? ordenados.filter(temContato) : ordenados;

  return {
    lugares: filtrados.slice(0, quantidade),
    buscaPorNome,
    totalEncontrado: todos.length,
    totalContatavel: todos.filter(temContato).length,
  };
}

/** Ordena por quão trabalhável é o lead, não por ordem do Overpass. */
function pontos(l: LugarOsm): number {
  return (
    (l.telefone ? 10 : 0) +
    (l.instagram ? 6 : 0) +
    (l.email ? 2 : 0) +
    (l.facebook ? 1 : 0) +
    (l.endereco ? 2 : 0) +
    (l.horarios ? 1 : 0)
  );
}

/** Espelho morto pode demorar mais de 70s pra devolver o erro. Cortamos antes. */
const TIMEOUT_ESPELHO_MS = 28_000;

/**
 * Tenta cada espelho em ordem; só desiste quando todos falham.
 *
 * Três coisas aprendidas quebrando na prática:
 *
 * 1. Trocar de espelho em QUALQUER 5xx. A versão anterior só trocava em 429 e
 *    504 — um 502 fazia o código desistir de cara, mesmo com espelhos saudáveis
 *    na fila. Foi exatamente o erro que apareceu em uso real.
 *
 * 2. Timeout por espelho. Medindo os espelhos: um devolveu 502 depois de 72s e
 *    outro 500 depois de 57s. Sem corte, uma busca podia gastar mais de dois
 *    minutos só coletando erros antes de tentar o espelho que funciona.
 *
 * 3. NÃO repetir em 4xx. Erro 400 é consulta malformada nossa — insistir em
 *    outro servidor só perde tempo e dá a mensagem errada pro usuário.
 */
async function consultarOverpass(ql: string): Promise<{ elements?: ElementoOverpass[] }> {
  const falhas: string[] = [];

  for (const url of ESPELHOS_OVERPASS) {
    const host = new URL(url).host;
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_ESPELHO_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(ql)}`,
        signal: controle.signal,
      });

      if (res.ok) return (await res.json()) as { elements?: ElementoOverpass[] };

      falhas.push(`${host} ${res.status}`);

      // 4xx (fora do 429) é problema da nossa consulta: outro espelho repete.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(
          `A consulta ao OpenStreetMap foi recusada (HTTP ${res.status}). Tente outro nicho ou cidade.`,
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("A consulta")) throw e;
      const abortou = e instanceof Error && e.name === "AbortError";
      falhas.push(`${host} ${abortou ? "sem resposta" : "fora do ar"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `Nenhum servidor do OpenStreetMap respondeu (${falhas.join(", ")}). ` +
      `Eles são mantidos por voluntários e caem com frequência — tente de novo em 1 minuto.`,
  );
}

function montarEndereco(tags: Record<string, string>): string | undefined {
  const rua = tags["addr:street"];
  const numero = tags["addr:housenumber"];
  const bairro = tags["addr:suburb"] ?? tags["addr:neighbourhood"];
  const cidade = tags["addr:city"];

  const partes = [
    rua && numero ? `${rua}, ${numero}` : rua,
    bairro,
    cidade,
  ].filter(Boolean);

  return partes.length ? partes.join(" - ") : undefined;
}

/**
 * Tags descritivas que ajudam a entender o negócio.
 * Medidas em 1.093 estabelecimentos de Uberlândia: cuisine 11%, brand 15%,
 * operator 5%, formas de pagamento 3%, CEP 19%.
 */
const CHAVES_EXTRA = [
  "cuisine",
  "brand",
  "operator",
  "description",
  "note",
  "addr:postcode",
  "addr:street",
  "addr:housenumber",
  "wheelchair",
  "takeaway",
  "delivery",
  "outdoor_seating",
  "air_conditioning",
  "internet_access",
  "smoking",
  "drive_through",
  "opening_hours",
  "level",
  "building:levels",
];

function extrasUteis(tags: Record<string, string>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const k of CHAVES_EXTRA) if (tags[k]) saida[k] = tags[k];
  // payment:* vira uma lista só, senão poluiria com 8 chaves separadas.
  const pagamentos = Object.keys(tags)
    .filter((k) => k.startsWith("payment:") && tags[k] === "yes")
    .map((k) => k.replace("payment:", ""));
  if (pagamentos.length) saida.pagamento = pagamentos.join(", ");
  return saida;
}

export function urlDoFacebook(tags: Record<string, string>): string | undefined {
  const bruto = tags["contact:facebook"] ?? tags.facebook;
  if (!bruto) return undefined;
  return bruto.startsWith("http") ? bruto : `https://facebook.com/${bruto}`;
}

/**
 * `opening_hours` do OSM vem em formato técnico ("Tu-Sa 09:00-19:00").
 * Traduz pro que um brasileiro escreveria, porque esse texto vai direto pro
 * site gerado. Se o formato for exótico demais, devolve null — melhor sem
 * horário do que com horário errado.
 */
export function legivelHorario(bruto?: string): string | undefined {
  if (!bruto || bruto === "24/7") return bruto === "24/7" ? "Aberto 24 horas" : undefined;

  const DIAS: Record<string, string> = {
    Mo: "segunda",
    Tu: "terça",
    We: "quarta",
    Th: "quinta",
    Fr: "sexta",
    Sa: "sábado",
    Su: "domingo",
  };

  // Aceita só o caso simples e comum: "Tu-Sa 09:00-19:00".
  const m = bruto.match(/^([A-Z][a-z])-([A-Z][a-z])\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (m && DIAS[m[1]] && DIAS[m[2]]) {
    return `${DIAS[m[1]]} a ${DIAS[m[2]]}, das ${m[3].replace(":00", "h")} às ${m[4].replace(":00", "h")}`;
  }

  return undefined;
}

/**
 * Instagram fica em campo próprio, não misturado no website.
 *
 * Um negócio com Instagram ativo e sem site é o lead ideal: já entendeu que
 * precisa de presença online, já produz conteúdo, e ainda não tem onde
 * converter. É o discurso de venda mais fácil que existe.
 */
function urlDoInstagram(tags: Record<string, string>): string | undefined {
  const bruto = tags["contact:instagram"] ?? tags.instagram;
  if (!bruto) return undefined;
  if (bruto.startsWith("http")) return bruto;
  return `https://instagram.com/${bruto.replace(/^@/, "")}`;
}

/**
 * OSM guarda perfil social em tag própria. Isso é ouro aqui: um negócio com
 * `contact:instagram` e sem `website` é exatamente o lead que você quer.
 */
function urlDeRedeSocial(tags: Record<string, string>): string | undefined {
  const ig = tags["contact:instagram"];
  if (ig) return ig.startsWith("http") ? ig : `https://instagram.com/${ig.replace(/^@/, "")}`;

  const fb = tags["contact:facebook"];
  if (fb) return fb.startsWith("http") ? fb : `https://facebook.com/${fb}`;

  return undefined;
}

/** Link do Maps mesmo sem Google: coordenada abre em qualquer app. */
export function linkMapa(lugar: LugarOsm): string | undefined {
  if (lugar.lat == null || lugar.lng == null) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${lugar.lat},${lugar.lng}`;
}
