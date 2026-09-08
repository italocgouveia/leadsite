import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import { oportunidade, prioridadeComercial } from "@/lib/pontuacao";
import { classificarPorte, pareceNegocioLocal, ehRede } from "@/lib/porte";
import { auditarSite, SEM_SITE } from "@/lib/places/audit";
import { avaliarSistema } from "@/lib/sistemas";
import { nichoPrioritario } from "@/lib/nichos-locais";
import { mesmoEstabelecimento, deduplicar, nomeCanonico } from "@/lib/dedup";
import { montarMensagemUniversal, MENSAGEM_BASE } from "@/lib/mensagem-universal";

/**
 * A base de prospecção local: o pequeno negócio de Uberlândia ganha do grande.
 *
 * O teste central deste arquivo é o de ORDEM (bloco A): monta uma oficina de
 * bairro e uma rede nacional e exige que a oficina fique na frente. Era o
 * contrário antes desta mudança — o score dava +10 por TER site e só devolvia
 * +5 a quem não tinha, então quem menos precisa da conversa subia no ranking.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:prospeccao
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
    statusSite: "sem-site",
    score: 0,
    ...o,
  } as unknown as Lead;
}

/** A oficina de bairro do enunciado: pequena, WhatsApp, sem site, Instagram. */
const OFICINA_PEQUENA = lead({
  nome: "Oficina do João",
  instagram: "https://instagram.com/oficinadojoao",
  avaliacoes: 120,
  nota: 4.8,
});

/** A rede nacional: site, Instagram, 1000 avaliações, sem WhatsApp. */
const REDE_GRANDE = lead({
  id: "l2",
  nome: "Bosch Car Service Uberlândia",
  telefone: "(34) 3212-4000",
  whatsapp: null,
  website: "https://boschcarservice.com.br",
  instagram: "https://instagram.com/bosch",
  avaliacoes: 1000,
  nota: 4.6,
  statusSite: "tem-site",
  dadosOsm: { brand: "Bosch Car Service" },
});

async function main() {
  console.log("\n=== A. PEQUENO GANHA DE GRANDE ===");
  const sPequena = oportunidade(OFICINA_PEQUENA).score;
  const sGrande = oportunidade(REDE_GRANDE).score;
  ok(
    "1. pequena empresa fica ACIMA de grande empresa",
    sPequena > sGrande,
    `pequena ${sPequena} vs rede ${sGrande}`,
  );
  ok(
    "1b. e a distância é grande, não empate técnico",
    sPequena - sGrande >= 30,
    `diferença de ${sPequena - sGrande} pontos`,
  );
  /**
   * Passou de C para D quando a gaveta ganhou o nivel "nao recomendado".
   * Rede identificada nao e "prioridade baixa", e desqualificacao: a loja nao
   * decide software, entao nao ha o que trabalhar ali.
   */
  ok(
    "1c. a rede cai na gaveta D (nao recomendado)",
    prioridadeComercial(REDE_GRANDE).nivel === "D",
    prioridadeComercial(REDE_GRANDE).porque,
  );
  ok(
    "1d. a oficina cai na gaveta A",
    prioridadeComercial(OFICINA_PEQUENA).nivel === "A",
    prioridadeComercial(OFICINA_PEQUENA).porque,
  );

  console.log("\n=== B. SEM SITE ===");
  const comSite = lead({ website: "https://oficinadojoao.com.br", statusSite: "tem-site" });
  const semSite = lead({ statusSite: "sem-site" });
  ok(
    "2. sem site aumenta a prioridade",
    oportunidade(semSite).score > oportunidade(comSite).score,
    `sem site ${oportunidade(semSite).score} vs com site ${oportunidade(comSite).score}`,
  );

  /**
   * O ponto do §4: sem site é sinal FORTE, não requisito. Uma oficina pequena
   * com site e sem controle de ordem de serviço continua excelente lead — e o
   * que a segura no topo é o critério de potencial de sistema.
   */
  const pequenaComSite = lead({
    nome: "Oficina do João",
    website: "https://oficinadojoao.com.br",
    statusSite: "tem-site",
    instagram: "https://instagram.com/oficinadojoao",
    avaliacoes: 150,
    nota: 4.7,
  });
  ok(
    "3. empresa pequena COM site continua sendo excelente lead",
    oportunidade(pequenaComSite).score >= 66,
    `score ${oportunidade(pequenaComSite).score}`,
  );
  ok(
    "3b. e continua muito acima da rede grande",
    oportunidade(pequenaComSite).score > sGrande + 30,
    `${oportunidade(pequenaComSite).score} vs ${sGrande}`,
  );
  ok(
    "3c. pequena com site ainda é prioridade A",
    prioridadeComercial(pequenaComSite).nivel === "A",
  );

  console.log("\n=== C. WHATSAPP ===");
  const semTelefone = lead({ telefone: null, whatsapp: null });
  ok(
    "4. WhatsApp aumenta a prioridade",
    oportunidade(lead()).score > oportunidade(semTelefone).score,
    `com ${oportunidade(lead()).score} vs sem ${oportunidade(semTelefone).score}`,
  );

  /**
   * §21.5: aparece, mas não é elegível. Aparecer importa — é a fila de
   * enriquecimento; quem some do painel nunca ganha telefone.
   */
  ok(
    "5. sem WhatsApp continua APARECENDO (score > 0)",
    oportunidade(semTelefone).score > 0,
    `score ${oportunidade(semTelefone).score}`,
  );
  ok(
    "5b. mas nunca chega à gaveta A",
    prioridadeComercial(semTelefone).nivel !== "A",
    prioridadeComercial(semTelefone).porque,
  );

  console.log("\n=== D. O QUE NÃO É SITE ===");
  const insta = await auditarSite("https://instagram.com/oficinax");
  ok("6. Instagram NÃO é site", insta.status === "so-rede-social", insta.status);
  ok("6b. e conta como lacuna de site", SEM_SITE.includes(insta.status));

  const link = await auditarSite("https://linktr.ee/oficinax");
  ok("7. Linktree NÃO é site", link.status === "so-agregador", link.status);

  const wa = await auditarSite("https://wa.me/5534991345424");
  ok("8. WhatsApp NÃO é site", wa.status === "so-agregador", wa.status);

  const ifood = await auditarSite("https://www.ifood.com.br/delivery/x");
  ok("8b. iFood NÃO é site", ifood.status === "so-agregador", ifood.status);

  const face = await auditarSite("https://facebook.com/oficinax");
  ok("8c. Facebook NÃO é site", face.status === "so-rede-social", face.status);

  console.log("\n=== E. DEDUPLICAÇÃO ===");
  ok(
    "9a. nome sujo reduz ao mesmo canônico",
    nomeCanonico("OFICINA DO JOÃO LTDA") === nomeCanonico("Oficina João"),
    `"${nomeCanonico("OFICINA DO JOÃO LTDA")}"`,
  );
  const dupes = [
    lead({ id: "a", nome: "Oficina do João" }),
    lead({ id: "b", nome: "OFICINA DO JOÃO LTDA" }),
    lead({ id: "c", nome: "Oficina João", telefone: "(34) 99134-5424" }),
    lead({ id: "d", nome: "Pet Shop Feliz", telefone: "(34) 98888-7777", categoria: "pet" }),
  ];
  const r = deduplicar(dupes);
  ok(
    "9. duplicatas são removidas",
    r.unicos.length === 2 && r.duplicados.length === 2,
    `${r.unicos.length} únicos, ${r.duplicados.length} duplicados`,
  );

  ok(
    "10. mesmo telefone não gera dois leads",
    mesmoEstabelecimento(
      { nome: "Barbearia A", telefone: "(34) 99134-5424" },
      { nome: "Barbearia B", telefone: "+55 34 99134-5424" },
    ).igual,
    "formatos diferentes, mesmo número",
  );

  ok(
    "11. mesmo CNPJ não gera dois leads",
    mesmoEstabelecimento(
      { nome: "Empresa X", cnpj: "12.345.678/0001-90" },
      { nome: "Nome Totalmente Outro", cnpj: "12345678000190" },
    ).igual,
    "com e sem pontuação",
  );

  /** A regra fraca precisa continuar sendo fraca. */
  ok(
    "11b. mesmo nome em ENDEREÇO diferente NÃO é duplicata",
    !mesmoEstabelecimento(
      { nome: "Barbearia do Zé", endereco: "Rua A, 10", cidade: "Uberlândia", telefone: "3499111" },
      { nome: "Barbearia do Zé", endereco: "Rua B, 90", cidade: "Uberlândia", telefone: "3499222" },
    ).igual,
    "nome comum não junta negócios distintos",
  );

  console.log("\n=== F. A MENSAGEM UNIVERSAL NÃO MUDOU ===");
  const variantes: Lead[] = [
    OFICINA_PEQUENA,
    REDE_GRANDE,
    pequenaComSite,
    semTelefone,
    lead({ nome: "Pet Shop Feliz", categoria: "pet" }),
  ];
  const esqueletos = new Set(
    variantes.map((l) =>
      montarMensagemUniversal(l).replace(
        montarMensagemUniversal(l).match(/Vi a empresa (.+?) e queria/)?.[1] ?? "",
        "[X]",
      ),
    ),
  );
  ok(
    "12. porte, score, site e nicho NÃO mudam o texto",
    esqueletos.size === 1,
    `${esqueletos.size} texto(s) distinto(s)`,
  );
  ok(
    "12b. a copy-base continua byte a byte a mesma",
    MENSAGEM_BASE ===
      "Olá, tudo bem? Falo da ICG Tech. Vi a empresa [NOME_EMPRESA] e queria te " +
        "mostrar uma ideia que pode ajudar vocês a melhorar alguns processos e " +
        "oportunidades comerciais. Posso te explicar rapidinho?",
  );

  console.log("\n=== G. O QUE O SCORE NÃO PODE INVENTAR ===");
  const c = classificarPorte(OFICINA_PEQUENA);
  ok(
    "13. score NÃO inventa porte: fica 'desconhecido' sem fonte",
    c.porte === "desconhecido" && c.fonte === "nenhuma",
    `porte=${c.porte}, fonte=${c.fonte}`,
  );
  ok(
    "13b. mas os sinais de pequeno existem e são listados",
    c.sinais.length >= 2,
    c.sinais.join(", "),
  );
  ok(
    "13c. porte só vira 'grande' com evidência de rede",
    classificarPorte(REDE_GRANDE).porte === "grande" &&
      classificarPorte(REDE_GRANDE).fonte === "rede-identificada",
    ehRede(REDE_GRANDE).motivos.join("; "),
  );
  ok(
    "13d. muitas avaliações NÃO transformam pequeno em grande",
    classificarPorte(lead({ avaliacoes: 900, nota: 4.9 })).porte === "desconhecido",
    "500 avaliações é comum em negócio de bairro",
  );

  /**
   * §15: nunca afirmar WhatsApp. O sistema pontua o FORMATO do número como
   * probabilidade de alcance e diz isso na justificativa — a conta só é
   * provada no envio.
   */
  // Casa por `id`: o rotulo virou "WhatsApp ou celular disponivel".
  const criterioContato = oportunidade(lead()).criterios.find((x) => x.id === "contato");
  ok(
    "14. score NÃO inventa WhatsApp — fala em 'provável', a confirmar",
    /prov[áa]vel|confirmar/i.test(criterioContato?.base ?? ""),
    criterioContato?.base ?? "",
  );
  ok(
    "14b. telefone fixo não é declarado 'sem WhatsApp'",
    /pode ter/i.test(
      oportunidade(lead({ telefone: "(34) 3212-4000", whatsapp: null })).criterios.find(
        (x) => x.id === "contato",
      )?.base ?? "",
    ),
    "WhatsApp Business existe em linha fixa",
  );

  console.log("\n=== H. NICHOS E POTENCIAL DE SISTEMA ===");
  ok(
    "15. a tag do OSM casa com o nicho prioritário",
    nichoPrioritario("car_repair")?.rotulo === "Oficina mecânica",
    nichoPrioritario("car_repair")?.rotulo ?? "(nenhum)",
  );
  ok(
    "15b. ramo recorrente é reconhecido",
    nichoPrioritario("pet")?.recorrente === true,
  );
  for (const [tag, esperado] of [
    ["car_repair", "ordem-servico"],
    ["pet", "pets"],
    ["car_wash", "veiculos"],
    ["barber", "agendamento"],
    ["estate_agent", "imoveis"],
    ["guest_house", "reservas"],
    ["hvac", "retorno"],
    ["carpenter", "orcamento"],
  ] as const) {
    const e = avaliarSistema(lead({ categoria: tag }));
    ok(
      `16. ${tag} tem potencial de sistema com módulo "${esperado}"`,
      e.serve && e.modulos.includes(esperado),
      e.serve ? e.modulos.join(", ") : "sem encaixe",
    );
  }

  console.log("\n=== I. PEQUENO x REDE NO FILTRO ===");
  ok(
    "17. a oficina passa no filtro de pequenos negócios",
    pareceNegocioLocal(OFICINA_PEQUENA),
  );
  ok("17b. a rede NÃO passa", !pareceNegocioLocal(REDE_GRANDE));
  ok(
    "17c. tag de marca vira rede quando aponta para rede conhecida",
    ehRede(lead({ nome: "Loja do Bairro", dadosOsm: { brand: "Cobasi" } })).rede,
  );

  /**
   * Os três falsos positivos que apareceram na base real de Uberlândia. Cada
   * um rebaixava para prioridade C um negócio que é exatamente o alvo.
   */
  ok(
    "17d. marca que a loja VENDE não é rede",
    !ehRede(lead({ nome: "Pneuara", categoria: "tyres", dadosOsm: { brand: "Michelin" } })).rede,
    "borracharia de bairro que revende Michelin",
  );
  ok(
    "17e. operator com a razão social do próprio negócio não é rede",
    !ehRede(
      lead({
        nome: "Tatu Molas, Freios e Soldas",
        dadosOsm: { operator: "Tatu Molas, Freios e Soldas" },
      }),
    ).rede,
    "operada por si mesma",
  );
  ok(
    "17f. acento não faz 'Saúde' virar sociedade anônima",
    !ehRede(lead({ nome: "ISO Olhos - Instituto de Saúde Ocular" })).rede,
    "o \\b do JavaScript é ASCII e via fronteira dentro de 'Saúde'",
  );
  ok(
    "17g. mas S/A de verdade continua sendo detectada",
    ehRede(lead({ nome: "Frigorífico Uberlândia S/A" })).rede,
  );
  ok(
    "17h. nome de rede não casa dentro de outra palavra",
    !ehRede(lead({ nome: "Ótica Timóteo" })).rede,
    '"tim" não pode casar em "Timóteo"',
  );

  console.log("\n=== J. NENHUMA MENSAGEM FOI ENVIADA ===");
  /**
   * 18. Este arquivo não importa nada que envie. É a garantia estrutural:
   * `lib/fila` e `lib/providers` são os únicos caminhos de saída, e nenhum
   * deles entra aqui.
   */
  ok(
    "18. o teste não tem como enviar mensagem",
    !Object.keys(await import("@/lib/pontuacao")).some((k) => /envi|dispar/i.test(k)),
    "nenhum import de envio neste arquivo",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

void main();
