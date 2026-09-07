import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { inArray } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { deduplicar, nomeCanonico } from "@/lib/dedup";

/**
 * Remove as duplicatas que já entraram na base.
 *
 * A trava definitiva está na coleta (`lib/coletar.ts`), que agora recusa
 * duplicata antes de gravar. Este script existe para o que entrou ANTES dela:
 * o mesmo estabelecimento mapeado duas vezes no OpenStreetMap, uma como ponto
 * e outra como área.
 *
 * QUEM FICA
 *
 * O cadastro mais COMPLETO, não o mais antigo. A lista é ordenada por riqueza
 * de campos antes de deduplicar, e `deduplicar` mantém o primeiro de cada
 * grupo — então o que sobrevive é o que tem telefone, site e endereço, e o que
 * sai é a ficha pela metade.
 *
 * QUEM NUNCA SAI
 *
 * Lead com histórico. Se um dos dois já conversou, já recebeu mensagem ou saiu
 * do topo do funil, ele não é candidato a remoção — apagar o lado com
 * histórico para ficar com a ficha mais bonita destruiria justamente o que não
 * dá para recriar.
 *
 *   npx tsx src/scripts/deduplicar-base.ts             (simulação)
 *   npx tsx src/scripts/deduplicar-base.ts --executar
 */

const EXECUTAR = process.argv.includes("--executar");

/** Quantos campos úteis o cadastro tem. Mais alto = fica. */
function riqueza(l: typeof leads.$inferSelect): number {
  return (
    (l.telefone ? 4 : 0) +
    (l.website ? 2 : 0) +
    (l.instagram ? 2 : 0) +
    (l.email ? 1 : 0) +
    (l.endereco ? 2 : 0) +
    (l.horarios ? 1 : 0) +
    (l.nota != null ? 1 : 0)
  );
}

async function main() {
  const todos = await db.select().from(leads);

  /**
   * Leads com histórico entram PRIMEIRO na lista. Como `deduplicar` guarda o
   * primeiro de cada grupo, isso garante que eles nunca sejam os removidos —
   * a ordem da lista é a política de preservação.
   */
  const temHistorico = (l: typeof leads.$inferSelect) =>
    l.naoContatar || !["novo", "analisado", "qualificado"].includes(l.etapa);

  const ordenados = [...todos].sort((a, b) => {
    const h = Number(temHistorico(b)) - Number(temHistorico(a));
    return h !== 0 ? h : riqueza(b) - riqueza(a);
  });

  const { unicos, duplicados } = deduplicar(ordenados);

  console.log(`\n${todos.length} leads · ${unicos.length} únicos · ${duplicados.length} duplicados\n`);

  if (!duplicados.length) {
    console.log("Nada a fazer.\n");
    process.exit(0);
  }

  /**
   * SÓ REMOVE O QUE É INEQUÍVOCO.
   *
   * "Mesmo telefone" casa duas fichas, mas não prova que são o mesmo lugar: na
   * base real, "Cabana na Mata", "Cabana Sobre a Mata" e "Cabana Hobbit"
   * dividem uma linha porque são três chalés DO MESMO DONO — propriedades
   * distintas, cada uma com sua reserva. Apagar duas delas perderia dois
   * negócios reais para consertar uma duplicata que não existe.
   *
   * O que remove sozinho é o caso em que o nome canônico também bate: aí são
   * duas fichas do mesmo estabelecimento, que é exatamente como o
   * OpenStreetMap devolve um lugar mapeado como ponto e como área.
   *
   * O resto é listado para você decidir. Ambiguidade vira pergunta, não
   * exclusão automática.
   */
  const mesmoNome = (d: (typeof duplicados)[number]) =>
    nomeCanonico(d.item.nome) === nomeCanonico(d.de.nome);

  const seguros = duplicados.filter((d) => mesmoNome(d) && !temHistorico(d.item));
  const ambiguos = duplicados.filter((d) => !seguros.includes(d));

  console.log("REMOVER (mesmo estabelecimento, sem histórico):");
  for (const d of seguros) {
    console.log(`  "${d.item.nome}" — fica "${d.de.nome}" (${d.motivo})`);
  }
  if (!seguros.length) console.log("  (nenhum)");

  if (ambiguos.length) {
    console.log("\nMANTER e revisar à mão (nomes diferentes ou com histórico):");
    for (const d of ambiguos) {
      console.log(
        `  "${d.item.nome}" ~ "${d.de.nome}" (${d.motivo})` +
          (temHistorico(d.item) ? " [tem histórico]" : ""),
      );
    }
  }

  if (!seguros.length) {
    console.log("\nNada a remover automaticamente.\n");
    process.exit(0);
  }

  if (!EXECUTAR) {
    console.log("\nSimulação. Nada foi alterado. Rode com --executar.\n");
    process.exit(0);
  }

  const ids = seguros.map((d) => d.item.id);
  const apagados = await db.delete(leads).where(inArray(leads.id, ids)).returning({ id: leads.id });
  console.log(`\n${apagados.length} duplicatas removidas.\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
