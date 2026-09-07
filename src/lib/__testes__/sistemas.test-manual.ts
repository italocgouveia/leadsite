import type { Lead } from "@/lib/db/schema";
import {
  avaliarSistema,
  modulosNaFrase,
  montarPropostaSistema,
} from "@/lib/sistemas";

/**
 * O que este teste protege:
 *  1. nome próprio não pode casar por substring — "Espetinho" virou petshop
 *     na primeira rodada contra dados reais, e o restaurante ia receber
 *     "Sistema de banho e tosa";
 *  2. sem WhatsApp o encaixe nunca é alto — não há como abordar nem como o
 *     sistema receber pedido;
 *  3. a mensagem não afirma que a empresa usa planilha; ela PERGUNTA.
 */

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "x",
    nome: "Box 34 Centro Automotivo",
    categoria: "car_repair",
    cidade: "Uberlândia",
    statusSite: "sem-site",
    score: 70,
    etapa: "novo",
    whatsapp: "https://wa.me/5534999887766",
    horarios: "Seg a Sex 08:00-18:00",
    endereco: "Av. Rondon Pacheco, 100",
    socios: null,
    ...p,
  } as Lead;
}

let falhas = 0;
function ok(titulo: string, condicao: boolean, detalhe = "") {
  console.log(
    condicao ? `  ok   ${titulo}` : `  FALHA ${titulo}${detalhe ? ` -> ${detalhe}` : ""}`,
  );
  if (!condicao) falhas++;
}

console.log("\n[encaixe por ramo]");
ok("oficina recebe sistema de OS", /ordem de servi/i.test(avaliarSistema(lead()).sistema));
ok(
  "salão recebe agendamento com comissão",
  avaliarSistema(lead({ categoria: "hairdresser" })).modulos.includes("comissao"),
);
ok(
  "imobiliária recebe CRM",
  /CRM/.test(avaliarSistema(lead({ categoria: "estate_agent" })).sistema),
);

console.log("\n[substring nao pode casar em nome proprio]");
const espetinho = avaliarSistema(
  lead({ nome: "Espetinho Avenida", categoria: "restaurant" }),
);
ok(
  "restaurante 'Espetinho' NAO vira petshop",
  !/banho e tosa/i.test(espetinho.sistema),
  espetinho.sistema || "(sem encaixe)",
);
/**
 * O que este bloco protege é o CASAMENTO ERRADO, não a ausência de encaixe.
 *
 * "Espetinho" contém a substring "pet", e a régua de perfis casaria o
 * restaurante com o perfil de pet shop se olhasse por substring solta.
 *
 * A asserção antiga era `serve === false`, o que só funcionava enquanto
 * `restaurant` não tinha perfil nenhum. Ele tem — cardápio e pedidos — e desde
 * então esta linha vinha falhando. O certo é exigir o perfil CORRETO, que
 * continua provando a mesma coisa e não quebra quando um ramo ganha encaixe.
 */
ok("restaurante 'Espetinho' recebe o perfil de restaurante", espetinho.serve === true);
ok(
  "e o perfil é o de pedidos/cardápio, nao o de pet",
  /pedidos|card[áa]pio/i.test(espetinho.sistema) && !espetinho.modulos.includes("pets"),
  espetinho.sistema,
);

const petshopReal = avaliarSistema(lead({ nome: "PetPlus", categoria: "pet" }));
ok(
  "petshop de verdade continua casando",
  petshopReal.modulos.includes("pets") && /banho e tosa/i.test(petshopReal.dor),
  petshopReal.sistema,
);

console.log("\n[nivel]");
ok("com zap + horario + endereco = alto", avaliarSistema(lead()).nivel === "alto");
ok(
  "sem WhatsApp nunca e alto",
  avaliarSistema(lead({ whatsapp: null })).nivel === "baixo",
  avaliarSistema(lead({ whatsapp: null })).nivel,
);

console.log("\n[mensagem]");
const m = montarPropostaSistema(lead()) ?? "";
console.log("\n" + m + "\n");
ok("plural correto do ramo", !/oficina mec[âa]nicas/i.test(m), m);
ok("modulos com virgula e 'e', nao com '·'", !m.includes("·"), m);
ok(
  "PERGUNTA em vez de afirmar que usa planilha",
  /controlam isso em caderno, planilha ou algum sistema\?/.test(m),
);
ok(
  "nao afirma que a empresa perde dinheiro",
  !/perde|perdendo|preju[íi]zo/i.test(m),
);
/**
 * Mesma correção do bloco acima: restaurante passou a ter encaixe, então ele
 * gera mensagem. O que não pode é a mensagem falar de pet.
 */
const mRest = montarPropostaSistema(lead({ categoria: "restaurant", nome: "Espetinho Avenida" })) ?? "";
ok("restaurante gera mensagem do proprio ramo", mRest.length > 0);
/**
 * O padrão testa VOCABULÁRIO de pet shop, não a substring "pet" — que aparece
 * legitimamente dentro de "Espetinho", que é o nome da empresa. Procurar a
 * substring aqui repetiria dentro do teste exatamente o bug que ele existe
 * para pegar.
 */
ok(
  "e a mensagem nao fala de pet shop",
  !/banho e tosa|ficha do (pet|animal)|\bpets\b|do animal/i.test(mRest),
  mRest.slice(0, 90),
);

console.log("\n[frase dos modulos]");
ok(
  "junta com virgula e 'e'",
  modulosNaFrase(["agendamento", "clientes", "financeiro"]) ===
    "agendamento, clientes e financeiro",
  modulosNaFrase(["agendamento", "clientes", "financeiro"]),
);
ok("um modulo só nao leva 'e'", modulosNaFrase(["estoque"]) === "estoque");

console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} falha(s).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
