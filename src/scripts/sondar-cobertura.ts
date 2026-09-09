import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { localizarArea, consultarOverpass } from "@/lib/osm/search";
import { NICHOS_LOCAIS } from "@/lib/nichos-locais";
import { filtrosParaNicho } from "@/lib/osm/tags";

/**
 * O QUE O MAPA TEM QUE A NOSSA LISTA DE NICHOS NÃO PEGA.
 *
 * A varredura dos 67 nichos trouxe 1.021 estabelecimentos, e o mapa de
 * Uberlândia tem 4.280. A diferença não é falha da coleta: a maior parte dela
 * é ponto de ônibus, banco, escola pública e afins, que estão fora do produto
 * de propósito. Mas dentro dela também há ramos que a lista simplesmente não
 * previu — e coletar mais um nicho custa uma consulta, enquanto descobrir o
 * nicho errado custa meia hora de pausas.
 *
 * Esta sonda conta, por valor de tag, o que existe na cidade e marca o que já
 * está coberto. Não grava lead nenhum, não altera nada.
 *
 *   npm run sondar:cobertura
 */

const CIDADE = "Uberlândia, Minas Gerais, Brasil";

/**
 * As chaves que descrevem NEGÓCIO. `amenity` entra apesar de carregar muita
 * coisa pública (escola, hospital, ponto de ônibus) porque também é onde vivem
 * restaurante, farmácia e clínica; o ruído é filtrado na leitura, não aqui.
 */
const CHAVES = ["shop", "craft", "office", "healthcare", "amenity", "leisure"];

/** Ramos que não compram sistema da ICG Tech — some do relatório, sem ocupar linha. */
const FORA_DO_PRODUTO = new Set([
  "bus_station", "parking", "parking_space", "bicycle_parking", "bench", "waste_basket",
  "toilets", "drinking_water", "fountain", "shelter", "recycling", "post_box", "atm",
  "bank", "police", "fire_station", "townhall", "courthouse", "prison", "embassy",
  "place_of_worship", "grave_yard", "school", "kindergarten", "university", "college",
  "library", "public_building", "community_centre", "social_facility", "hospital",
  "fuel", "charging_station", "car_sharing", "taxi", "bicycle_rental", "vending_machine",
  "clock", "telephone", "shower", "water_point", "hunting_stand", "marketplace",
  "pitch", "park", "playground", "garden", "swimming_pool", "sports_centre", "track",
  "nature_reserve", "picnic_table", "slipway", "dog_park", "common", "stadium",
]);

function coberturaAtual(): Set<string> {
  const cobertas = new Set<string>();
  for (const n of NICHOS_LOCAIS) {
    for (const f of filtrosParaNicho(n.termo) ?? []) cobertas.add(`${f.chave}=${f.valor}`);
    for (const extra of n.tagsExtras ?? []) cobertas.add(extra);
  }
  return cobertas;
}

async function main() {
  const area = await localizarArea(CIDADE);
  if (area.tipo !== "area") throw new Error("Uberlândia não resolveu para uma área do Overpass");

  /**
   * Uma consulta só, pedindo os elementos com `out tags` (sem geometria).
   * Contar por valor exige ver as tags; `out count` daria só o total.
   */
  const ql = `[out:json][timeout:180];
area(${area.areaId})->.busca;
(
${CHAVES.map((c) => `  nwr["${c}"](area.busca);`).join("\n")}
);
out tags;`;

  console.log(`\nConsultando o mapa de ${CIDADE}…`);
  const r = await consultarOverpass(ql);
  const elementos = r.elements ?? [];
  console.log(`  ${elementos.length} elementos com tag de negócio\n`);

  const cobertas = coberturaAtual();
  const contagem = new Map<string, { total: number; comTelefone: number }>();

  for (const e of elementos) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    /** Sem nome não é lead: é um polígono anônimo no mapa. */
    if (!tags.name) continue;
    const temTel = Boolean(tags.phone || tags["contact:phone"] || tags["contact:mobile"]);

    /**
     * UM ELEMENTO PODE TER VÁRIAS TAGS DE NEGÓCIO, e é por isso que a primeira
     * versão desta sonda mentiu.
     *
     * Ela atribuía cada elemento à primeira chave que casasse e perguntava se
     * AQUELA estava coberta. Só que a mesma clínica costuma ter
     * `amenity=clinic` e `healthcare=clinic` ao mesmo tempo: a sonda a
     * classificava como "healthcare, descoberta" enquanto a coleta já a trazia
     * por `amenity`. Resultado: 761 estabelecimentos apontados como fora do
     * alcance, dos quais boa parte já entrava. Acrescentar `healthcare=clinic`
     * à lista rendeu exatamente zero lead novo — o número não sobreviveu ao
     * primeiro contato com a coleta de verdade.
     *
     * A pergunta certa é sobre o ELEMENTO, não sobre a tag: ele é alcançável
     * por alguma das tags que já coletamos?
     */
    const paresDeNegocio = CHAVES.map((c) => [c, tags[c]] as const)
      .filter(([, v]) => v && v !== "yes" && !FORA_DO_PRODUTO.has(v))
      .map(([c, v]) => `${c}=${v}`);

    if (!paresDeNegocio.length) continue;
    if (paresDeNegocio.some((id) => cobertas.has(id))) continue;

    /** Fora do alcance de verdade. Conta sob a primeira tag que o descreve. */
    const id = paresDeNegocio[0];
    const atual = contagem.get(id) ?? { total: 0, comTelefone: 0 };
    atual.total++;
    if (temTel) atual.comTelefone++;
    contagem.set(id, atual);
  }

  const ordenado = [...contagem.entries()].sort((a, b) => b[1].total - a[1].total);
  const descobertas = ordenado;

  const linha = (id: string, v: { total: number; comTelefone: number }) =>
    console.log(`  ${String(v.total).padStart(4)}  ${id.padEnd(34)} ${v.comTelefone} com telefone`);

  console.log("─".repeat(66));
  console.log(`NÃO COBERTOS PELA LISTA DE NICHOS — ${descobertas.length} tags`);
  console.log("─".repeat(66));
  for (const [id, v] of descobertas.slice(0, 40)) linha(id, v);

  const somaNova = descobertas.reduce((s, [, v]) => s + v.total, 0);
  const somaTel = descobertas.reduce((s, [, v]) => s + v.comTelefone, 0);

  console.log("\n" + "─".repeat(66));
  console.log("RESUMO");
  console.log("─".repeat(66));
  console.log(`  tags cobertas pela lista atual:      ${cobertas.size}`);
  console.log(`  tags com negócio nomeado na cidade:  ${ordenado.length}`);
  console.log(`  …dessas, não cobertas:               ${descobertas.length}`);
  console.log(`  estabelecimentos que isso somaria:   ${somaNova}`);
  console.log(`  …com telefone publicado:             ${somaTel}`);
  console.log("\n  leads gravados por esta sonda: 0");
  console.log("  mensagens enviadas: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
