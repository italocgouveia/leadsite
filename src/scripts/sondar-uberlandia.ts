import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { localizarArea, consultarOverpass } from "@/lib/osm/search";

/**
 * Quanto o OpenStreetMap realmente tem em Uberlândia.
 *
 * Existe para a meta de "1000+ leads" ser discutida com número medido, e não
 * com esperança: se a fonte inteira não tem 1000 estabelecimentos com telefone,
 * nenhuma estratégia de coleta vai produzir 1000 leads contatáveis.
 *
 * Só consulta a API pública do Overpass. Não grava nada.
 */

const CATEGORIAS = ["shop", "amenity", "office", "craft", "healthcare", "leisure", "tourism"];

async function main() {
  const area = await localizarArea("Uberlândia, MG");
  
  const filtro =
    area.tipo === "area" ? `(area:${area.areaId})` : `(around:15000,${area.lat},${area.lng})`;

  const bloco = (cond: string) =>
    CATEGORIAS.map((c) => `nwr["${c}"]${cond}${filtro};`).join("\n  ");

  const consultas: [string, string][] = [
    
    
    ["com contact:phone", '["contact:phone"]'],
    ["com website", '["website"]'],
    ["com instagram", '["contact:instagram"]'],
    ["marcados como rede (brand)", '["brand"]'],
  ];

  console.log("\n=== O QUE O OSM TEM EM UBERLÂNDIA ===\n");
  for (const [rotulo, cond] of consultas) {
    const ql = `[out:json][timeout:60];\n(\n  ${bloco(cond)}\n);\nout count;`;
    const r = await consultarOverpass(ql);
    const total = (r as { elements?: { tags?: { total?: string } }[] }).elements?.[0]?.tags?.total;
    console.log(`  ${rotulo.padEnd(34)} ${String(total ?? "?").padStart(6)}`);
    await new Promise((r) => setTimeout(r, 2500)); // respeita o limite do Overpass
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
