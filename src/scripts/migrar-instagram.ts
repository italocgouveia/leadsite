import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Colunas do pipeline manual de Instagram.
 *
 * Aditiva e idempotente, pelo mesmo motivo da migração de enriquecimento: só
 * `ADD COLUMN IF NOT EXISTS`, nenhuma linha existente muda de valor, e rodar
 * duas vezes não faz diferença. Nenhum dado pode ser perdido aqui.
 *
 *   npx tsx src/scripts/migrar-instagram.ts
 */
const PASSOS: [string, ReturnType<typeof sql>][] = [
  ["instagram_username", sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_username text`],
  ["instagram_origem", sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_origem text`],
  ["instagram_confianca", sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_confianca integer`],
  ["instagram_status", sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_status text`],
  [
    "instagram_abordado_em",
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_abordado_em timestamptz`,
  ],
  [
    "índice da fila manual",
    sql`CREATE INDEX IF NOT EXISTS leads_instagram_status_idx ON leads (instagram_status)`,
  ],
];

async function main() {
  console.log("\nMigração aditiva — nenhum DROP, nenhum UPDATE.\n");
  for (const [nome, cmd] of PASSOS) {
    await db.execute(cmd);
    console.log(`  ok  ${nome}`);
  }
  const r = (await db.execute(sql`
    SELECT (SELECT count(*) FROM leads)::int AS leads,
           (SELECT count(*) FROM leads WHERE instagram IS NOT NULL)::int AS com_instagram,
           (SELECT count(*) FROM leads WHERE instagram_status IS NOT NULL)::int AS com_status
  `)) as unknown as { rows?: Record<string, number>[] } & Record<string, number>[];
  const [l] = r.rows ?? r;
  console.log(`\n  leads: ${l.leads} · com instagram: ${l.com_instagram} · com status: ${l.com_status}`);
  console.log("\nPronto.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
