import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Troca a base de PROSPECÇÃO preservando o HISTÓRICO.
 *
 * A regra de preservação é uma só, e é generosa de propósito: se existe
 * qualquer sinal de que uma pessoa real foi envolvida, o lead fica. Errar para
 * o lado de guardar custa uma linha no banco; errar para o lado de apagar
 * destrói a única coisa que o CRM não sabe recriar — a conversa.
 *
 * Um lead é PRESERVADO quando qualquer destes for verdade:
 *   - está em opt-out (pediu para não ser contatado: apagar seria recontatá-lo
 *     depois, do zero, sem saber que ele pediu para parar);
 *   - saiu do topo do funil (alguém trabalhou o lead à mão);
 *   - tem conversa gravada;
 *   - tem mensagem que saiu de verdade (`enviada_em` preenchido);
 *   - tem negócio registrado.
 *
 * Todo o resto é cadastro de mapa que a coleta refaz em minutos.
 *
 * SEGURANÇA
 *   - roda em modo simulação por padrão; só apaga com --executar;
 *   - nunca toca em configuracoes, respostas_automaticas, buscas, login;
 *   - apaga por CASCADE do próprio banco, então não existe órfão possível;
 *   - confere depois se sobrou ponteiro quebrado, e reclama se sobrar.
 *
 *   npx tsx src/scripts/limpar-base.ts             (simulação)
 *   npx tsx src/scripts/limpar-base.ts --executar   (apaga)
 */

const EXECUTAR = process.argv.includes("--executar");

/** Quem fica, em SQL. Uma definição só, usada para contar e para apagar. */
const TEM_HISTORICO = sql`(
  l.nao_contatar
  OR l.etapa NOT IN ('novo','analisado','qualificado')
  OR EXISTS (SELECT 1 FROM conversas c WHERE c.lead_id = l.id)
  OR EXISTS (SELECT 1 FROM mensagens m WHERE m.lead_id = l.id AND m.enviada_em IS NOT NULL)
  OR EXISTS (SELECT 1 FROM negocios g WHERE g.lead_id = l.id)
)`;

async function todos<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] } & T[];
  return (r.rows ?? r) as T[];
}
const num = (v: unknown) => Number(v ?? 0);
const linha = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(44)} ${String(num(v)).padStart(6)}`);

async function main() {
  console.log("\n" + "=".repeat(72));
  console.log(EXECUTAR ? "LIMPEZA DA BASE — MODO EXECUÇÃO" : "LIMPEZA DA BASE — SIMULAÇÃO");
  console.log("=".repeat(72));

  const [antes] = await todos<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM leads)::int      AS leads,
      (SELECT count(*) FROM mensagens)::int  AS mensagens,
      (SELECT count(*) FROM conversas)::int  AS conversas,
      (SELECT count(*) FROM geracao_fila)::int AS geracao,
      (SELECT count(*) FROM eventos)::int    AS eventos,
      (SELECT count(*) FROM sites)::int      AS sites,
      (SELECT count(*) FROM campanhas)::int  AS campanhas
  `);

  const [plano] = await todos<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM leads l WHERE ${TEM_HISTORICO})::int     AS preservar,
      (SELECT count(*) FROM leads l WHERE NOT ${TEM_HISTORICO})::int AS remover,
      (SELECT count(*) FROM mensagens m
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = m.lead_id AND NOT ${TEM_HISTORICO}))::int AS msgs,
      (SELECT count(*) FROM geracao_fila f
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = f.lead_id AND NOT ${TEM_HISTORICO}))::int AS fila,
      (SELECT count(*) FROM conversas c
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = c.lead_id AND NOT ${TEM_HISTORICO}))::int AS conversas,
      (SELECT count(*) FROM eventos e
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = e.lead_id AND NOT ${TEM_HISTORICO}))::int AS eventos,
      (SELECT count(*) FROM sites s
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = s.lead_id AND NOT ${TEM_HISTORICO}))::int AS sites,
      (SELECT count(*) FROM negocios g
         WHERE EXISTS (SELECT 1 FROM leads l WHERE l.id = g.lead_id AND NOT ${TEM_HISTORICO}))::int AS negocios
  `);

  console.log("\nVOU REMOVER:");
  linha("leads sem histórico", plano.remover);
  linha("  mensagens que caem junto", plano.msgs);
  linha("  itens de fila de geração", plano.fila);
  linha("  eventos", plano.eventos);
  linha("  sites gerados", plano.sites);
  linha("  conversas", plano.conversas);
  linha("  negócios", plano.negocios);

  console.log("\nVOU PRESERVAR:");
  linha("leads com histórico", plano.preservar);
  linha("conversas (todas)", antes.conversas);
  linha("campanhas (todas)", antes.campanhas);
  console.log("  configuracoes, respostas_automaticas, buscas: intocadas");

  if (num(plano.conversas) > 0 || num(plano.negocios) > 0) {
    console.log("\n  ABORTADO: a remoção levaria conversa ou negócio junto.");
    console.log("  Isso contradiz a regra de preservação — nada foi apagado.");
    process.exit(1);
  }

  if (!EXECUTAR) {
    console.log("\nSimulação. Nada foi alterado. Rode com --executar para valer.\n");
    process.exit(0);
  }

  // ------------------------------------------------------------- executa
  console.log("\nApagando...");
  const apagados = await todos<{ id: string }>(sql`
    DELETE FROM leads l WHERE NOT ${TEM_HISTORICO} RETURNING l.id
  `);
  console.log(`  ${apagados.length} leads removidos (CASCADE levou os dependentes).`);

  /**
   * Campanha que ficou sem nenhuma mensagem vira casca. Deixar 'rodando' faria
   * o worker acordar para trabalhar num conjunto vazio, e a tela mostraria
   * campanha ativa que nunca dispara. Fecha como concluída — não apaga, para o
   * histórico de "o que já rodou" continuar existindo.
   */
  const fechadas = await todos<{ id: string; nome: string }>(sql`
    UPDATE campanhas c
       SET status = 'concluida', concluida_em = now(), atualizado_em = now()
     WHERE c.status IN ('rodando','pausada','rascunho')
       AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.campanha_id = c.id)
    RETURNING c.id, c.nome
  `);
  console.log(`  ${fechadas.length} campanhas vazias fechadas como concluídas.`);

  // --------------------------------------------- confere a integridade
  const [orfaos] = await todos<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM mensagens m
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = m.lead_id))::int AS msgs,
      (SELECT count(*) FROM conversas c
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c.lead_id))::int AS conversas,
      (SELECT count(*) FROM geracao_fila f
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = f.lead_id))::int AS fila,
      (SELECT count(*) FROM geracao_fila f
         WHERE NOT EXISTS (SELECT 1 FROM campanhas c WHERE c.id = f.campanha_id))::int AS fila_campanha,
      (SELECT count(*) FROM sites s
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = s.lead_id))::int AS sites
  `);
  console.log("\n--- INTEGRIDADE DEPOIS ---");
  for (const [k, v] of Object.entries(orfaos)) linha("órfãos em " + k, v);
  const quebrou = Object.values(orfaos).some((v) => num(v) > 0);

  const [depois] = await todos<Record<string, string>>(sql`
    SELECT (SELECT count(*) FROM leads)::int AS leads,
           (SELECT count(*) FROM mensagens)::int AS mensagens,
           (SELECT count(*) FROM conversas)::int AS conversas,
           (SELECT count(*) FROM configuracoes)::int AS config,
           (SELECT count(*) FROM respostas_automaticas)::int AS respostas
  `);
  console.log("\n--- DEPOIS ---");
  linha("leads", depois.leads);
  linha("mensagens", depois.mensagens);
  linha("conversas (tem que continuar " + antes.conversas + ")", depois.conversas);
  linha("configuracoes (tem que continuar " + antes.config + ")", depois.config);
  linha("respostas_automaticas", depois.respostas);

  const perdeuConversa = num(depois.conversas) !== num(antes.conversas);
  if (quebrou || perdeuConversa) {
    console.log("\n  ATENÇÃO: a limpeza não terminou limpa. Confira acima.");
    process.exit(1);
  }
  console.log("\nLimpeza concluída sem órfãos e sem perder conversa.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
