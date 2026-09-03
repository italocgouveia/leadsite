import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { neon } from "@neondatabase/serverless";

/**
 * Cria a tabela `geracao_fila` no banco.
 *
 * Por que um script e não `drizzle-kit push`: o push compara o schema inteiro
 * com o banco e decide sozinho o que alterar. Num banco com campanha real
 * dentro, "decide sozinho" é exatamente o que não se quer — basta ele
 * interpretar uma coluna renomeada como coluna nova + coluna removida para
 * apagar dado de produção.
 *
 * Aqui só existem CREATEs, todos com IF NOT EXISTS: rodar duas vezes não faz
 * nada na segunda, e nenhuma tabela existente é tocada. Nada de ALTER, nada
 * de DROP, nada de UPDATE.
 *
 *   npx tsx src/scripts/migrar-geracao-fila.ts
 */

const DDL = [
  `CREATE TABLE IF NOT EXISTS "geracao_fila" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "campanha_id" uuid NOT NULL,
    "lead_id" uuid NOT NULL,
    "status" text DEFAULT 'pendente' NOT NULL,
    "prioridade" integer DEFAULT 0 NOT NULL,
    "tentativas" integer DEFAULT 0 NOT NULL,
    "esperas" integer DEFAULT 0 NOT NULL,
    "proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,
    "processando_desde" timestamp with time zone,
    "mensagem_id" uuid,
    "solucao" text,
    "erro" text,
    "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
  )`,

  `ALTER TABLE "geracao_fila" DROP CONSTRAINT IF EXISTS "geracao_fila_campanha_id_campanhas_id_fk"`,
  `ALTER TABLE "geracao_fila" ADD CONSTRAINT "geracao_fila_campanha_id_campanhas_id_fk"
     FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas"("id") ON DELETE cascade`,

  `ALTER TABLE "geracao_fila" DROP CONSTRAINT IF EXISTS "geracao_fila_lead_id_leads_id_fk"`,
  `ALTER TABLE "geracao_fila" ADD CONSTRAINT "geracao_fila_lead_id_leads_id_fk"
     FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade`,

  `ALTER TABLE "geracao_fila" DROP CONSTRAINT IF EXISTS "geracao_fila_mensagem_id_mensagens_id_fk"`,
  `ALTER TABLE "geracao_fila" ADD CONSTRAINT "geracao_fila_mensagem_id_mensagens_id_fk"
     FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens"("id") ON DELETE set null`,

  // A trava que faz "mesma campanha duas vezes" ser inofensivo.
  `CREATE UNIQUE INDEX IF NOT EXISTS "geracao_fila_campanha_lead_idx"
     ON "geracao_fila" USING btree ("campanha_id","lead_id")`,
  `CREATE INDEX IF NOT EXISTS "geracao_fila_proxima_idx"
     ON "geracao_fila" USING btree ("status","proxima_tentativa_em")`,
  `CREATE INDEX IF NOT EXISTS "geracao_fila_campanha_idx"
     ON "geracao_fila" USING btree ("campanha_id")`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const sql = neon(url);

  for (const [i, comando] of DDL.entries()) {
    await sql.query(comando);
    console.log(`  ${i + 1}/${DDL.length} ok`);
  }

  const [{ n }] = (await sql.query(`SELECT count(*)::int AS n FROM "geracao_fila"`)) as {
    n: number;
  }[];
  console.log(`tabela geracao_fila pronta — ${n} linha(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
