import { filtrosParaNicho } from "@/lib/osm/tags";
import { nichoDe } from "@/lib/nichos";
import { categoriaSingular, categoriaPlural } from "@/lib/categoria-nome";

/**
 * Trava a busca de chalé/casa de temporada e o bug que ela expôs.
 * Rode com: npm run test:hospedagem
 *
 * `tags.tourism` faltava na extração do OSM (search.ts) — todo hotel e
 * pousada capturado até hoje ficava com `categoria` vazia, mascarada pelo
 * fallback "usa o texto que a pessoa digitou na busca". Funcionava por
 * coincidência para "pousada"/"hotel"; quebrava de verdade para "casa de
 * temporada", que tem espaço e era confundida com tag não traduzida.
 */

let falhas = 0;
function ok(rotulo: string, condicao: boolean, detalhe = "") {
  if (!condicao) falhas++;
  console.log(`  ${condicao ? "ok  " : "FALHA"}  ${rotulo}${detalhe ? " — " + detalhe : ""}`);
}

console.log("\n[tags do OSM]");
ok("chalé casa a tourism=chalet", filtrosParaNicho("chalé")?.some((f) => f.valor === "chalet") ?? false);
ok(
  "casa de temporada casa a tourism=apartment",
  filtrosParaNicho("casa de temporada")?.some((f) => f.valor === "apartment") ?? false,
);
ok("plural também casa (chalés)", filtrosParaNicho("chalés") !== null);

/**
 * Simula o que `search.ts` faz agora: `categoria` vem da TAG do OSM, não do
 * texto digitado na busca. É essa string — "chalet", "apartment" — que entra
 * no banco e alimenta nichoDe/categoriaSingular depois.
 */
console.log("\n[categoria vinda da tag, não do texto digitado]");
ok("nichoDe('chalet') tem pitch próprio", nichoDe("chalet").dor.includes("comissão"));
ok("nichoDe('apartment') tem pitch próprio", nichoDe("apartment").dor.includes("comissão"));

console.log("\n[nomes em português]");
ok("chalet -> chalé", categoriaSingular("chalet") === "chalé");
ok("plural: chalé -> chalés", categoriaPlural("chalet") === "chalés");
ok("apartment -> casa de temporada", categoriaSingular("apartment") === "casa de temporada");
ok(
  "plural: casa de temporada -> casas de temporada",
  categoriaPlural("apartment") === "casas de temporada",
);

/**
 * O bug de verdade não é o que aparece na tela para ESTE texto específico —
 * "casa de temporada" só resolve certo hoje porque coincide com um apelido
 * que eu mesmo cadastrei em nichos.ts. É frágil: qualquer OUTRA forma de
 * pedir a mesma coisa ("airbnb", "temporada perto de cachoeira") não bate em
 * nenhum apelido e cairia no pitch genérico, perdendo a menção à comissão de
 * plataforma — que é o argumento mais forte desse nicho.
 *
 * Com `tourism` capturado em search.ts, a categoria salva no banco é sempre
 * a TAG ("apartment"), não o texto que a pessoa digitou — então o pitch
 * certo aparece não importa como a busca foi feita.
 */
console.log("\n[por que capturar a tag importa, não só o texto digitado]");
ok(
  "termo sem apelido cadastrado cai no genérico (o risco que a tag evita)",
  nichoDe("airbnb").dor !== nichoDe("apartment").dor,
);
ok(
  "a tag do OSM sempre resolve certo, não depende de o texto bater apelido",
  nichoDe("apartment").dor.includes("comissão"),
);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
