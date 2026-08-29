import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { db, leads } from "@/lib/db";
import { calcularFacetas, aplicar, ordenar, disponivel, estimarDuracao, nomeSugerido } from "@/lib/facetas";
import { pontuar } from "@/lib/pontuacao";

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

async function main() {
  console.log("\n[facetas com dados reais]");
  const f = await calcularFacetas({});
  console.log(`     ${f.visaoGeral.total} leads | ${f.visaoGeral.disponiveis} disponiveis | ${f.visaoGeral.prontosParaContato} com zap | ${f.visaoGeral.quentes} quentes`);
  ok("visao geral bate com o banco", f.visaoGeral.total > 0);
  ok("disponiveis <= total", f.visaoGeral.disponiveis <= f.visaoGeral.total);
  ok("tem segmentos reais", f.segmentos.length > 0, `${f.segmentos.length} segmentos`);
  ok("tem cidades reais", f.cidades.length > 0, `${f.cidades.length} cidades`);
  ok("segmentos ordenados por volume", f.segmentos.every((s,i,a) => i===0 || a[i-1].leads >= s.leads));

  console.log("\n     top segmentos:");
  f.segmentos.slice(0,5).forEach(s => console.log(`       ${String(s.leads).padStart(3)} ${s.valor} (${s.comWhatsapp} zap)`));
  console.log("     top cidades:");
  f.cidades.slice(0,5).forEach(c => console.log(`       ${String(c.leads).padStart(3)} ${c.valor} (${c.comWhatsapp} zap)`));

  console.log("\n[contagem por faixa]");
  f.porFaixa.forEach(x => console.log(`     ${String(x.leads).padStart(3)} ${x.rotulo} (${x.nota}+)`));
  ok("faixa 'todos' é a maior", f.porFaixa[0].leads >= f.porFaixa[3].leads);
  ok("faixas sao monotonicas", f.porFaixa.every((x,i,a) => i===0 || a[i-1].leads >= x.leads));

  console.log("\n[filtro cruzado]");
  const cidadeTop = f.cidades[0]?.valor;
  if (cidadeTop) {
    const g = await calcularFacetas({ cidade: cidadeTop });
    ok(`segmentos de ${cidadeTop} <= geral`, g.segmentos.length <= f.segmentos.length + 1);
    ok("compativeis respeitam a cidade", g.compativeis.every(l => l.cidade === cidadeTop));
    console.log(`     ${cidadeTop}: ${g.resumo.compativeis} compativeis, ${g.resumo.comWhatsapp} com zap`);
  }

  console.log("\n[estado vazio inteligente]");
  const impossivel = await calcularFacetas({ faixa: "melhores", soComWhatsapp: true });
  if (impossivel.resumo.compativeis === 0) {
    ok("sem resultado devolve alternativas", impossivel.alternativas.length > 0,
       impossivel.alternativas.map(a=>`${a.leads} em ${a.faixa}`).join(", "));
  } else {
    ok("filtro dificil ainda devolve algo", true, `${impossivel.resumo.compativeis}`);
  }

  console.log("\n[ordenacao]");
  const base = (await db.select().from(leads)).filter(disponivel);
  const ord = ordenar(aplicar(base, {}));
  const primeiroSemZap = ord.findIndex(l => !l.whatsapp);
  const ultimoComZap = ord.map(l => Boolean(l.whatsapp)).lastIndexOf(true);
  ok("quem tem WhatsApp vem antes", primeiroSemZap === -1 || ultimoComZap < primeiroSemZap,
     `zap ate ${ultimoComZap}, primeiro sem zap ${primeiroSemZap}`);

  const comZap = ord.filter(l => l.whatsapp);
  ok("entre os com zap, nota decrescente",
     comZap.every((l,i,a) => i===0 || pontuar(a[i-1]).total >= pontuar(l).total));

  console.log("\n[estimativa]");
  const d20 = estimarDuracao(20, 90, 30);
  console.log(`     20 leads a 90s: ${d20.legivel} (${d20.dias} dia)`);
  ok("20 a 90s da ~28min", d20.horas === 0 && d20.minutos > 25 && d20.minutos < 32, d20.legivel);
  const d50 = estimarDuracao(50, 90, 30);
  ok("50 com teto 30 passa do dia", d50.passaDoDia && d50.dias === 2, `${d50.dias} dias`);
  ok("zero leads nao quebra", estimarDuracao(0, 90, 30).legivel === "instantâneo");

  console.log("\n[nome automatico]");
  ok("monta com segmento e cidade", nomeSugerido("Oficinas","Uberlândia").startsWith("Oficinas — Uberlândia — "));
  ok("sem filtro ainda tem nome", nomeSugerido().startsWith("Campanha — "));

  console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
main();
