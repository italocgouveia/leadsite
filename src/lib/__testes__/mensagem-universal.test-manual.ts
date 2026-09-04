import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import {
  montarMensagemUniversal,
  nomeParaMensagem,
  MENSAGEM_BASE,
  PLACEHOLDER,
} from "@/lib/mensagem-universal";

/**
 * Prova que a primeira abordagem é UMA copy só.
 *
 * O teste central é o de igualdade: gera para leads de nichos, portes e
 * presenças digitais diferentes, tira o nome da empresa de cada mensagem e
 * exige que o que sobra seja byte a byte idêntico. Se algum dia o nicho, a
 * solução, o score ou a IA voltarem a mexer no texto, este teste quebra — que
 * é exatamente o que se quer dele.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:universal
 */

let p = 0;
let f = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) {
    p++;
    console.log(`  [PASS] ${n}${d ? ` — ${d}` : ""}`);
  } else {
    f++;
    console.log(`  [FAIL] ${n}${d ? ` — ${d}` : ""}`);
  }
};

/** Leads deliberadamente diferentes em tudo que ANTES mudava a mensagem. */
const LEADS: Partial<Lead>[] = [
  { nome: "Oficina ABC", categoria: "car_repair", statusSite: "sem-site" as never, score: 90 },
  { nome: "Auto Center Silva", categoria: "car_repair", website: "https://x.com", score: 20 },
  { nome: "Pousada Sol", categoria: "guest_house", instagram: "https://insta", score: 75 },
  { nome: "Clínica Vida", categoria: "clinic", nota: 4.9, avaliacoes: 300 },
  { nome: "Pet Feliz", categoria: "pet", score: 10 },
  { nome: "Lava Rápido Jato", categoria: "car_wash", score: 88 },
  { nome: "Imobiliária Central", categoria: "estate_agent", score: 60 },
  { nome: "Barbearia do Zé", categoria: "barber", score: 45 },
  { nome: "Consultório Dr. Ana", categoria: "dentist", score: 95 },
  { nome: "TecCel Assistência", categoria: "phone_repair", score: 33 },
];

function lead(o: Partial<Lead>): Lead {
  return { cidade: "Uberlândia", etapa: "novo", fotos: [], ...o } as unknown as Lead;
}

function main() {
  console.log("\n=== A. A COPY ===");
  ok("1. a mensagem-base tem o marcador", MENSAGEM_BASE.includes(PLACEHOLDER));
  ok(
    "2. a base NÃO cita produto nem solução",
    !/\b(site|chatbot|sistema de|automação|catálogo|agendamento)\b/i.test(MENSAGEM_BASE),
    MENSAGEM_BASE.slice(0, 60) + "…",
  );
  ok(
    "3. a base NÃO inventa nome de pessoa",
    !/\b(sou o|sou a|meu nome é|me chamo)\s+[A-ZÁÉÍÓÚ]/.test(MENSAGEM_BASE),
  );

  console.log("\n=== B. SUBSTITUIÇÃO DO NOME ===");
  const m1 = montarMensagemUniversal(lead({ nome: "Oficina ABC" }));
  ok("4. o marcador some da mensagem final", !m1.includes(PLACEHOLDER));
  ok("5. o nome da empresa aparece", m1.includes("Oficina ABC"));
  ok(
    "6. nomes diferentes geram mensagens diferentes",
    m1 !== montarMensagemUniversal(lead({ nome: "Pousada Sol" })),
  );

  console.log("\n=== C. O TESTE QUE IMPORTA: SÓ O NOME MUDA ===");
  /**
   * Remove o nome de cada mensagem e compara o resto. Duas mensagens da mesma
   * copy viram strings idênticas; qualquer palavra, emoji ou pontuação
   * diferente aparece aqui.
   */
  const esqueletos = LEADS.map((l) => {
    const nome = nomeParaMensagem(lead(l));
    return {
      empresa: l.nome!,
      esqueleto: montarMensagemUniversal(lead(l)).split(nome).join(PLACEHOLDER),
    };
  });

  const primeiro = esqueletos[0].esqueleto;
  const divergentes = esqueletos.filter((e) => e.esqueleto !== primeiro);
  ok(
    `7. os ${LEADS.length} leads têm o MESMO texto fora o nome`,
    divergentes.length === 0,
    divergentes.length ? `divergiram: ${divergentes.map((d) => d.empresa).join(", ")}` : "idênticos",
  );
  ok("8. o esqueleto é exatamente a mensagem-base", primeiro === MENSAGEM_BASE);

  console.log("\n=== D. O QUE NÃO PODE INFLUENCIAR ===");
  const mesmoNome = "Empresa X";
  const variacoes: [string, Partial<Lead>][] = [
    ["nicho oficina", { nome: mesmoNome, categoria: "car_repair" }],
    ["nicho pousada", { nome: mesmoNome, categoria: "guest_house" }],
    ["nicho sem perfil", { nome: mesmoNome, categoria: "loja_desconhecida" }],
    ["score alto", { nome: mesmoNome, categoria: "car_repair", score: 99 }],
    ["score baixo", { nome: mesmoNome, categoria: "car_repair", score: 1 }],
    ["com site", { nome: mesmoNome, categoria: "car_repair", website: "https://x.com" }],
    ["sem site", { nome: mesmoNome, categoria: "car_repair", website: null }],
    ["com Instagram", { nome: mesmoNome, categoria: "car_repair", instagram: "https://i" }],
    ["nota 5", { nome: mesmoNome, categoria: "car_repair", nota: 5, avaliacoes: 900 }],
    ["cidade outra", { nome: mesmoNome, categoria: "car_repair", cidade: "São Paulo" }],
  ];
  const textos = new Set(variacoes.map(([, l]) => montarMensagemUniversal(lead(l))));
  ok(
    "9. nicho, score, site, Instagram, nota e cidade NÃO mudam o texto",
    textos.size === 1,
    `${textos.size} texto(s) distinto(s) para o mesmo nome`,
  );

  console.log("\n=== E. NOME SUJO E FALTANDO ===");
  ok(
    "10. lead sem nome usa fallback que encaixa na frase",
    montarMensagemUniversal(lead({ nome: "" })).includes("Vi a empresa de vocês e queria") &&
      !montarMensagemUniversal(lead({ nome: "" })).includes(PLACEHOLDER),
    montarMensagemUniversal(lead({ nome: "" })).slice(30, 72),
  );
  ok(
    "11. corta sufixo societário",
    nomeParaMensagem(lead({ nome: "Oficina do João LTDA" })) === "Oficina do João",
    nomeParaMensagem(lead({ nome: "Oficina do João LTDA" })),
  );
  ok(
    "12. corta endereço colado depois de traço",
    nomeParaMensagem(lead({ nome: "Prime Car - Av Brasil 1200" })) === "Prime Car",
    nomeParaMensagem(lead({ nome: "Prime Car - Av Brasil 1200" })),
  );
  ok(
    "13. CAIXA ALTA vira Capitalizado (não grita)",
    nomeParaMensagem(lead({ nome: "AUTO CENTER SILVA" })) === "Auto Center Silva",
    nomeParaMensagem(lead({ nome: "AUTO CENTER SILVA" })),
  );
  ok(
    "14. nome absurdamente longo cai no fallback",
    nomeParaMensagem(lead({ nome: "X".repeat(80) })) === "de vocês",
  );
  ok("15. nome de 1 letra cai no fallback", nomeParaMensagem(lead({ nome: "A" })) === "de vocês");

  console.log("\n=== F. DETERMINISMO ===");
  const l = lead({ nome: "Oficina ABC", categoria: "car_repair" });
  const dez = new Set(Array.from({ length: 10 }, () => montarMensagemUniversal(l)));
  ok("16. gerar 10 vezes dá sempre o mesmo texto", dez.size === 1);
  ok(
    "17. a função é síncrona (não há como chamar IA)",
    typeof montarMensagemUniversal(l) === "string",
    "retorno é string, não Promise",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
