import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { valido, formatar, extrairDeTexto } from "@/lib/cnpj";
import { consultarCnpj } from "@/lib/receita";

/**
 * O que este teste protege:
 *  1. lixo de 14 dígitos não vira consulta à Receita — medido nos sites reais
 *     desta base, 5 dos 6 números achados no HTML eram falso positivo;
 *  2. o sócio que ADMINISTRA vem primeiro, que é com quem você quer falar;
 *  3. CNPJ inválido nem sai para a rede.
 */

let falhas = 0;
function ok(titulo: string, condicao: boolean, detalhe = "") {
  console.log(
    condicao ? `  ok   ${titulo}` : `  FALHA ${titulo}${detalhe ? ` -> ${detalhe}` : ""}`,
  );
  if (!condicao) falhas++;
}

async function main() {
  console.log("\n[validacao]");
  ok("aceita CNPJ real", valido("02.396.816/0001-01"));
  ok("recusa lixo de 14 digitos", !valido("61565880727247"));
  ok("recusa todos iguais", !valido("00000000000000"));
  ok("recusa curto", !valido("1234"));
  ok(
    "formata",
    formatar("02396816000101") === "02.396.816/0001-01",
    formatar("02396816000101"),
  );

  console.log("\n[extracao de texto]");
  const html =
    '<footer>Rua X, 10 - CNPJ: 02.396.816/0001-01</footer>' +
    '<div style="width:61565880727247px">lixo</div> repetido 02396816000101';
  const achados = extrairDeTexto(html);
  ok("acha o CNPJ do rodape", achados.includes("02396816000101"), achados.join(","));
  ok("descarta o falso positivo", !achados.includes("61565880727247"));
  ok("nao repete", achados.length === 1, String(achados.length));

  console.log("\n[consulta real]");
  const r = await consultarCnpj("02.396.816/0001-01");
  if (!r.ok) {
    ok("consulta respondeu", false, r.erro);
  } else {
    const d = r.dados;
    console.log(`  razao: ${d.razaoSocial}`);
    console.log(
      `  socios: ${d.socios
        .map((s) => `${s.nome} [${s.qualificacao}]${s.decide ? " <-decide" : ""}`)
        .join(" | ")}`,
    );
    ok("trouxe razao social", d.razaoSocial.length > 0);
    ok("trouxe socios", d.socios.length > 0);
    ok("quem administra vem primeiro", d.socios[0].decide === true, d.socios[0].qualificacao);
    ok(
      "telefone formatado",
      d.telefone === null || /^\(\d{2}\) \d{4,5}-\d{4}$/.test(d.telefone),
      String(d.telefone),
    );
  }

  console.log("\n[erros]");
  const inv = await consultarCnpj("11111111111111");
  ok(
    "CNPJ invalido nao vai pra rede",
    !inv.ok && /inv[áa]lido/i.test(inv.erro),
    JSON.stringify(inv),
  );

  console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} falha(s).\n`);
  // `process.exit` aqui derrubava o Node no meio do encerramento do fetch
  // (assertion do libuv no Windows). `exitCode` deixa o processo terminar só.
  process.exitCode = falhas === 0 ? 0 : 1;
}

main();
