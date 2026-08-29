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
ok("restaurante fica sem encaixe de sistema", espetinho.serve === false);

const petshopReal = avaliarSistema(lead({ nome: "PetPlus", categoria: "pet" }));
ok("petshop de verdade continua casando", /banho e tosa/i.test(petshopReal.sistema));

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
ok("restaurante nao gera mensagem", montarPropostaSistema(lead({ categoria: "restaurant", nome: "Espetinho Avenida" })) === null);

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
