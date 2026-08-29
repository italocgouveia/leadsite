import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { buscarEGravar } from "@/lib/coletar";
import { buscarPertoDeCachoeira } from "@/lib/osm/cachoeira";

/**
 * Coleta hospedagem perto de cachoeira, estado por estado.
 * Rode com: npx tsx src/lib/gen/coletar-cachoeira.ts [Estado] [Estado...]
 *
 * Sem argumentos, varre os estados com turismo de cachoeira relevante. Cada
 * consulta é pesada (cruza todas as cachoeiras do estado com um raio), então
 * o laço é serial e com pausa — o Overpass é comunitário e devolve 429 para
 * quem atropela.
 */
const PADRAO = [
  "Minas Gerais", "Goiás", "Bahia", "São Paulo", "Rio de Janeiro",
  "Santa Catarina", "Rio Grande do Sul", "Paraná", "Espírito Santo",
  "Mato Grosso do Sul", "Tocantins", "Maranhão", "Amazonas",
];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
  let total = 0;
  const falhas: string[] = [];

  for (const estado of alvos) {
    process.stdout.write(`  ${estado.padEnd(22)} `);
    // Duas tentativas: o Overpass cai bastante e desistir na primeira
    // descartaria um estado inteiro por um 429 passageiro.
    let feito = false;
    for (let t = 1; t <= 2 && !feito; t++) {
      try {
        const r = await buscarEGravar(
          { nicho: "chalé", cidade: estado, estado, quantidade: 80 },
          () => buscarPertoDeCachoeira({ estado, raioKm: 15, quantidade: 80 }),
        );
        total += r.salvos.length;
        console.log(`${r.salvos.length} gravados de ${r.totalEncontrado} mapeados`);
        feito = true;
      } catch (e) {
        if (t === 2) {
          falhas.push(estado);
          console.log(`falhou — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        } else {
          await dormir(25000);
        }
      }
    }
    await dormir(6000);
  }

  console.log(`\nTotal gravado: ${total}`);
  if (falhas.length) console.log(`Falharam (tente de novo): ${falhas.join(", ")}`);
}

main().then(() => process.exit(0));
