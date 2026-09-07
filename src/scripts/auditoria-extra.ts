import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Complementos da auditoria: leads em campanha, duplicidade e Uberlândia. Só leitura. */

async function todos<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] } & T[];
  return (r.rows ?? r) as T[];
}
const linha = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(46)} ${String(Number(v ?? 0)).padStart(6)}`);

async function main() {
  const [a] = await todos<Record<string, string>>(sql`
    SELECT
      (SELECT count(DISTINCT lead_id) FROM mensagens WHERE campanha_id IS NOT NULL)::int AS em_campanha,
      (SELECT count(DISTINCT lead_id) FROM geracao_fila)::int                            AS na_fila_geracao,
      (SELECT count(*) FROM leads WHERE cidade = 'Uberlândia')::int                      AS uberlandia,
      (SELECT count(*) FROM leads WHERE cidade = 'Uberlândia' AND whatsapp IS NOT NULL)::int AS uber_wpp,
      (SELECT count(*) FROM leads WHERE cidade = 'Uberlândia' AND website IS NULL)::int  AS uber_sem_site,
      (SELECT count(*) FROM leads WHERE place_id LIKE 'osm:%')::int                      AS de_osm,
      (SELECT count(*) FROM leads WHERE place_id LIKE 'places:%')::int                   AS de_places
  `);
  console.log("\n--- RELAÇÕES E ORIGEM ---");
  linha("leads que já entraram em alguma campanha", a.em_campanha);
  linha("leads na fila de geração", a.na_fila_geracao);
  linha("leads coletados do OpenStreetMap", a.de_osm);
  linha("leads coletados do Google Places", a.de_places);

  console.log("\n--- UBERLÂNDIA HOJE ---");
  linha("leads em Uberlândia", a.uberlandia);
  linha("  com WhatsApp", a.uber_wpp);
  linha("  sem site", a.uber_sem_site);

  console.log("\n--- DUPLICIDADE NA BASE ATUAL ---");
  const [d] = await todos<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM (
         SELECT regexp_replace(coalesce(telefone,''), '\\D', '', 'g') AS t
         FROM leads WHERE telefone IS NOT NULL
         GROUP BY 1 HAVING count(*) > 1) x)::int AS tel_repetido,
      (SELECT coalesce(sum(q - 1), 0) FROM (
         SELECT count(*) AS q FROM leads WHERE telefone IS NOT NULL
         GROUP BY regexp_replace(telefone, '\\D', '', 'g') HAVING count(*) > 1) y)::int AS tel_excedentes,
      (SELECT count(*) FROM (
         SELECT lower(nome) AS n, coalesce(cidade,'') AS c FROM leads
         GROUP BY 1,2 HAVING count(*) > 1) z)::int AS nome_cidade_repetido
  `);
  linha("telefones que aparecem em mais de um lead", d.tel_repetido);
  linha("  leads excedentes por telefone repetido", d.tel_excedentes);
  linha("nome+cidade repetidos", d.nome_cidade_repetido);

  console.log("\n--- TOP CATEGORIAS DA BASE ATUAL ---");
  for (const c of await todos<{ categoria: string; q: string }>(sql`
    SELECT coalesce(categoria, '(sem)') AS categoria, count(*)::int AS q
    FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 12
  `)) {
    linha("    " + c.categoria, c.q);
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
