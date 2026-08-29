import {
  MARCA_SAUDACAO,
  aberturaSaudacao,
  reinserirSaudacao,
  resolverSaudacao,
  saudacaoDe,
} from "@/lib/saudacao";

/**
 * Trava a saudação por hora do dia.
 * Rode com: npm run test:saudacao
 *
 * O caso que mais importa aqui é o do MARCADOR VAZANDO. O texto guarda
 * `{{saudacao}}` porque a fila leva dias para escoar, mas todo caminho que
 * mostra ou envia a mensagem precisa resolver antes — senão o lead recebe
 * "{{saudacao}}, tudo bem?" literal.
 */

let falhas = 0;
function ok(rotulo: string, condicao: boolean, detalhe = "") {
  if (!condicao) falhas++;
  console.log(`  ${condicao ? "ok  " : "FALHA"}  ${rotulo}${detalhe ? " — " + detalhe : ""}`);
}

const em = (iso: string) => new Date(iso);

console.log("\n[faixas do dia]");
ok("05:00 é bom dia", saudacaoDe(em("2026-08-25T05:00:00-03:00")) === "Bom dia");
ok("11:59 ainda é bom dia", saudacaoDe(em("2026-08-25T11:59:00-03:00")) === "Bom dia");
ok("12:00 vira boa tarde", saudacaoDe(em("2026-08-25T12:00:00-03:00")) === "Boa tarde");
ok("17:59 ainda é boa tarde", saudacaoDe(em("2026-08-25T17:59:00-03:00")) === "Boa tarde");
ok("18:00 vira boa noite", saudacaoDe(em("2026-08-25T18:00:00-03:00")) === "Boa noite");
ok("03:00 é boa noite", saudacaoDe(em("2026-08-25T03:00:00-03:00")) === "Boa noite");

/**
 * O fuso é fixo em São Paulo, não o do servidor. Na Vercel o relógio é UTC:
 * 21h de Uberlândia seria meia-noite, e o lead receberia "Bom dia" no jantar.
 */
console.log("\n[fuso fixo, não o do servidor]");
ok(
  "21h de Brasília não vira madrugada",
  saudacaoDe(em("2026-08-26T00:00:00Z")) === "Boa noite",
  "00:00 UTC = 21:00 em São Paulo",
);

console.log("\n[abertura]");
ok("sem sócios abre neutro", aberturaSaudacao({ socios: null }) === `${MARCA_SAUDACAO}, tudo bem?`);
ok(
  "usa quem administra, não o primeiro",
  aberturaSaudacao({
    socios: [
      { nome: "ANA PAULA", decide: false },
      { nome: "ROBERTO LIMA", decide: true },
    ],
  }) === `${MARCA_SAUDACAO} Roberto, tudo bem?`,
);
ok(
  "CAIXA ALTA da Receita vira nome normal",
  aberturaSaudacao({ socios: [{ nome: "CARLOS EDUARDO", decide: true }] }) ===
    `${MARCA_SAUDACAO} Carlos, tudo bem?`,
);

console.log("\n[resolver]");
const abertura = aberturaSaudacao({ socios: null });
ok(
  "às 9h abre com Bom dia",
  resolverSaudacao(abertura, em("2026-08-25T09:00:00-03:00")) === "Bom dia, tudo bem?",
);
ok(
  "não sobra chave dupla",
  !/\{\{|\}\}/.test(resolverSaudacao(abertura, em("2026-08-25T09:00:00-03:00"))),
);
ok("texto sem marcador passa igual", resolverSaudacao("Boa!") === "Boa!");

/**
 * A volta existe para a edição manual: a tela mostra "Bom dia" resolvido, e
 * salvar o que se vê chumbaria a saudação do momento da edição.
 */
console.log("\n[reinserir, para a edição manual não chumbar a saudação]");
ok(
  "Bom dia no começo volta a ser marcador",
  reinserirSaudacao("Bom dia, tudo bem?") === `${MARCA_SAUDACAO}, tudo bem?`,
);
ok(
  "Boa tarde também",
  reinserirSaudacao("Boa tarde Roberto, tudo bem?") === `${MARCA_SAUDACAO} Roberto, tudo bem?`,
);
ok(
  "saudação no MEIO do texto não vira variável",
  reinserirSaudacao("Oi! Passando para dar bom dia.") === "Oi! Passando para dar bom dia.",
);
ok(
  "ida e volta é estável",
  reinserirSaudacao(resolverSaudacao(abertura)) === abertura,
);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
