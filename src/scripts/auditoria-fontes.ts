import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, leads, type Lead } from "@/lib/db";
import { canalDoLead, instagramDoLead, temCelularPlausivel } from "@/lib/canais";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";
import { classificarPorte, pareceNegocioLocal } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { alcanceDoLead, PRACA } from "@/lib/territorio";
import { avaliarOportunidadeComercial } from "@/lib/oportunidade-comercial";

/**
 * DE ONDE VIERAM OS LEADS, E QUANTO CADA FONTE ENTREGA DE CONTATO.
 *
 * A pergunta desta auditoria não é "quantos leads temos" — é
 *
 *     CONTATOS ÚTEIS GERADOS / LEADS ENCONTRADOS
 *
 * porque uma fonte que devolve mil nomes sem telefone é pior que uma que
 * devolve cinquenta com telefone: a primeira ocupa o painel, o tempo de quem
 * olha e o disco, e não produz uma conversa.
 *
 * Somente leitura. Não grava, não coleta, não envia, não liga worker.
 *
 *   npm run auditoria:fontes
 */

const pct = (a: number, b: number) => (b === 0 ? "  0,0%" : `${((a / b) * 100).toFixed(1).padStart(5)}%`);
const titulo = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

/**
 * A FONTE de cada lead, deduzida do `placeId`.
 *
 * O coletor grava `osm:<id>` quando o elemento veio do mapa aberto e o id
 * nativo do Google quando veio do Places (`ChIJ...`). Não existe coluna
 * `fonte` em `leads`: a procedência sempre esteve embutida na chave natural,
 * e é isso que esta auditoria lê.
 */
function fonteDoLead(lead: Lead): string {
  const id = lead.placeId ?? "";
  if (id.startsWith("osm:")) return "OpenStreetMap";
  if (/^ChIJ|^GhIJ|^EiQ/.test(id)) return "Google Places";
  if (!id) return "sem placeId";
  return "outra/manual";
}

type Bloco = {
  total: number;
  comTelefoneQualquer: number;
  comTelefoneValido: number;
  comCelular: number;
  dddDaPraca: number;
  comInstagramBruto: number;
  comInstagramUtil: number;
  ambos: number;
  semCanal: number;
  emUberlandia: number;
  pequenoLocal: number;
  comSistema: number;
  oportunidade: number;
};

const vazio = (): Bloco => ({
  total: 0,
  comTelefoneQualquer: 0,
  comTelefoneValido: 0,
  comCelular: 0,
  dddDaPraca: 0,
  comInstagramBruto: 0,
  comInstagramUtil: 0,
  ambos: 0,
  semCanal: 0,
  emUberlandia: 0,
  pequenoLocal: 0,
  comSistema: 0,
  oportunidade: 0,
});

function medir(bloco: Bloco, lead: Lead) {
  bloco.total++;
  if (lead.telefone) bloco.comTelefoneQualquer++;

  const tel = validarTelefone(telefoneDoLead(lead));
  if (tel) {
    bloco.comTelefoneValido++;
    /** DDD da praça — só conta quando o número é válido, senão é chute. */
    if (Number(tel.e164.slice(2, 4)) === PRACA.ddd) bloco.dddDaPraca++;
  }
  /** Celular plausível E DDD compatível com a UF. Não afirma WhatsApp. */
  if (temCelularPlausivel(lead)) bloco.comCelular++;

  if (lead.instagram) bloco.comInstagramBruto++;
  if (instagramDoLead(lead)) bloco.comInstagramUtil++;

  const canal = canalDoLead(lead);
  if (canal === "ambos") bloco.ambos++;
  if (canal === "sem-canal") bloco.semCanal++;

  if (alcanceDoLead(lead) === "local") bloco.emUberlandia++;
  if (pareceNegocioLocal(lead) && !classificarPorte(lead).rede) bloco.pequenoLocal++;
  if (avaliarSistema(lead).serve) bloco.comSistema++;
  if (avaliarOportunidadeComercial(lead).elegivel) bloco.oportunidade++;
}

function imprimir(nome: string, b: Bloco) {
  const l = (r: string, v: number, base = b.total) =>
    console.log(`  ${r.padEnd(34)} ${String(v).padStart(5)}   ${pct(v, base)}`);

  console.log(`\n### ${nome} — ${b.total} leads`);
  l("telefone gravado", b.comTelefoneQualquer);
  l("…que passa na validação", b.comTelefoneValido);
  l("…celular plausível (não é fixo)", b.comCelular);
  l(`…DDD ${PRACA.ddd} (a praça)`, b.dddDaPraca);
  l("Instagram gravado", b.comInstagramBruto);
  l("…que é perfil utilizável", b.comInstagramUtil);
  console.log("  " + "·".repeat(50));
  l("🔥 os dois canais", b.ambos);
  l("❌ sem canal nenhum", b.semCanal);
  console.log("  " + "·".repeat(50));
  l("em Uberlândia (endereço)", b.emUberlandia);
  l("parece pequeno/local", b.pequenoLocal);
  l("tem sistema vendável", b.comSistema);
  console.log("  " + "·".repeat(50));
  l("✅ OPORTUNIDADE REAL", b.oportunidade);

  /** A métrica que a missão pede: contato útil por lead encontrado. */
  const uteis = b.total - b.semCanal;
  console.log(`\n  TAXA DE CONTATO ÚTIL: ${uteis}/${b.total} = ${pct(uteis, b.total)}`);
}

async function main() {
  const base = await db.select().from(leads);

  titulo("1. QUAL FONTE TROUXE OS LEADS ATUAIS");
  const porFonte = new Map<string, Lead[]>();
  for (const l of base) {
    const f = fonteDoLead(l);
    const atual = porFonte.get(f);
    if (atual) atual.push(l);
    else porFonte.set(f, [l]);
  }
  for (const [f, ls] of [...porFonte.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${f.padEnd(20)} ${String(ls.length).padStart(5)}   ${pct(ls.length, base.length)}`);
  }

  titulo("2 e 3. QUANTO CADA FONTE PRODUZ DE CONTATO");
  for (const [f, ls] of [...porFonte.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const b = vazio();
    for (const l of ls) medir(b, l);
    imprimir(f, b);
  }

  titulo("4. O ENRIQUECIMENTO — QUEM ACHOU TELEFONE DEPOIS DA COLETA");
  const enriquecidos = base.filter((l) => l.telefoneOrigem);
  if (!enriquecidos.length) {
    console.log("  nenhum telefone gravado por enriquecimento até agora");
  }
  const porOrigem = new Map<string, { q: number; confianca: number[] }>();
  for (const l of enriquecidos) {
    const o = l.telefoneOrigem ?? "?";
    const a = porOrigem.get(o) ?? { q: 0, confianca: [] };
    a.q++;
    if (l.telefoneConfianca != null) a.confianca.push(l.telefoneConfianca);
    porOrigem.set(o, a);
  }
  for (const [o, v] of porOrigem) {
    const media = v.confianca.length
      ? Math.round(v.confianca.reduce((s, x) => s + x, 0) / v.confianca.length)
      : null;
    console.log(`  ${o.padEnd(20)} ${String(v.q).padStart(5)}   confiança média ${media ?? "—"}`);
  }

  titulo("5. O FUNIL DA MISSÃO, MEDIDO NA BASE INTEIRA");
  const b = vazio();
  for (const l of base) medir(b, l);
  const canais = base.map(canalDoLead);
  console.log(`  empresas na base                   ${String(b.total).padStart(5)}`);
  console.log(`  ↓ em Uberlândia                    ${String(b.emUberlandia).padStart(5)}   ${pct(b.emUberlandia, b.total)}`);
  console.log(`  ↓ pequenas/locais                  ${String(b.pequenoLocal).padStart(5)}   ${pct(b.pequenoLocal, b.total)}`);
  console.log(`  ↓ com sistema vendável             ${String(b.comSistema).padStart(5)}   ${pct(b.comSistema, b.total)}`);
  console.log(`  ↓ COM CANAL                        ${String(b.total - b.semCanal).padStart(5)}   ${pct(b.total - b.semCanal, b.total)}`);
  console.log(`     📱 WhatsApp                     ${String(canais.filter((c) => c === "whatsapp" || c === "ambos").length).padStart(5)}`);
  console.log(`     📸 Instagram                    ${String(canais.filter((c) => c === "instagram" || c === "ambos").length).padStart(5)}`);
  console.log(`     🔥 ambos                        ${String(b.ambos).padStart(5)}`);
  console.log(`  ↓ ✅ OPORTUNIDADE REAL             ${String(b.oportunidade).padStart(5)}   ${pct(b.oportunidade, b.total)}`);

  titulo("6. DEPENDÊNCIA DE SERVIÇO PAGO");
  const chave = process.env.GOOGLE_PLACES_API_KEY ?? "";
  console.log(`  GOOGLE_PLACES_API_KEY configurada: ${chave.trim() ? "SIM" : "NÃO"}`);
  console.log("  (o valor não é impresso — só a presença)");

  console.log("\n  leads alterados por esta auditoria: 0");
  console.log("  mensagens enviadas: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
