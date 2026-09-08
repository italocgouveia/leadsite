import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Cria a fila de enriquecimento e as colunas de procedência do telefone.
 *
 * ESCRITO À MÃO, e não por `drizzle-kit push`, de propósito: o push compara o
 * schema inteiro e pode propor DROP de coluna ou tabela que ele não reconhece.
 * Aqui só existe `ADD COLUMN IF NOT EXISTS` e `CREATE TABLE IF NOT EXISTS` —
 * é impossível esta migração apagar dado, mesmo rodando duas vezes.
 *
 * Todas as colunas novas são NULL. Nenhuma linha existente muda de valor.
 *
 *   npx tsx src/scripts/migrar-enriquecimento.ts
 */

const PASSOS: [string, ReturnType<typeof sql>][] = [
  [
    "leads.telefone_origem",
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone_origem text`,
  ],
  [
    "leads.telefone_encontrado_em",
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone_encontrado_em timestamptz`,
  ],
  [
    "leads.telefone_confianca",
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefone_confianca integer`,
  ],
  [
    "tabela enriquecimento_fila",
    sql`
      CREATE TABLE IF NOT EXISTS enriquecimento_fila (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pendente',
        prioridade integer NOT NULL DEFAULT 4,
        faixa text,
        motivo text,
        tentativas integer NOT NULL DEFAULT 0,
        processando_desde timestamptz,
        telefone_encontrado text,
        fonte text,
        confianca integer,
        fontes_tentadas jsonb DEFAULT '[]'::jsonb,
        erro text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `,
  ],
  [
    "índice único por lead",
    sql`CREATE UNIQUE INDEX IF NOT EXISTS enriquecimento_fila_lead_idx
        ON enriquecimento_fila (lead_id)`,
  ],
  [
    "índice da fila",
    sql`CREATE INDEX IF NOT EXISTS enriquecimento_fila_fila_idx
        ON enriquecimento_fila (status, prioridade)`,
  ],
];

async function main() {
  console.log("\nMigração aditiva — nenhum DROP, nenhum UPDATE.\n");
  for (const [nome, comando] of PASSOS) {
    await db.execute(comando);
    console.log(`  ok  ${nome}`);
  }

  const r = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM leads)::int AS leads,
      (SELECT count(*) FROM enriquecimento_fila)::int AS fila,
      (SELECT count(*) FROM leads WHERE telefone_origem IS NOT NULL)::int AS com_origem
  `)) as unknown as { rows?: Record<string, number>[] } & Record<string, number>[];
  const [linha] = r.rows ?? r;

  console.log(`\n  leads: ${linha.leads} · fila: ${linha.fila} · com origem: ${linha.com_origem}`);
  console.log("\nPronto.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
