import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { enfileirar, processarLote, estadoDaFila, limparResolvidos } from "@/lib/enriquecimento-fila";

/**
 * Monta a fila de enriquecimento e drena um lote pela linha de comando.
 * Não envia mensagem — ver lib/enriquecimento-fila.
 *
 *   npx tsx src/scripts/enriquecer.ts [quantidade]
 */
async function main() {
  const max = Number(process.argv[2] ?? 20);
  console.log(`\nremovidos da fila (já tinham telefone): ${await limparResolvidos()}`);
  const f = await enfileirar();
  console.log(`enfileirados: ${f.novos} novos · ${f.jaNaFila} já estavam`);

  const r = await processarLote({ max });
  console.log(`\nprocessados: ${r.processados.length} · encontrados: ${r.encontrados}\n`);
  for (const x of r.processados) {
    console.log(
      `  ${x.status.padEnd(15)} ${x.lead.slice(0, 34).padEnd(34)} ${x.telefone ?? x.detalhe ?? ""}`,
    );
  }
  console.log("\nfila:", JSON.stringify(await estadoDaFila()));
  process.exit(0);
}
void main();
