import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { buscarEGravar } from "@/lib/coletar";
import { NICHOS_LOCAIS } from "@/lib/nichos-locais";

/**
 * Varre Uberlândia nicho por nicho e monta a base de prospecção local.
 *
 * POR QUE NICHO A NICHO, E NÃO "empresas em Uberlândia"
 *
 * O Overpass não tem busca por texto: ele indexa por TAG. Uma consulta ampla
 * traria estacionamento, ponto de ônibus e banco junto — e o produto aqui é
 * sistema para negócio de bairro. Varrer a lista de `nichos-locais.ts` é o que
 * garante que cada linha gravada é de um ramo que a ICG Tech sabe atender.
 *
 * COLETA QUEM NÃO TEM TELEFONE, DE PROPÓSITO
 *
 * `soContataveis: false`. Lead sem WhatsApp não é elegível para disparo — isso
 * é decidido em `lib/fila.ts` e continua valendo — mas ele é base para
 * enriquecer depois, e some do painel se não for coletado. Separar "quem eu
 * conheço" de "para quem eu posso mandar hoje" é o ponto: misturar os dois na
 * COLETA joga fora informação que não custa nada guardar.
 *
 * RITMO
 *
 * O Overpass é mantido por voluntários e devolve 429 quando apertado — foi
 * medido nesta máquina com 2,5s entre consultas. 25s é folgado de propósito:
 * a varredura inteira leva ~30 min e roda uma vez.
 *
 * Retomável: grava o progresso em `coleta-uberlandia.json` e pula o que já
 * fez, então derrubar o processo no meio não perde o que já entrou.
 *
 *   npx tsx src/scripts/coletar-uberlandia.ts
 */

const CIDADE = "Uberlândia";
const ESTADO = "MG";
/** Alto o bastante para não cortar nicho nenhum da cidade. */
const POR_NICHO = 400;
const PAUSA_MS = 25_000;
const PROGRESSO = join(process.cwd(), "coleta-uberlandia.json");

type Progresso = Record<string, { salvos: number; encontrados: number; contataveis: number }>;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O driver HTTP do Neon devolve ora um array, ora { rows }. Aceita os dois. */
async function contarLeads(): Promise<number> {
  const r = (await db.execute(sql`SELECT count(*)::int AS q FROM leads`)) as unknown as {
    rows?: { q: number }[];
  } & { q: number }[];
  return Number((r.rows ?? r)[0]?.q ?? 0);
}

function carregar(): Progresso {
  if (!existsSync(PROGRESSO)) return {};
  try {
    return JSON.parse(readFileSync(PROGRESSO, "utf8")) as Progresso;
  } catch {
    return {};
  }
}

async function main() {
  const feito = carregar();
  const pendentes = NICHOS_LOCAIS.filter((n) => !(n.termo in feito));

  console.log(`\nColeta de ${CIDADE}/${ESTADO}`);
  console.log(`  ${NICHOS_LOCAIS.length} nichos — ${Object.keys(feito).length} já feitos, ${pendentes.length} pendentes`);
  console.log(`  ~${Math.round((pendentes.length * PAUSA_MS) / 60000)} min de pausas\n`);

  const antes = await contarLeads();

  let i = 0;
  for (const nicho of pendentes) {
    i++;
    const rotulo = `[${i}/${pendentes.length}] ${nicho.rotulo}`;
    try {
      const r = await buscarEGravar({
        nicho: nicho.termo,
        cidade: CIDADE,
        estado: ESTADO,
        quantidade: POR_NICHO,
        soContataveis: false,
      });
      feito[nicho.termo] = {
        salvos: r.salvos.length,
        encontrados: r.totalEncontrado,
        contataveis: r.totalContatavel,
      };
      console.log(
        `${rotulo.padEnd(46)} ${String(r.salvos.length).padStart(4)} gravados  ` +
          `(${r.totalContatavel} com contato de ${r.totalEncontrado} no mapa)`,
      );
    } catch (e) {
      // Espelho fora do ar não pode derrubar a varredura: o nicho fica
      // pendente no arquivo de progresso e entra na próxima rodada.
      console.log(`${rotulo.padEnd(46)} FALHOU — ${e instanceof Error ? e.message.slice(0, 70) : e}`);
    }

    writeFileSync(PROGRESSO, JSON.stringify(feito, null, 2), "utf8");
    if (i < pendentes.length) await dormir(PAUSA_MS);
  }

  const depois = await contarLeads();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  leads antes:  ${antes}`);
  console.log(`  leads depois: ${depois}`);
  console.log(`  novos:        ${depois - antes}`);
  console.log(`${"=".repeat(60)}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
