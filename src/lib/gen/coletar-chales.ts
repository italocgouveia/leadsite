import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { buscarEGravar } from "@/lib/coletar";

/**
 * Coleta chalés e casas de temporada em destinos brasileiros conhecidos por
 * cachoeira. Rode com: npx tsx src/lib/gen/coletar-chales.ts
 *
 * POR QUE ESTA LISTA E NÃO "O BRASIL TODO"
 *
 * "Chalé perto de cachoeira" não é um filtro que o OSM aceita — não existe
 * consulta por proximidade a acidente geográfico dentro do modelo de busca
 * atual (`buscarNoOsm` pede cidade+estado, não coordenada+raio de natureza).
 * Rodar a busca nos ~5.570 municípios do Brasil também não seria "cobrir o
 * Brasil todo" de verdade — mataria o Overpass (etiqueta pública: 1 req/s) em
 * mais de uma hora de consultas, e 99% delas voltariam vazias, porque chalé
 * de temporada é comércio concentrado em destino turístico, não distribuído
 * pelo país.
 *
 * Por isso a lista abaixo é CURADA: os polos de turismo de cachoeira mais
 * conhecidos do Brasil, um punhado por região, cobrindo MG, RJ, SP, GO, BA,
 * SC, AM, MA, TO, MS, RS e ES. É "o Brasil todo" no sentido de abranger
 * regiões, não de varrer cada município.
 */

type Destino = { cidade: string; estado: string; contexto: string };

const DESTINOS: Destino[] = [
  // Minas Gerais — o maior polo do país para esse nicho
  { cidade: "Capitólio", estado: "Minas Gerais", contexto: "Cânion de Furnas, dezenas de cachoeiras" },
  { cidade: "São Thomé das Letras", estado: "Minas Gerais", contexto: "cachoeiras e turismo místico" },
  { cidade: "Monte Verde", estado: "Minas Gerais", contexto: "Serra da Mantiqueira" },
  { cidade: "Gonçalves", estado: "Minas Gerais", contexto: "Serra da Mantiqueira, trilhas e cachoeiras" },
  { cidade: "Itamonte", estado: "Minas Gerais", contexto: "Pico das Agulhas Negras" },
  { cidade: "Aiuruoca", estado: "Minas Gerais", contexto: "Vale do Matutu, cachoeiras" },
  { cidade: "Lima Duarte", estado: "Minas Gerais", contexto: "Parque Estadual do Ibitipoca" },

  // Rio de Janeiro
  { cidade: "Resende", estado: "Rio de Janeiro", contexto: "Visconde de Mauá, cachoeiras" },
  { cidade: "Itatiaia", estado: "Rio de Janeiro", contexto: "Penedo e Parque Nacional" },

  // São Paulo
  { cidade: "Socorro", estado: "São Paulo", contexto: "turismo de aventura, cachoeiras" },
  { cidade: "Brotas", estado: "São Paulo", contexto: "cachoeiras e rafting" },
  { cidade: "Cunha", estado: "São Paulo", contexto: "Serra da Bocaina, cachoeiras" },
  { cidade: "Campos do Jordão", estado: "São Paulo", contexto: "Serra da Mantiqueira" },

  // Goiás
  { cidade: "Alto Paraíso de Goiás", estado: "Goiás", contexto: "Chapada dos Veadeiros" },
  { cidade: "Cavalcante", estado: "Goiás", contexto: "São Jorge, Chapada dos Veadeiros" },
  { cidade: "Pirenópolis", estado: "Goiás", contexto: "cachoeiras históricas" },

  // Bahia — Chapada Diamantina
  { cidade: "Lençóis", estado: "Bahia", contexto: "Chapada Diamantina" },
  { cidade: "Palmeiras", estado: "Bahia", contexto: "Vale do Capão" },
  { cidade: "Mucugê", estado: "Bahia", contexto: "Chapada Diamantina" },

  // Santa Catarina
  { cidade: "Urubici", estado: "Santa Catarina", contexto: "Serra Catarinense, cachoeiras" },
  { cidade: "São Joaquim", estado: "Santa Catarina", contexto: "Serra Catarinense" },
  { cidade: "Nova Trento", estado: "Santa Catarina", contexto: "Cachoeira do Rio do Bode" },

  // Norte / Nordeste / Centro-Oeste
  { cidade: "Presidente Figueiredo", estado: "Amazonas", contexto: "\"terra das cachoeiras\"" },
  { cidade: "Carolina", estado: "Maranhão", contexto: "Chapada das Mesas" },
  { cidade: "Mateiros", estado: "Tocantins", contexto: "Jalapão" },
  { cidade: "Bonito", estado: "Mato Grosso do Sul", contexto: "rios e cachoeiras" },

  // Sul
  { cidade: "Canela", estado: "Rio Grande do Sul", contexto: "Cascata do Caracol" },

  // Espírito Santo
  { cidade: "Domingos Martins", estado: "Espírito Santo", contexto: "Pedra Azul, cachoeiras" },
];

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Etiqueta pública do Overpass: no máximo 1 requisição por segundo. */
const RESPIRO_MS = 2500;

async function main() {
  console.log(`Coletando em ${DESTINOS.length} destinos, nicho "chalé"...\n`);

  let totalNovos = 0;
  let totalEncontrados = 0;
  const falhas: { destino: string; erro: string }[] = [];
  const porDestino: { destino: string; salvos: number; encontrados: number }[] = [];

  for (const d of DESTINOS) {
    const rotulo = `${d.cidade}/${d.estado}`;
    process.stdout.write(`  ${rotulo.padEnd(38)} `);
    try {
      const r = await buscarEGravar({
        nicho: "chalé",
        cidade: d.cidade,
        estado: d.estado,
        quantidade: 60,
      });
      totalNovos += r.salvos.length;
      totalEncontrados += r.totalEncontrado;
      porDestino.push({ destino: rotulo, salvos: r.salvos.length, encontrados: r.totalEncontrado });
      console.log(
        `${r.salvos.length} lead(s) contatável(is) de ${r.totalEncontrado} mapeado(s)${
          r.buscaPorNome ? "  (sem tag própria, busquei por nome)" : ""
        }`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      falhas.push({ destino: rotulo, erro: msg });
      console.log(`FALHOU — ${msg}`);
    }
    await dormir(RESPIRO_MS);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Total: ${totalNovos} lead(s) gravado(s) de ${totalEncontrados} mapeado(s) no total.`);

  const comLeads = porDestino.filter((p) => p.salvos > 0).sort((a, b) => b.salvos - a.salvos);
  if (comLeads.length) {
    console.log("\nMelhores destinos:");
    comLeads.slice(0, 10).forEach((p) => console.log(`  ${String(p.salvos).padStart(3)}  ${p.destino}`));
  }

  if (falhas.length) {
    console.log(`\n${falhas.length} destino(s) falharam (rede ou geocodificação):`);
    falhas.forEach((f) => console.log(`  ${f.destino}: ${f.erro}`));
  }
}

main().then(() => process.exit(0));
