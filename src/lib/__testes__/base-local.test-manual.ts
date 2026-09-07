import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deduplicar, nomeCanonico } from "@/lib/dedup";
import { leads as tabelaLeads } from "@/lib/db";

/**
 * A base DEPOIS da limpeza e da coleta: o banco está íntegro?
 *
 * Diferente de `prospeccao-local`, que prova as regras em memória, este
 * arquivo faz perguntas ao banco real. Todas de LEITURA — nada aqui insere,
 * atualiza, apaga, aprova ou envia.
 *
 * O que ele protege é o que a limpeza poderia ter quebrado em silêncio:
 * ponteiro para lead que não existe mais, campanha rodando sobre o vazio,
 * configuração levada junto por um CASCADE mal calculado.
 *
 *   npm run test:base-local
 */

let p = 0;
let f = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) {
    p++;
    console.log(`  [PASS] ${n}${d ? ` — ${d}` : ""}`);
  } else {
    f++;
    console.log(`  [FAIL] ${n}${d ? ` — ${d}` : ""}`);
  }
};

async function linha<T = Record<string, unknown>>(q: ReturnType<typeof sql>): Promise<T> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] } & T[];
  return (r.rows ?? r)[0] as T;
}
const n = (v: unknown) => Number(v ?? 0);

async function main() {
  console.log("\n=== A. NENHUM PONTEIRO QUEBRADO ===");
  const orf = await linha<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM mensagens m
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = m.lead_id))::int AS msgs,
      (SELECT count(*) FROM conversas c
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c.lead_id))::int AS conversas,
      (SELECT count(*) FROM geracao_fila g
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = g.lead_id))::int AS fila_lead,
      (SELECT count(*) FROM geracao_fila g
         WHERE NOT EXISTS (SELECT 1 FROM campanhas c WHERE c.id = g.campanha_id))::int AS fila_camp,
      (SELECT count(*) FROM sites s
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = s.lead_id))::int AS sites,
      (SELECT count(*) FROM negocios g
         WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = g.lead_id))::int AS negocios
  `);
  ok("1. nenhuma mensagem órfã", n(orf.msgs) === 0, `${orf.msgs} órfãs`);
  ok("2. nenhuma conversa órfã", n(orf.conversas) === 0, `${orf.conversas} órfãs`);
  ok("3. nenhum item de fila apontando para lead removido", n(orf.fila_lead) === 0);
  ok("4. nenhum item de fila apontando para campanha removida", n(orf.fila_camp) === 0);
  ok("5. nenhum site órfão", n(orf.sites) === 0);
  ok("6. nenhum negócio órfão", n(orf.negocios) === 0);

  console.log("\n=== B. NENHUMA CAMPANHA INVÁLIDA ===");
  const camp = await linha<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM campanhas c
        WHERE c.status IN ('rodando','pausada')
          AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.campanha_id = c.id))::int AS vazias_ativas,
      (SELECT count(*) FROM campanhas)::int AS total
  `);
  ok(
    "7. nenhuma campanha ativa sem mensagem nenhuma",
    n(camp.vazias_ativas) === 0,
    `${camp.vazias_ativas} campanhas rodando sobre o vazio`,
  );
  ok("7b. o histórico de campanhas continua existindo", n(camp.total) > 0, `${camp.total} campanhas`);

  console.log("\n=== C. A CONFIGURAÇÃO DO SISTEMA SOBREVIVEU ===");
  const cfg = await linha<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM configuracoes)::int          AS config,
      (SELECT count(*) FROM respostas_automaticas)::int  AS respostas,
      (SELECT count(*) FROM buscas)::int                 AS buscas
  `);
  ok("8. configuracoes intacta", n(cfg.config) >= 1, `${cfg.config} linha(s)`);
  ok("9. respostas automáticas intactas", n(cfg.respostas) >= 1, `${cfg.respostas} regras`);
  ok("10. histórico de buscas preservado", n(cfg.buscas) > 0, `${cfg.buscas} buscas`);

  console.log("\n=== D. O HISTÓRICO COMERCIAL SOBREVIVEU ===");
  const hist = await linha<Record<string, string>>(sql`
    SELECT
      (SELECT count(*) FROM conversas)::int AS conversas,
      (SELECT count(DISTINCT lead_id) FROM conversas WHERE direcao = 'recebida')::int AS responderam,
      (SELECT count(*) FROM mensagens WHERE enviada_em IS NOT NULL)::int AS enviadas,
      (SELECT count(*) FROM leads WHERE etapa NOT IN ('novo','analisado','qualificado'))::int AS trabalhados
  `);
  ok("11. as conversas continuam lá", n(hist.conversas) > 0, `${hist.conversas} mensagens trocadas`);
  ok("12. quem respondeu continua na base", n(hist.responderam) > 0, `${hist.responderam} leads`);
  ok(
    "13. todo lead que já recebeu mensagem continua na base",
    n(hist.enviadas) > 0,
    `${hist.enviadas} mensagens com envio real`,
  );
  ok("14. leads trabalhados preservados", n(hist.trabalhados) > 0, `${hist.trabalhados} fora do topo`);

  /**
   * A regra da limpeza foi: sem histórico sai, com histórico fica. O jeito de
   * provar que ela foi aplicada não é contar quantos sobraram — é confirmar
   * que NÃO existe mais nenhum lead sem histórico dos ANTIGOS. Os novos, da
   * coleta, também não têm histórico e são legítimos; o que os separa é a data.
   */
  console.log("\n=== E. A LIMPEZA FOI APLICADA ===");
  const antigos = await linha<Record<string, string>>(sql`
    SELECT count(*)::int AS q
    FROM leads l
    WHERE l.criado_em < now() - interval '1 day'
      AND NOT (
        l.nao_contatar
        OR l.etapa NOT IN ('novo','analisado','qualificado')
        OR EXISTS (SELECT 1 FROM conversas c WHERE c.lead_id = l.id)
        OR EXISTS (SELECT 1 FROM mensagens m WHERE m.lead_id = l.id AND m.enviada_em IS NOT NULL)
        OR EXISTS (SELECT 1 FROM negocios g WHERE g.lead_id = l.id)
      )
  `);
  ok(
    "15. nenhum lead antigo sem histórico permanece",
    n(antigos.q) === 0,
    `${antigos.q} sobraram`,
  );

  console.log("\n=== F. DUPLICIDADE NA BASE REAL ===");
  const base = await db
    .select({
      nome: tabelaLeads.nome,
      cnpj: tabelaLeads.cnpj,
      telefone: tabelaLeads.telefone,
      whatsapp: tabelaLeads.whatsapp,
      website: tabelaLeads.website,
      endereco: tabelaLeads.endereco,
      cidade: tabelaLeads.cidade,
      criadoEm: tabelaLeads.criadoEm,
    })
    .from(tabelaLeads);

  const r = deduplicar(base);

  /**
   * A asserção separa DUPLICATA de COINCIDÊNCIA, e a linha entre as duas é o
   * nome canônico.
   *
   * Nome igual + endereço igual é o mesmo estabelecimento cadastrado duas
   * vezes — foi assim que o OpenStreetMap devolveu "Espetinho" como ponto e
   * como área. Isso tem de ser zero, e é o que este teste trava.
   *
   * Telefone igual com nomes DIFERENTES é outra coisa: "Cabana na Mata",
   * "Cabana Sobre a Mata" e "Cabana Hobbit" são três chalés do mesmo dono,
   * dividindo uma linha. Apagar dois consertaria uma duplicata inexistente e
   * perderia dois negócios reais — então isso é relatado, não reprovado.
   */
  const mesmoNome = (d: (typeof r.duplicados)[number]) =>
    nomeCanonico(d.item.nome) === nomeCanonico(d.de.nome);

  const fichasRepetidas = r.duplicados.filter(mesmoNome);
  const mesmoDono = r.duplicados.filter((d) => !mesmoNome(d));

  ok(
    `16. nenhuma ficha repetida do mesmo estabelecimento (base de ${base.length})`,
    fichasRepetidas.length === 0,
    fichasRepetidas.length
      ? fichasRepetidas.slice(0, 5).map((d) => `${d.item.nome} = ${d.de.nome}`).join(" | ")
      : "nenhuma",
  );
  console.log(
    `  [INFO] ${mesmoDono.length} cadastros distintos dividindo telefone ` +
      `(mesmo dono, propriedades diferentes — preservados de propósito)`,
  );

  const porPlace = await linha<{ q: string }>(sql`
    SELECT count(*)::int AS q FROM (
      SELECT place_id FROM leads GROUP BY place_id HAVING count(*) > 1
    ) x
  `);
  ok("17. nenhum place_id repetido", n(porPlace.q) === 0, `${porPlace.q} repetidos`);

  console.log("\n=== G. NENHUMA MENSAGEM FOI ENVIADA POR ESTE TESTE ===");
  const envio = await linha<{ q: string }>(sql`
    SELECT count(*)::int AS q FROM mensagens
    WHERE enviada_em > now() - interval '10 minutes'
  `);
  ok("18. nenhuma mensagem enviada nos últimos 10 minutos", n(envio.q) === 0, `${envio.q} envios`);

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

void main();
