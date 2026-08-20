import type { Lead } from "@/lib/db/schema";
import { escolherProduto } from "@/lib/produto";
import { avaliar } from "@/lib/oportunidade";
import { montarProposta } from "@/lib/proposta";

/**
 * Casos do motor de produto (site x chatbot x pacote).
 *
 * O que este teste protege, em ordem de importância:
 *  1. chatbot NUNCA é oferecido sem WhatsApp — é o produto rodando em cima do
 *     número; prometer sem número é vender fumaça;
 *  2. quem já tem site parou de ser descarte;
 *  3. a mensagem não afirma nada que a gente não conseguiu verificar.
 */

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "x",
    nome: "Auto Center Silva",
    categoria: "car_repair",
    cidade: "Uberlândia",
    estado: "MG",
    statusSite: "sem-site",
    score: 70,
    temperatura: "quente",
    etapa: "novo",
    whatsapp: "https://wa.me/5534999887766",
    telefone: "(34) 99988-7766",
    nota: 4.7,
    avaliacoes: 80,
    horarios: "Seg a Sex 08:00-18:00",
    instagram: null,
    ...p,
  } as Lead;
}

let falhas = 0;
function checar(titulo: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    console.log(`  ok   ${titulo}`);
  } else {
    falhas++;
    console.log(`  FALHA ${titulo}${detalhe ? ` → ${detalhe}` : ""}`);
  }
}

console.log("\n— escolha de produto —");

const semSiteComMovimento = escolherProduto(lead());
checar(
  "sem site + movimento → pacote",
  semSiteComMovimento.produto === "site-e-chatbot",
  semSiteComMovimento.produto,
);

const temSite = escolherProduto(lead({ statusSite: "tem-site" }));
checar("já tem site + WhatsApp + movimento → chatbot", temSite.produto === "chatbot", temSite.produto);

const temSiteSemZap = escolherProduto(
  lead({ statusSite: "tem-site", whatsapp: null, telefone: null }),
);
checar(
  "já tem site SEM WhatsApp → nunca chatbot",
  temSiteSemZap.produto === "site",
  temSiteSemZap.produto,
);

const semSiteSemZap = escolherProduto(
  lead({ whatsapp: null, telefone: null, avaliacoes: 200, horarios: "24h" }),
);
checar(
  "sem WhatsApp, mesmo com muito movimento → nunca chatbot",
  semSiteSemZap.produto === "site",
  semSiteSemZap.produto,
);

const semSinal = escolherProduto(
  lead({ statusSite: "tem-site", avaliacoes: 2, horarios: null, instagram: null }),
);
checar(
  "site pronto mas sem sinal de movimento → não força chatbot",
  semSinal.produto === "site",
  semSinal.produto,
);

console.log("\n— nível de oportunidade —");

const antesDescartado = avaliar(lead({ statusSite: "tem-site" }));
checar(
  "quem já tem site deixou de ser 'média'",
  antesDescartado.nivel !== "media",
  antesDescartado.nivel,
);
checar(
  "resumo não repete Instagram/movimento",
  !/Instagram ativo \+ Instagram/.test(antesDescartado.resumo),
  antesDescartado.resumo,
);

console.log("\n— mensagem de chatbot —");

const msg = montarProposta(lead({ statusSite: "tem-site" })).mensagem;
console.log("\n" + msg + "\n");
checar("fala de atendente, não de site", /atendente de WhatsApp/.test(msg));
checar("não começa a tarefa com 'evitar'", !/assume a parte de evitar/.test(msg), msg);
checar("tarefa longa fica no fim da frase", /assume a parte de [^.]+\.$/m.test(msg), msg);
checar(
  "não repete o número de avaliações em frases coladas",
  (msg.match(/80 avaliações/g) ?? []).length === 1,
  msg,
);

// Sem nota, o número não foi citado no elogio: aí ele PODE aparecer aqui.
const semNota = montarProposta(
  lead({ statusSite: "tem-site", nota: null, avaliacoes: 60 }),
).mensagem;
checar("sem nota, ancora no número de avaliações", /60 avaliações no Google/.test(semNota), semNota);
checar(
  "não afirma perda de cliente (chute)",
  !/perde|perdendo|deixa de ganhar|est[áa] perdendo/i.test(msg),
);

// Dor de comissão não pode virar "o bot assume a parte de pagar comissão".
const pousada = montarProposta(
  lead({ statusSite: "tem-site", categoria: "guest_house" }),
).mensagem;
checar(
  "dor de comissão não vira tarefa do bot",
  !/assume a parte de (pagar|depender)/.test(pousada),
  pousada.split("\n").find((l) => l.includes("assume a parte")) ?? "",
);

console.log("\n— pacote —");
const pacote = montarProposta(lead()).mensagem;
checar("pacote puxa pelo site", /modelo de/.test(pacote));
checar("pacote cita o chatbot em uma linha", /respondendo sozinho/.test(pacote));

console.log(
  falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} caso(s) falharam.\n`,
);
process.exit(falhas === 0 ? 0 : 1);
