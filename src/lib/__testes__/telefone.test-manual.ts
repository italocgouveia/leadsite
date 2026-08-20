import { validarTelefone, linkWhatsapp } from "../telefone";

const CASOS: [string, boolean, string?][] = [
  // válidos
  ["(34) 99134-5424", true, "(34) 99134-5424"],
  ["+55 34 99134 5424", true, "(34) 99134-5424"],
  ["34991345424", true, "(34) 99134-5424"],
  ["(34) 3210-9333", true, "(34) 3210-9333"],
  ["+55 34 3210 9333", true, "(34) 3210-9333"],
  ["034991345424", true, "(34) 99134-5424"],

  // inválidos — o caso real que passou batido antes
  ["+55 34 0 07710522", false],
  ["+55 34 8134-5424", false], // celular sem o 9
  ["(01) 99134-5424", false], // DDD inexistente
  ["(00) 99134-5424", false],
  ["1234", false],
  ["(34) 1234-5678", false], // fixo começando com 1
  ["", false],
];

let falhas = 0;
for (const [entrada, deveValer, formatoEsperado] of CASOS) {
  const v = validarTelefone(entrada);
  const ok = deveValer ? v !== null : v === null;
  const formatoOk = !formatoEsperado || v?.formatado === formatoEsperado;
  if (!ok || !formatoOk) falhas++;
  console.log(
    `${ok && formatoOk ? "OK   " : "FALHA"} ${entrada.padEnd(22)} → ${v ? `${v.formatado} (${v.tipo})` : "recusado"}`,
  );
}

console.log(`\nlink de exemplo: ${linkWhatsapp("(34) 99134-5424")}`);
console.log(falhas === 0 ? `${CASOS.length} casos, todos passaram.` : `${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
