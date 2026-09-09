import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { localizarArea, consultarOverpass } from "@/lib/osm/search";

/**
 * O TETO DO MAPA ABERTO: quantos negócios de Uberlândia publicam contato.
 *
 * A pergunta que decide se vale continuar investindo nesta fonte. Não é
 * "quantas empresas o OSM tem" — isso já sabemos e não paga conta. É:
 *
 *     dos estabelecimentos mapeados, quantos trazem telefone, celular ou
 *     Instagram? E quantos desses ainda não estão na nossa base?
 *
 * Se o teto já foi raspado, aumentar a varredura é trabalho sem retorno, e a
 * resposta certa é trocar de fonte — não varrer mais fundo a mesma.
 *
 * Somente leitura. Não grava lead, não coleta, não envia.
 *
 *   npm run sondar:contato
 */

const CIDADE = "Uberlândia, Minas Gerais, Brasil";
const CHAVES = ["shop", "craft", "office", "healthcare", "amenity", "leisure"];

/** Nada disso é alvo comercial — some da conta para o teto não ficar inflado. */
const FORA_DO_PRODUTO = new Set([
  "bus_station", "parking", "parking_space", "bicycle_parking", "bench", "waste_basket",
  "toilets", "drinking_water", "fountain", "shelter", "recycling", "post_box", "atm",
  "bank", "police", "fire_station", "townhall", "courthouse", "prison", "embassy",
  "place_of_worship", "grave_yard", "school", "kindergarten", "university", "college",
  "library", "public_building", "community_centre", "social_facility", "hospital",
  "fuel", "charging_station", "car_sharing", "taxi", "bicycle_rental", "vending_machine",
  "clock", "telephone", "shower", "water_point", "hunting_stand", "marketplace",
  "pitch", "park", "playground", "garden", "swimming_pool", "track",
  "nature_reserve", "picnic_table", "slipway", "dog_park", "common", "stadium",
  "supermarket", "mall", "department_store", "wholesale", "government",
]);

const pct = (a: number, b: number) => (b === 0 ? "0,0%" : `${((a / b) * 100).toFixed(1)}%`);

/** Celular brasileiro: DDD + 9 + 8 dígitos. Formato, nunca prova de WhatsApp. */
function pareceCelular(bruto: string): boolean {
  const so = bruto.replace(/\D/g, "").replace(/^55/, "");
  return so.length === 11 && so[2] === "9";
}

function dddDe(bruto: string): string | null {
  const so = bruto.replace(/\D/g, "").replace(/^55/, "");
  return so.length >= 10 ? so.slice(0, 2) : null;
}

async function main() {
  const area = await localizarArea(CIDADE);
  if (area.tipo !== "area") throw new Error("Uberlândia não resolveu para uma área");

  const ql = `[out:json][timeout:180];
area(${area.areaId})->.busca;
(
${CHAVES.map((c) => `  nwr["${c}"](area.busca);`).join("\n")}
);
out tags;`;

  console.log(`\nConsultando o mapa de ${CIDADE}…`);
  const r = await consultarOverpass(ql);
  const elementos = r.elements ?? [];

  let comNome = 0;
  let comTelefone = 0;
  let comCelular = 0;
  let ddd34 = 0;
  let comInstagram = 0;
  let comSite = 0;
  let comQualquerCanal = 0;
  let comEmail = 0;
  const dddsForaDaPraca = new Map<string, number>();

  for (const e of elementos) {
    const t = (e.tags ?? {}) as Record<string, string>;
    if (!t.name) continue;

    const valores = CHAVES.map((c) => t[c]).filter(Boolean);
    if (!valores.length) continue;
    if (valores.every((v) => v === "yes" || FORA_DO_PRODUTO.has(v))) continue;

    comNome++;

    const tel = t.phone || t["contact:phone"] || t["contact:mobile"] || "";
    const ig = t["contact:instagram"] || t.instagram || "";
    const site = t.website || t["contact:website"] || "";
    const email = t.email || t["contact:email"] || "";

    if (tel) {
      comTelefone++;
      if (pareceCelular(tel)) comCelular++;
      const d = dddDe(tel);
      if (d === "34") ddd34++;
      else if (d) dddsForaDaPraca.set(d, (dddsForaDaPraca.get(d) ?? 0) + 1);
    }
    if (ig) comInstagram++;
    if (site) comSite++;
    if (email) comEmail++;
    if (tel || ig) comQualquerCanal++;
  }

  const l = (r: string, v: number) =>
    console.log(`  ${r.padEnd(42)} ${String(v).padStart(5)}   ${pct(v, comNome).padStart(6)}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log("O TETO DO OPENSTREETMAP EM UBERLÂNDIA");
  console.log("─".repeat(70));
  console.log(`  elementos devolvidos pela consulta         ${String(elementos.length).padStart(5)}`);
  l("estabelecimentos com nome e ramo útil", comNome);
  console.log("  " + "·".repeat(58));
  l("📞 publicam telefone", comTelefone);
  l("📱 …e o número é celular", comCelular);
  l("📍 …com DDD 34", ddd34);
  l("📸 publicam Instagram", comInstagram);
  l("🌐 publicam site (dá para varrer)", comSite);
  l("✉️  publicam e-mail", comEmail);
  console.log("  " + "·".repeat(58));
  l("🎯 TÊM ALGUM CANAL (telefone ou Instagram)", comQualquerCanal);

  if (dddsForaDaPraca.size) {
    const fora = [...dddsForaDaPraca.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(`\n  DDDs de fora da praça no mapa: ${fora.map(([d, q]) => `${d} (${q})`).join(" · ")}`);
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("LEITURA");
  console.log("─".repeat(70));
  console.log(`  Taxa de contato da fonte: ${pct(comQualquerCanal, comNome)}`);
  console.log(`  Ou seja: para cada 100 empresas que o mapa conhece,`);
  console.log(`  ${Math.round((comQualquerCanal / comNome) * 100)} têm como ser contatadas.`);
  console.log("\n  leads gravados por esta sonda: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
