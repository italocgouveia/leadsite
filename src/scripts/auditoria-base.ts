import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Fotografia da base ANTES de qualquer limpeza.
 *
 * Só SELECT. Nenhum INSERT, UPDATE ou DELETE — este arquivo existe justamente
 * para que a decisão de apagar seja tomada olhando número real, e não
 * estimativa. As foreign keys são lidas do catálogo do Postgres, não da minha
 * memória do schema: o que decide o que quebra num DELETE é o banco.
 *
 *   npx tsx src/scripts/auditoria-base.ts
 */

const n = (v: unknown) => Number(v ?? 0);
const linha = (r: string, v: unknown, obs = "") =>
  console.log(`  ${r.padEnd(42)} ${String(n(v)).padStart(7)}${obs ? `   ${obs}` : ""}`);

async function um<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] } & T[];
  return (r.rows ?? r)[0] as T;
}
async function todos<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] } & T[];
  return (r.rows ?? r) as T[];
}

async function main() {
  console.log("\n" + "=".repeat(72));
  console.log("AUDITORIA DA BASE — SOMENTE LEITURA");
  console.log("=".repeat(72));

  // ---------------------------------------------------------- 1. tabelas
  const tabelas = await todos<{ tabela: string; linhas: string }>(sql`
    SELECT c.relname AS tabela,
           (SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid) AS linhas
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  console.log("\n--- TABELAS NO BANCO (estimativa do planner) ---");
  for (const t of tabelas) linha(t.tabela, t.linhas);

  // ------------------------------------------- 2. contagens exatas
  console.log("\n--- CONTAGENS EXATAS ---");
  const conta = async (t: string) => {
    const r = await um<{ q: string }>(sql`SELECT count(*)::int AS q FROM ${sql.raw(`"${t}"`)}`);
    return n(r.q);
  };

  const nomes = tabelas.map((t) => t.tabela);
  const exatas: Record<string, number> = {};
  for (const t of nomes) exatas[t] = await conta(t);
  for (const t of nomes) linha(t, exatas[t]);

  // ------------------------------------------------- 3. foreign keys
  console.log("\n--- FOREIGN KEYS QUE APONTAM PARA leads / campanhas ---");
  const fks = await todos<{
    tabela: string;
    coluna: string;
    alvo: string;
    regra: string;
    nome: string;
  }>(sql`
    SELECT tc.table_name  AS tabela,
           kcu.column_name AS coluna,
           ccu.table_name  AS alvo,
           rc.delete_rule  AS regra,
           tc.constraint_name AS nome
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY ccu.table_name, tc.table_name
  `);
  for (const f of fks) {
    console.log(
      `  ${(f.tabela + "." + f.coluna).padEnd(34)} -> ${f.alvo.padEnd(12)} ON DELETE ${f.regra}`,
    );
  }

  // ------------------------------------------------------ 4. leads
  console.log("\n--- LEADS ---");
  const l = await um<Record<string, string>>(sql`
    SELECT count(*)::int                                          AS total,
           count(*) FILTER (WHERE whatsapp IS NOT NULL)::int       AS com_whatsapp,
           count(*) FILTER (WHERE telefone IS NOT NULL)::int       AS com_telefone,
           count(*) FILTER (WHERE website IS NOT NULL)::int        AS com_site,
           count(*) FILTER (WHERE instagram IS NOT NULL)::int      AS com_instagram,
           count(*) FILTER (WHERE cnpj IS NOT NULL)::int           AS com_cnpj,
           count(*) FILTER (WHERE nao_contatar)::int               AS opt_out,
           count(DISTINCT cidade)::int                             AS cidades,
           count(DISTINCT categoria)::int                          AS categorias
    FROM leads
  `);
  linha("total de leads", l.total);
  linha("com WhatsApp", l.com_whatsapp);
  linha("com telefone", l.com_telefone);
  linha("com site", l.com_site);
  linha("com Instagram", l.com_instagram);
  linha("com CNPJ", l.com_cnpj);
  linha("opt-out (nao_contatar)", l.opt_out);
  linha("cidades distintas", l.cidades);
  linha("categorias distintas", l.categorias);

  console.log("\n  por cidade:");
  for (const c of await todos<{ cidade: string; q: string }>(sql`
    SELECT coalesce(cidade, '(sem cidade)') AS cidade, count(*)::int AS q
    FROM leads GROUP BY 1 ORDER BY 2 DESC LIMIT 15
  `)) {
    linha("    " + c.cidade, c.q);
  }

  console.log("\n  por etapa do funil:");
  for (const e of await todos<{ etapa: string; q: string }>(sql`
    SELECT etapa, count(*)::int AS q FROM leads GROUP BY 1 ORDER BY 2 DESC
  `)) {
    linha("    " + e.etapa, e.q);
  }

  // --------------------------------------------------- 5. mensagens
  console.log("\n--- MENSAGENS ---");
  for (const m of await todos<{ status: string; q: string }>(sql`
    SELECT status, count(*)::int AS q FROM mensagens GROUP BY 1 ORDER BY 2 DESC
  `)) {
    linha("    " + m.status, m.q);
  }
  const mt = await um<Record<string, string>>(sql`
    SELECT count(*)::int AS total,
           count(DISTINCT lead_id)::int AS leads_tocados,
           count(*) FILTER (WHERE enviada_em IS NOT NULL)::int AS com_envio_real,
           count(*) FILTER (WHERE campanha_id IS NULL)::int AS sem_campanha
    FROM mensagens
  `);
  linha("total", mt.total);
  linha("leads distintos com mensagem", mt.leads_tocados);
  linha("com enviada_em preenchido (envio real)", mt.com_envio_real);
  linha("avulsas (sem campanha)", mt.sem_campanha);

  // -------------------------------------------------- 6. campanhas
  console.log("\n--- CAMPANHAS ---");
  for (const c of await todos<{ status: string; q: string }>(sql`
    SELECT status, count(*)::int AS q FROM campanhas GROUP BY 1 ORDER BY 2 DESC
  `)) {
    linha("    " + c.status, c.q);
  }

  // -------------------------------------------------- 7. conversas
  console.log("\n--- CONVERSAS (histórico real com pessoas) ---");
  const cv = await um<Record<string, string>>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE direcao = 'recebida')::int AS recebidas,
           count(*) FILTER (WHERE direcao = 'enviada')::int AS enviadas,
           count(DISTINCT lead_id)::int AS leads
    FROM conversas
  `);
  linha("total de mensagens trocadas", cv.total);
  linha("recebidas (o lead respondeu)", cv.recebidas);
  linha("enviadas", cv.enviadas);
  linha("leads com conversa", cv.leads);

  // ---------------------------------------- 8. o que NÃO pode sumir
  console.log("\n--- LEADS COM HISTÓRICO REAL (candidatos a preservar) ---");
  const h = await um<Record<string, string>>(sql`
    SELECT
      (SELECT count(DISTINCT lead_id) FROM conversas WHERE direcao = 'recebida')::int AS responderam,
      (SELECT count(DISTINCT lead_id) FROM mensagens WHERE enviada_em IS NOT NULL)::int AS receberam_msg,
      (SELECT count(*) FROM leads WHERE etapa NOT IN ('novo','analisado','qualificado'))::int AS fora_do_topo,
      (SELECT count(*) FROM negocios)::int AS negocios,
      (SELECT count(*) FROM leads WHERE memoria_comercial IS NOT NULL
         AND memoria_comercial::text <> '{}')::int AS com_memoria,
      (SELECT count(*) FROM leads WHERE nao_contatar)::int AS opt_out
  `);
  linha("leads que RESPONDERAM", h.responderam);
  linha("leads que receberam mensagem de verdade", h.receberam_msg);
  linha("leads fora do topo do funil", h.fora_do_topo);
  linha("negócios registrados", h.negocios);
  linha("leads com memória comercial", h.com_memoria);
  linha("leads em opt-out (nunca pode sumir)", h.opt_out);

  const preservar = await um<{ q: string }>(sql`
    SELECT count(*)::int AS q FROM leads l
    WHERE l.nao_contatar
       OR l.etapa NOT IN ('novo','analisado','qualificado')
       OR EXISTS (SELECT 1 FROM conversas c WHERE c.lead_id = l.id)
       OR EXISTS (SELECT 1 FROM mensagens m WHERE m.lead_id = l.id AND m.enviada_em IS NOT NULL)
       OR EXISTS (SELECT 1 FROM negocios g WHERE g.lead_id = l.id)
  `);
  const total = n(l.total);
  const manter = n(preservar.q);
  console.log("\n" + "=".repeat(72));
  linha("LEADS COM HISTÓRICO -> PRESERVAR", manter);
  linha("LEADS SEM HISTÓRICO -> REMOVÍVEIS", total - manter);
  console.log("=".repeat(72));

  // ----------------------------- 9. o que cai junto com os removíveis
  console.log("\n--- O QUE SAI JUNTO SE OS REMOVÍVEIS FOREM APAGADOS ---");
  const semHist = sql`
    SELECT l.id FROM leads l
    WHERE NOT (
      l.nao_contatar
      OR l.etapa NOT IN ('novo','analisado','qualificado')
      OR EXISTS (SELECT 1 FROM conversas c WHERE c.lead_id = l.id)
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.lead_id = l.id AND m.enviada_em IS NOT NULL)
      OR EXISTS (SELECT 1 FROM negocios g WHERE g.lead_id = l.id)
    )
  `;
  const colateral = await um<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM mensagens     WHERE lead_id IN (${semHist}))::int AS mensagens,
      (SELECT count(*) FROM geracao_fila  WHERE lead_id IN (${semHist}))::int AS geracao,
      (SELECT count(*) FROM conversas     WHERE lead_id IN (${semHist}))::int AS conversas,
      (SELECT count(*) FROM eventos       WHERE lead_id IN (${semHist}))::int AS eventos,
      (SELECT count(*) FROM sites         WHERE lead_id IN (${semHist}))::int AS sites,
      (SELECT count(*) FROM scripts       WHERE lead_id IN (${semHist}))::int AS scripts,
      (SELECT count(*) FROM logos         WHERE lead_id IN (${semHist}))::int AS logos,
      (SELECT count(*) FROM negocios      WHERE lead_id IN (${semHist}))::int AS negocios
  `);
  for (const [k, v] of Object.entries(colateral)) linha(k, v);

  // -------------------------------------- 10. configuração do sistema
  console.log("\n--- NÃO SE TOCA (configuração e estrutura) ---");
  linha("configuracoes", exatas["configuracoes"] ?? 0);
  linha("respostas_automaticas", exatas["respostas_automaticas"] ?? 0);
  linha("buscas (histórico de coleta)", exatas["buscas"] ?? 0);

  console.log("\nNenhuma linha foi alterada. Auditoria somente leitura.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
