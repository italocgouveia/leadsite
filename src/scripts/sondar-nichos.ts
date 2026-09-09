import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { localizarArea, consultarOverpass } from "@/lib/osm/search";

/**
 * QUAIS NICHOS "QUENTES" REALMENTE EXISTEM NA PRAÇA — e com contato.
 *
 * A pergunta que decide se um nicho merece entrar na lista da tela não é
 * "esse ramo compra chatbot?". É:
 *
 *     quantas empresas desse ramo o mapa conhece aqui, e quantas publicam
 *     algum jeito de falar com elas?
 *
 * Um nicho que compra muito e que a fonte não enxerga só serve para oferecer
 * uma busca que volta vazia. Isso é pior que não oferecer: a pessoa conclui
 * que o sistema não funciona, quando o que falta é o dado existir.
 *
 * Somente leitura. Não grava lead, não coleta, não envia.
 *
 *   npm run sondar:nichos
 */

const CIDADE = "Uberlândia, Minas Gerais, Brasil";

/**
 * Os candidatos. Cada um é um ramo que compra sistema, site ou automação de
 * atendimento — negócio que agenda, orça, responde a mesma pergunta o dia
 * inteiro ou controla uma operação repetitiva.
 */
const CANDIDATOS: { nome: string; tags: string[] }[] = [
  // ── serviço B2B: alto ticket, muita pergunta repetida ──
  { nome: "transportadora / logística", tags: ["office=logistics", "office=transport", "industrial=logistics"] },
  { nome: "despachante", tags: ["office=notary", "shop=car_registration"] },
  { nome: "contabilidade", tags: ["office=accountant", "office=tax_advisor"] },
  { nome: "advocacia", tags: ["office=lawyer"] },
  { nome: "seguros", tags: ["office=insurance"] },
  { nome: "imobiliária", tags: ["office=estate_agent"] },
  { nome: "arquitetura / engenharia", tags: ["office=architect", "office=engineer"] },
  { nome: "agência de marketing", tags: ["office=advertising_agency", "office=graphic_design"] },
  { nome: "consultoria / RH", tags: ["office=consulting", "office=employment_agency"] },
  { nome: "coworking", tags: ["office=coworking", "amenity=coworking_space"] },

  // ── saúde: agenda, retorno, confirmação ──
  { nome: "clínica médica", tags: ["amenity=clinic", "amenity=doctors", "healthcare=clinic"] },
  { nome: "odontologia", tags: ["amenity=dentist", "healthcare=dentist"] },
  { nome: "laboratório", tags: ["healthcare=laboratory"] },
  { nome: "fisioterapia", tags: ["healthcare=physiotherapist"] },
  { nome: "psicologia", tags: ["healthcare=psychotherapist"] },
  { nome: "veterinária", tags: ["amenity=veterinary"] },
  { nome: "ótica", tags: ["shop=optician"] },

  // ── educação: matrícula, turma, mensalidade ──
  { nome: "autoescola", tags: ["amenity=driving_school"] },
  { nome: "escola de idiomas", tags: ["amenity=language_school"] },
  { nome: "curso profissionalizante", tags: ["amenity=prep_school", "amenity=training"] },
  { nome: "escola de música", tags: ["amenity=music_school"] },

  // ── automotivo: ordem de serviço e orçamento ──
  { nome: "oficina mecânica", tags: ["shop=car_repair"] },
  { nome: "concessionária / revenda", tags: ["shop=car"] },
  { nome: "autopeças", tags: ["shop=car_parts"] },
  { nome: "lava-jato", tags: ["shop=car_wash", "amenity=car_wash"] },
  { nome: "borracharia", tags: ["shop=tyres"] },
  { nome: "locadora de veículos", tags: ["amenity=car_rental"] },

  // ── alimentação: pedido, cardápio, delivery ──
  { nome: "restaurante", tags: ["amenity=restaurant"] },
  { nome: "lanchonete", tags: ["amenity=fast_food"] },
  { nome: "padaria", tags: ["shop=bakery"] },
  { nome: "cafeteria", tags: ["amenity=cafe"] },
  { nome: "bar", tags: ["amenity=bar", "amenity=pub"] },

  // ── beleza e bem-estar: agenda pura ──
  { nome: "salão / barbearia", tags: ["shop=hairdresser", "shop=beauty"] },
  { nome: "academia", tags: ["leisure=fitness_centre"] },
  { nome: "pet shop", tags: ["shop=pet", "shop=pet_grooming"] },

  // ── hospedagem e turismo ──
  { nome: "hotel / pousada", tags: ["tourism=hotel", "tourism=guest_house"] },
  { nome: "agência de viagens", tags: ["shop=travel_agency"] },

  // ── comércio com estoque e catálogo ──
  { nome: "material de construção", tags: ["shop=doityourself", "shop=hardware", "shop=trade"] },
  { nome: "móveis", tags: ["shop=furniture"] },
  { nome: "loja de roupas", tags: ["shop=clothes"] },
  { nome: "assistência técnica", tags: ["shop=computer", "shop=mobile_phone", "craft=electronics_repair"] },
  { nome: "gráfica", tags: ["shop=copyshop", "craft=printer"] },
  { nome: "distribuidora / atacado", tags: ["shop=wholesale", "shop=beverages"] },

  // ── ofícios: orçamento e visita ──
  { nome: "marcenaria", tags: ["craft=carpenter", "craft=cabinet_maker"] },
  { nome: "serralheria", tags: ["craft=metal_construction", "craft=blacksmith"] },
  { nome: "vidraçaria", tags: ["craft=glaziery"] },
  { nome: "elétrica / hidráulica", tags: ["craft=electrician", "craft=plumber"] },
  { nome: "ar-condicionado", tags: ["craft=hvac"] },
  { nome: "dedetização", tags: ["craft=pest_control"] },
  { nome: "lavanderia", tags: ["shop=laundry", "shop=dry_cleaning"] },
  { nome: "chaveiro", tags: ["craft=locksmith"] },
];

const pct = (a: number, b: number) => (b === 0 ? "  —  " : `${((a / b) * 100).toFixed(0)}%`.padStart(5));

async function main() {
  const area = await localizarArea(CIDADE);
  if (area.tipo !== "area") throw new Error("Uberlândia não resolveu para uma área");

  /** Uma consulta só, com todas as tags candidatas. */
  const todas = [...new Set(CANDIDATOS.flatMap((c) => c.tags))];
  const ql = `[out:json][timeout:180];
area(${area.areaId})->.busca;
(
${todas.map((t) => `  nwr["${t.split("=")[0]}"="${t.split("=")[1]}"](area.busca);`).join("\n")}
);
out tags;`;

  console.log(`\nConsultando ${todas.length} tags em ${CIDADE}…`);
  const r = await consultarOverpass(ql);
  const elementos = r.elements ?? [];

  /** Conta por tag: total nomeado e quantos publicam algum canal. */
  const porTag = new Map<string, { total: number; comCanal: number }>();
  for (const e of elementos) {
    const t = (e.tags ?? {}) as Record<string, string>;
    if (!t.name) continue;
    const temCanal = Boolean(
      t.phone || t["contact:phone"] || t["contact:mobile"] || t["contact:instagram"] || t.instagram,
    );
    for (const tag of todas) {
      const [k, v] = tag.split("=");
      if (t[k] !== v) continue;
      const a = porTag.get(tag) ?? { total: 0, comCanal: 0 };
      a.total++;
      if (temCanal) a.comCanal++;
      porTag.set(tag, a);
    }
  }

  const linhas = CANDIDATOS.map((c) => {
    let total = 0;
    let comCanal = 0;
    for (const t of c.tags) {
      const a = porTag.get(t);
      if (a) {
        total += a.total;
        comCanal += a.comCanal;
      }
    }
    return { nome: c.nome, total, comCanal };
  }).sort((a, b) => b.comCanal - a.comCanal || b.total - a.total);

  console.log(`\n${"─".repeat(72)}`);
  console.log("NICHO".padEnd(34) + "MAPEADOS".padStart(10) + "COM CANAL".padStart(12) + "TAXA".padStart(8));
  console.log("─".repeat(72));
  for (const l of linhas) {
    const marca = l.comCanal >= 5 ? "🔥" : l.total >= 10 ? "🟡" : l.total > 0 ? "⚪" : "❌";
    console.log(
      `${marca} ${l.nome.padEnd(31)}${String(l.total).padStart(9)}${String(l.comCanal).padStart(12)}${pct(l.comCanal, l.total).padStart(8)}`,
    );
  }

  const vale = linhas.filter((l) => l.comCanal >= 3);
  const vazios = linhas.filter((l) => l.total === 0);
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  nichos com pelo menos 3 contatáveis: ${vale.length}`);
  console.log(`  nichos que o mapa NÃO conhece aqui:  ${vazios.length}`);
  if (vazios.length) console.log(`  → ${vazios.map((v) => v.nome).join(" · ")}`);
  console.log("\n  leads gravados por esta sonda: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
