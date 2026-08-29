import { siglaDoEstado, ondeFica } from "@/lib/categoria-nome";

/**
 * Trava a forma canônica do estado e a concordância de "aqui em/na".
 * Rode com: npm run test:estado
 */
let falhas = 0;
const ok = (r: string, c: boolean, d = "") => { if (!c) falhas++; console.log(`  ${c ? "ok  " : "FALHA"}  ${r}${d ? " — " + d : ""}`); };

console.log("\n[estado sempre em sigla]");
ok("sigla passa igual", siglaDoEstado("MG") === "MG");
ok("minúscula vira maiúscula", siglaDoEstado("mg") === "MG");
ok("nome por extenso vira sigla", siglaDoEstado("Minas Gerais") === "MG");
ok("com acento também", siglaDoEstado("Goiás") === "GO");
ok("sem acento também", siglaDoEstado("Goias") === "GO");
ok("nome composto", siglaDoEstado("Rio Grande do Sul") === "RS");
ok("espaço sobrando", siglaDoEstado("  São Paulo  ") === "SP");
ok("vazio vira null", siglaDoEstado("") === null);
ok("null vira null", siglaDoEstado(null) === null);

/**
 * O caso que motivou tudo: as duas rotas de busca gravavam formatos
 * diferentes, criando "Pirenópolis/Goiás" e "Pirenópolis/GO" como lugares
 * distintos e escondendo metade dos leads de quem filtrasse por um deles.
 */
console.log("\n[as duas rotas convergem]");
ok(
  "seletor da tela e Nominatim dão o mesmo resultado",
  siglaDoEstado("GO") === siglaDoEstado("Goiás"),
  `ambos -> ${siglaDoEstado("Goiás")}`,
);

console.log("\n[concordância de 'aqui em/na']");
ok("com cidade", ondeFica("Capitólio") === "aqui em Capitólio");
ok("sem cidade não vira 'em a região'", ondeFica(null) === "aqui na região");
ok("cidade vazia idem", ondeFica("   ") === "aqui na região");

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
