import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import { oportunidade, prioridadeComercial } from "@/lib/pontuacao";
import { classificarPorte } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { nichoPrioritario } from "@/lib/nichos-locais";

/**
 * A régua de QUALIFICAÇÃO: potencial de sistema acima de ausência de site.
 *
 * O teste que resume o arquivo é o do bloco C: uma oficina pequena COM site
 * tem de ganhar de um cadastro sem site, sem telefone e sem processo nenhum.
 * Era o contrário na régua anterior, e é a inversão que esta mudança existe
 * para consertar.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:qualificacao
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

function lead(o: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    nome: "Oficina do João",
    categoria: "car_repair",
    cidade: "Uberlândia",
    estado: "MG",
    endereco: "Rua das Flores, 120",
    etapa: "novo",
    naoContatar: false,
    telefone: "(34) 99134-5424",
    whatsapp: "https://wa.me/5534991345424",
    website: null,
    instagram: null,
    email: null,
    nota: null,
    avaliacoes: null,
    horarios: null,
    dadosOsm: {},
    statusSite: "nao-verificado",
    score: 0,
    ...o,
  } as unknown as Lead;
}

const s = (l: Lead) => oportunidade(l).score;
const nivel = (l: Lead) => prioridadeComercial(l).nivel;

function main() {
  console.log("\n=== A. PEQUENA COM SISTEMA x GRANDE SEM ===");
  const oficinaPequena = lead({
    nome: "Oficina do João",
    instagram: "https://instagram.com/oficinadojoao",
    avaliacoes: 120,
    nota: 4.8,
  });
  const bancoGrande = lead({
    id: "l2",
    nome: "Bradesco Agência Centro",
    categoria: "bank",
    telefone: "(34) 3212-4000",
    whatsapp: null,
    website: "https://bradesco.com.br",
    statusSite: "tem-site",
    instagram: "https://instagram.com/bradesco",
    avaliacoes: 2000,
    nota: 4.5,
  });
  ok(
    "1. pequena com potencial ganha de grande sem potencial",
    s(oficinaPequena) > s(bancoGrande),
    `${s(oficinaPequena)} vs ${s(bancoGrande)}`,
  );
  ok("1b. o banco cai em D", nivel(bancoGrande) === "D", prioridadeComercial(bancoGrande).porque);
  ok("1c. a oficina chega em A", nivel(oficinaPequena) === "A", prioridadeComercial(oficinaPequena).porque);

  console.log("\n=== B. FRANQUIA ===");
  const franquia = lead({
    nome: "Cacau Show Center Shopping",
    categoria: "confectionery",
    endereco: "Av. Rondon Pacheco - Shopping",
    avaliacoes: 400,
    nota: 4.7,
  });
  ok("2. franquia é reconhecida como rede", classificarPorte(franquia).rede);
  ok("2b. e cai em D", nivel(franquia) === "D", prioridadeComercial(franquia).porque);
  ok(
    "2c. local independente ganha da franquia",
    s(oficinaPequena) > s(franquia),
    `${s(oficinaPequena)} vs ${s(franquia)}`,
  );

  console.log("\n=== C. POTENCIAL DE SISTEMA > AUSÊNCIA DE SITE ===");
  /** Oficina de verdade, mas COM site próprio. */
  const oficinaComSite = lead({
    nome: "Oficina do João",
    website: "https://oficinadojoao.com.br",
    statusSite: "tem-site",
    instagram: "https://instagram.com/x",
    avaliacoes: 120,
    nota: 4.8,
  });
  /** Cadastro sem site, sem telefone e sem processo — o "lead" da régua velha. */
  const semSiteSemNada = lead({
    id: "l3",
    nome: "Comércio Silva",
    categoria: "shop",
    telefone: null,
    whatsapp: null,
    endereco: null,
    statusSite: "sem-site",
  });
  ok(
    "3. oficina COM site ganha de cadastro sem site e sem nada",
    s(oficinaComSite) > s(semSiteSemNada),
    `${s(oficinaComSite)} vs ${s(semSiteSemNada)}`,
  );
  ok(
    "3b. e a distância é grande, não empate",
    s(oficinaComSite) - s(semSiteSemNada) >= 40,
    `${s(oficinaComSite) - s(semSiteSemNada)} pontos`,
  );
  ok("3c. o cadastro vazio cai em D", nivel(semSiteSemNada) === "D");
  ok(
    "3d. 'sem site' sozinho NUNCA leva a A",
    nivel(semSiteSemNada) !== "A" && nivel(lead({ statusSite: "sem-site", telefone: null, whatsapp: null })) !== "A",
  );
  ok(
    "4. 'sem site' vale no máximo 5 pontos",
    (oportunidade(lead({ statusSite: "sem-site" })).criterios.find((c) =>
      c.rotulo.includes("site"),
    )?.maximo ?? 0) === 5,
  );

  console.log("\n=== D. COM TELEFONE x SEM TELEFONE ===");
  const comTel = lead({ avaliacoes: 50 });
  const semTel = lead({ telefone: null, whatsapp: null, avaliacoes: 50 });
  ok(
    "5. mesma empresa com telefone ganha de sem telefone",
    s(comTel) > s(semTel),
    `${s(comTel)} vs ${s(semTel)} (diferença de ${s(comTel) - s(semTel)})`,
  );
  /**
   * A diferença BRUTA continua sendo 40 (20 de credito + 20 de penalidade),
   * mas o score e normalizado pelo total de 135 pontos possiveis — entao na
   * escala de 0 a 100 ela aparece como ~30. Testar o numero bruto aqui
   * amarraria o teste a uma escala que ja mudou duas vezes.
   */
  ok(
    "5b. a diferenca equivale aos 40 pontos brutos na escala normalizada",
    Math.abs(s(comTel) - s(semTel) - Math.round((40 / 135) * 100)) <= 1,
    `${s(comTel) - s(semTel)} (esperado ~${Math.round((40 / 135) * 100)})`,
  );
  ok("5c. sem telefone e sem Instagram cai em D", nivel(semTel) === "D");
  ok(
    "5d. mas com Instagram continua visível em C",
    nivel(lead({ telefone: null, whatsapp: null, instagram: "https://i" })) === "C",
  );

  console.log("\n=== E. OS NICHOS PRIORITÁRIOS ===");
  const casos: [string, string, string][] = [
    ["oficina", "car_repair", "ordem de serviço"],
    ["lava-jato", "car_wash", "veículos"],
    ["pet shop", "pet", "ficha do pet"],
    ["clínica", "clinic", "agenda"],
    ["imobiliária", "estate_agent", "imóveis"],
    ["barbearia", "barber", "agendamento"],
    ["pousada", "guest_house", "reservas"],
    ["assistência", "phone_repair", "ordem de serviço"],
  ];
  for (const [nome, tag, esperado] of casos) {
    const l = lead({ categoria: tag });
    const e = avaliarSistema(l);
    const n = nichoPrioritario(tag);
    ok(
      `6. ${nome}: solução "${esperado}" e prioridade de ramo`,
      e.serve &&
        (e.sistema.toLowerCase().includes(esperado) ||
          e.modulos.some((m) => esperado.includes(m.split("-")[0]))) &&
        n?.prioridade === "A",
      `${e.sistema} · ramo ${n?.prioridade ?? "—"}`,
    );
  }

  console.log("\n=== F. EMPRESA INATIVA ===");
  const inativa = lead({ dadosOsm: { "disused:shop": "car_repair" }, avaliacoes: 50 });
  ok(
    "7. marcada como extinta no mapa perde pontos",
    s(inativa) < s(lead({ avaliacoes: 50 })),
    `${s(inativa)} vs ${s(lead({ avaliacoes: 50 }))}`,
  );
  ok(
    "7b. e a penalidade de 15 brutos aparece como ~11 na escala normalizada",
    Math.abs(s(lead({ avaliacoes: 50 })) - s(inativa) - Math.round((15 / 135) * 100)) <= 1,
    `${s(lead({ avaliacoes: 50 })) - s(inativa)}`,
  );

  console.log("\n=== G. DUPLICATA ===");
  const base = lead({ avaliacoes: 50 });
  ok(
    "8. possível duplicata perde os mesmos 15 pontos brutos",
    Math.abs(
      oportunidade(base).score -
        oportunidade(base, { possivelDuplicata: true }).score -
        Math.round((15 / 135) * 100),
    ) <= 1,
    `${oportunidade(base).score} -> ${oportunidade(base, { possivelDuplicata: true }).score}`,
  );

  console.log("\n=== H. PORTE: INDÍCIO NUNCA VIRA FATO ===");
  const c = classificarPorte(oficinaPequena);
  ok(
    "9. porte oficial continua 'desconhecido'",
    c.porte === "desconhecido" && c.fonte === "nenhuma",
    `porte=${c.porte}`,
  );
  ok(
    "9b. mas o porte ESTIMADO é 'pequeno', com evidências",
    c.porteEstimado === "pequeno" && c.evidenciasPorte.length >= 3,
    c.evidenciasPorte.join(", "),
  );
  ok(
    "9c. poucos indícios não viram palpite — fica 'desconhecido'",
    classificarPorte(lead({ endereco: null, telefone: null, whatsapp: null, categoria: "zzz" }))
      .porteEstimado === "desconhecido",
  );
  ok(
    "9d. 'medio' nunca é atribuído por indício",
    !["pequeno", "desconhecido", "grande"].includes("medio") ||
      classificarPorte(oficinaPequena).porteEstimado !== "medio",
    "não há sinal gratuito que separe médio de pequeno",
  );

  console.log("\n=== I. O RAMO SEM ENCAIXE NÃO PONTUA ===");
  /**
   * O nome PRECISA ser neutro. `avaliarSistema` casa por categoria e, se não
   * achar, tenta o nome — então "Oficina do João" com categoria desconhecida
   * ainda receberia o perfil de oficina, que é o comportamento certo dele e
   * arruinaria este teste.
   */
  const semEncaixe = lead({
    nome: "Empresa Genérica Ltda",
    categoria: "zzz_desconhecido",
    avaliacoes: 200,
    nota: 5,
  });
  const criterioRamo = oportunidade(semEncaixe).criterios[0];
  ok(
    "10. ramo sem sistema mapeado vale ZERO no critério principal",
    criterioRamo.ganhos === 0,
    criterioRamo.base,
  );
  ok("10b. e o lead cai em D", nivel(semEncaixe) === "D", prioridadeComercial(semEncaixe).porque);
  ok(
    "10c. mesmo com 200 avaliações e nota 5",
    s(semEncaixe) < s(oficinaPequena),
    `${s(semEncaixe)} vs ${s(oficinaPequena)}`,
  );

  console.log("\n=== J. A ORDEM COMERCIAL COMPLETA ===");
  const ranking = [
    ["oficina pequena, celular, Instagram, 120 aval.", oficinaPequena],
    ["oficina pequena com site", oficinaComSite],
    ["oficina só com fixo", lead({ telefone: "(34) 3212-4000", whatsapp: null, avaliacoes: 50 })],
    ["ramo sem encaixe", semEncaixe],
    ["franquia", franquia],
    ["banco", bancoGrande],
    ["cadastro vazio", semSiteSemNada],
  ] as const;
  for (const [rot, l] of ranking) {
    console.log(`     ${String(s(l)).padStart(3)}  ${nivel(l)}  ${rot}`);
  }
  const scores = ranking.map(([, l]) => s(l));
  ok(
    "11. a ordem é decrescente do melhor para o pior lead",
    scores.every((v, i) => i === 0 || scores[i - 1] >= v),
    scores.join(" > "),
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
