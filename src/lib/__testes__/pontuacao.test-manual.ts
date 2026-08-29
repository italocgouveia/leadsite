import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { db, leads, type Lead } from "@/lib/db";
import { oportunidade, contactabilidade, pontuar, potencialDoSegmento } from "@/lib/pontuacao";

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "x", nome: "Teste", categoria: "car_repair", cidade: "Uberlândia",
    statusSite: "nao-verificado", score: 0, etapa: "novo",
    whatsapp: null, telefone: null, instagram: null, email: null,
    website: null, horarios: null, endereco: null, avaliacoes: null, nota: null,
    ...p,
  } as Lead;
}

async function main() {
  console.log("\n[os dois eixos sao independentes]");
  const otimoSemContato = lead({ statusSite: "sem-site", endereco: "Rua X", horarios: "8-18", website: "https://x.com" });
  const o1 = oportunidade(otimoSemContato), c1 = contactabilidade(otimoSemContato);
  console.log(`     oficina completa SEM contato: oportunidade ${o1.score} | contato ${c1.score}`);
  ok("oportunidade alta mesmo sem WhatsApp", o1.score >= 66, String(o1.score));
  ok("contato baixo", c1.score < 50, String(c1.score));
  ok("entra na fila de enriquecimento", c1.precisaEnriquecer === true);

  const ruimComContato = lead({ categoria: "supermarket", whatsapp: "https://wa.me/55349", telefone: "(34) 9", instagram: "x", email: "a@b.c", website: "https://x.com", endereco: "R" });
  const o2 = oportunidade(ruimComContato), c2 = contactabilidade(ruimComContato);
  console.log(`     segmento fraco COM tudo: oportunidade ${o2.score} | contato ${c2.score}`);
  ok("contato excelente", c2.score >= 80, String(c2.score));
  ok("nao vira enriquecimento (contato bom)", c2.precisaEnriquecer === false);

  console.log("\n[criterio morto removido]");
  const semAval = lead({ avaliacoes: null, endereco: "R" });
  const comAval = lead({ avaliacoes: 500, endereco: "R" });
  ok("avaliacoes nao mudam mais o score",
     oportunidade(semAval).score === oportunidade(comAval).score,
     `${oportunidade(semAval).score} vs ${oportunidade(comAval).score}`);
  ok("nao avaliado cita avaliacoes Google",
     pontuar(semAval).naoAvaliado.some(s => /avalia/i.test(s)));

  console.log("\n[nao-verificado nao vale ponto]");
  const desconhecido = lead({ statusSite: "nao-verificado", endereco: "R" });
  const confirmado = lead({ statusSite: "sem-site", endereco: "R" });
  ok("sem-site pontua mais que nao-verificado",
     oportunidade(confirmado).score > oportunidade(desconhecido).score,
     `${oportunidade(confirmado).score} vs ${oportunidade(desconhecido).score}`);
  const crit = oportunidade(desconhecido).criterios.find(c => /Lacuna/.test(c.rotulo));
  ok("e explica que nao sabe", !!crit && /n[ãa]o verificado/i.test(crit.base), crit?.base ?? "");

  console.log("\n[telefone nao soma duas vezes]");
  const soTel = lead({ telefone: "(34) 9" });
  const telEZap = lead({ telefone: "(34) 9", whatsapp: "https://wa.me/55349" });
  ok("telefone sozinho = 25", contactabilidade(soTel).score === 25, String(contactabilidade(soTel).score));
  ok("com zap nao soma o telefone (50, nao 75)",
     contactabilidade(telEZap).score === 50, String(contactabilidade(telEZap).score));

  console.log("\n[segmentos]");
  ok("oficina = alto", potencialDoSegmento(lead({categoria:"car_repair"})) === "alto");
  ok("clinica = alto", potencialDoSegmento(lead({categoria:"clinic"})) === "alto");
  ok("restaurante = medio", potencialDoSegmento(lead({categoria:"restaurant"})) === "medio");
  ok("salao = medio", potencialDoSegmento(lead({categoria:"hairdresser"})) === "medio");
  ok("desconhecido = avaliar", potencialDoSegmento(lead({categoria:"zzz_qualquer"})) === "avaliar");
  ok("segmento nao decide sozinho (max 40 de 100)",
     oportunidade(lead({categoria:"car_repair"})).criterios[0].maximo === 40);

  console.log("\n[limites]");
  ok("score nunca passa de 100", oportunidade(lead({
    statusSite:"sem-site", endereco:"R", horarios:"h", website:"w", instagram:"i",
  })).score <= 100);
  ok("contato nunca passa de 100", contactabilidade(lead({
    whatsapp:"w", telefone:"t", instagram:"i", email:"e", website:"s", endereco:"a",
  })).score <= 100);
  ok("lead vazio nao quebra", oportunidade(lead()).score >= 0);

  console.log("\n[distribuicao na base real]");
  const base = await db.select().from(leads);
  const faixas = new Map<string, number>();
  base.forEach(l => { const f = oportunidade(l).faixa; faixas.set(f, (faixas.get(f)??0)+1); });
  const pct = (f: string) => Math.round((faixas.get(f)??0)/base.length*100);
  ["muito-alta","alta","media","baixa"].forEach(f =>
    console.log(`     ${f.padEnd(11)} ${String(faixas.get(f)??0).padStart(3)}  ${pct(f)}%`));
  ok("muito-alta entre 10 e 20%", pct("muito-alta") >= 10 && pct("muito-alta") <= 20, `${pct("muito-alta")}%`);
  ok("alta entre 18 e 32%", pct("alta") >= 18 && pct("alta") <= 32, `${pct("alta")}%`);
  ok("nenhuma faixa vazia", ["muito-alta","alta","media","baixa"].every(f => (faixas.get(f)??0) > 0));

  const enr = base.filter(l => contactabilidade(l).precisaEnriquecer).length;
  console.log(`     para enriquecer: ${enr}`);
  ok("existe fila de enriquecimento", enr > 0, String(enr));

  console.log("\n[compatibilidade]");
  const p = pontuar(base[0]);
  ok("pontuar ainda devolve total", typeof p.total === "number");
  ok("pontuar ainda devolve classificacao", !!p.classificacao);
  ok("pontuar expoe os dois scores novos", !!p.oportunidade && !!p.contato);

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
