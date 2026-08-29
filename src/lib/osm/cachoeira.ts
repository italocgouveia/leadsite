import {
  consultarOverpass,
  extrairLugares,
  localizarArea,
  type BuscaOsmResultado,
  type LugarOsm,
} from "./search";

/**
 * Hospedagem PERTO DE CACHOEIRA.
 *
 * A busca normal do sistema é por município: você digita "Capitólio" e ela
 * procura dentro daquele polígono. Isso não responde a pergunta certa aqui,
 * porque "chalé perto de cachoeira" não é uma questão de divisa municipal —
 * a cachoeira não respeita limite, e o chalé bom costuma ficar na estrada de
 * terra entre dois municípios pequenos que ninguém pensaria em digitar.
 *
 * Aqui a consulta é geográfica de verdade: acha TODAS as cachoeiras do
 * estado e devolve a hospedagem num raio delas. Medido em Minas Gerais: 901
 * cachoeiras mapeadas ancorando 355 hospedagens no entorno, das quais 94 com
 * contato — contra ~10 que uma lista curada de cidades turísticas achava.
 *
 * A TAG CERTA É `waterway=waterfall`.
 *
 * A primeira versão usou `natural=waterfall`, que soa como o nome óbvio e
 * devolve exatamente 1 resultado em Minas Gerais inteira, contra 901 da tag
 * correta. O sintoma foi cruel: HTTP 200, zero elementos, nenhum erro — a
 * busca parecia dizer "não há nada mapeado" quando na verdade estava
 * perguntando errado.
 */

/** Relação do Brasil no OSM (59470), no formato de área do Overpass. */
const AREA_BRASIL = 3600059470;

/** Tipos de hospedagem que sustentam o argumento de "reserva direta". */
const HOSPEDAGEM = ["chalet", "apartment", "guest_house"] as const;

export type BuscaCachoeiraParams = {
  /** Nome do estado por extenso, ex: "Minas Gerais". */
  estado: string;
  /** Distância máxima até uma cachoeira, em km. */
  raioKm?: number;
  quantidade?: number;
  soContataveis?: boolean;
};

export async function buscarPertoDeCachoeira({
  estado,
  raioKm = 15,
  quantidade = 60,
  soContataveis = true,
}: BuscaCachoeiraParams): Promise<BuscaOsmResultado> {
  const area = await localizarArea(`${estado}, Brasil`);

  if (area.tipo !== "area") {
    throw new Error(
      `"${estado}" não resolveu para uma área no OpenStreetMap. Use o nome do estado por extenso.`,
    );
  }

  const raio = Math.round(raioKm * 1000);

  /**
   * `timeout:240` é pedido AO OVERPASS, e é alto de propósito: cruzar 900
   * cachoeiras com um raio de 15km levou 40s em Minas. Com o timeout padrão
   * de 60s o servidor abortava a consulta sozinho e devolvia erro — que
   * pareceria "o estado não tem nada" para quem estivesse olhando a tela.
   *
   * O corte do nosso lado continua existindo em `consultarOverpass`.
   */
  /**
   * A hospedagem é limitada ao BRASIL, não ao estado.
   *
   * Não ao estado, porque o raio atravessar divisa é justamente o ponto: as
   * cachoeiras da Mantiqueira rendem pousadas em MG, SP e RJ ao mesmo tempo,
   * e recusar isso perderia lead bom por causa de uma linha no mapa.
   *
   * Mas sem NENHUM limite a fronteira internacional também é atravessada:
   * buscando o Paraná vieram cabanas de Porto Iguaçu, na Argentina, com
   * "Misiones" gravado como estado. `area.br` corta isso sem estreitar o
   * resto.
   */
  const ql = `[out:json][timeout:240];
area(${AREA_BRASIL})->.br;
area(${area.areaId})->.uf;
nwr["waterway"="waterfall"](area.uf)->.cach;
(
${HOSPEDAGEM.map((t) => `  nwr["tourism"="${t}"](around.cach:${raio})(area.br);`).join("\n")}
);
out center tags ${Math.max(quantidade * 10, 600)};`;

  const dados = await consultarOverpass(ql);
  const achados = extrairLugares(dados.elements ?? [], { quantidade, soContataveis });

  await completarMunicipio(achados.lugares);
  return achados;
}



const NOMINATIM_REVERSO = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "LeadSite/1.0 (ferramenta pessoal de prospeccao)";
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Descobre município e UF pelas coordenadas, para quem não tem `addr:city`.
 *
 * Medido em Minas Gerais: 52 dos 91 leads vieram sem a tag. Sem este passo
 * eles herdariam o nome do ESTADO como cidade, e a abordagem sairia
 * "procurando chalés aqui em Minas Gerais" — que qualquer dono de pousada lê
 * como mensagem automática, porque ninguém fala assim.
 *
 * Também corrige o estado. O raio de 15km em volta da cachoeira atravessa
 * divisa: buscando Minas vieram pousadas de Campos do Jordão e Itatiaia, que
 * são SP e RJ. Gravá-las como mineiras estragaria o filtro por estado.
 *
 * O Nominatim pede no máximo 1 requisição por segundo, e a etiqueta é levada
 * a sério — quem abusa é bloqueado por IP. Por isso o laço é serial com
 * pausa, e não `Promise.all`.
 */
async function completarMunicipio(lugares: LugarOsm[]): Promise<void> {
  const faltando = lugares.filter((l) => !l.cidade && l.lat != null && l.lng != null);

  for (const lugar of faltando) {
    try {
      const url = `${NOMINATIM_REVERSO}?lat=${lugar.lat}&lon=${lugar.lng}&format=json&zoom=10&addressdetails=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
      });
      if (res.ok) {
        const d = (await res.json()) as {
          address?: Record<string, string>;
        };
        const a = d.address ?? {};
        lugar.cidade = a.city ?? a.town ?? a.village ?? a.municipality ?? undefined;
        lugar.estado = a.state ?? undefined;
      }
    } catch {
      // Sem município continua sendo melhor que município errado: a mensagem
      // cai na variante "aqui na região", que é verdadeira.
    }
    await dormir(1100);
  }
}
