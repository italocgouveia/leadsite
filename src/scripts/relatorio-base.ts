import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, leads } from "@/lib/db";
import { oportunidade, prioridadeComercial } from "@/lib/pontuacao";
import { classificarPorte, pareceNegocioLocal } from "@/lib/porte";
import { avaliarSistema } from "@/lib/sistemas";
import { SEM_SITE } from "@/lib/places/audit";
import { categoriaSingular } from "@/lib/categoria-nome";
import { validarTelefone, telefoneDoLead } from "@/lib/telefone";

/** O perfil da base reconstruída, em números. Só leitura. */

const linha = (r: string, v: unknown) =>
  console.log(`  ${r.padEnd(40)} ${String(v).padStart(6)}`);

async function main() {
  const base = await db.select().from(leads);
  const uber = base.filter((l) => l.cidade === "Uberlândia");

  console.log(`\n${"=".repeat(62)}\nA BASE RECONSTRUÍDA\n${"=".repeat(62)}`);
  linha("total de leads", base.length);
  linha("em Uberlândia", uber.length);
  linha("preservados de antes (outras cidades)", base.length - uber.length);

  console.log("\n--- PORTE (só declara o que tem prova) ---");
  const portes = new Map<string, number>();
  for (const l of base) {
    const p = classificarPorte(l).porte;
    portes.set(p, (portes.get(p) ?? 0) + 1);
  }
  for (const [k, v] of [...portes.entries()].sort((a, b) => b[1] - a[1])) linha(k, v);
  linha("parecem negócio local (indícios)", base.filter(pareceNegocioLocal).length);

  console.log("\n--- CONTATO ---");
  const tel = base.map((l) => validarTelefone(telefoneDoLead(l)));
  linha("com celular", tel.filter((t) => t?.tipo === "celular").length);
  linha("com telefone fixo", tel.filter((t) => t?.tipo === "fixo").length);
  linha("sem telefone", tel.filter((t) => !t).length);
  linha("com Instagram", base.filter((l) => l.instagram).length);

  console.log("\n--- SITE ---");
  linha("sem site CONFIRMADO", base.filter((l) => SEM_SITE.includes(l.statusSite)).length);
  linha("tem site próprio", base.filter((l) => l.statusSite === "tem-site").length);
  linha("não verificado (o mapa não informa)", base.filter((l) => l.statusSite === "nao-verificado").length);

  console.log("\n--- POTENCIAL DE SISTEMA ---");
  linha("com encaixe de sistema", base.filter((l) => avaliarSistema(l).serve).length);

  console.log("\n--- PRIORIDADE ---");
  for (const n of ["A", "B", "C"] as const) {
    linha(`prioridade ${n}`, base.filter((l) => prioridadeComercial(l).nivel === n).length);
  }

  console.log("\n--- TOP 10 NICHOS (por leads em Uberlândia) ---");
  const nichos = new Map<string, number>();
  for (const l of uber) {
    const s = categoriaSingular(l.categoria);
    nichos.set(s, (nichos.get(s) ?? 0) + 1);
  }
  for (const [k, v] of [...nichos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    linha(k, v);
  }

  console.log("\n--- TOP 10 OPORTUNIDADES ---");
  const ranking = base
    .map((l) => ({ l, o: oportunidade(l), p: prioridadeComercial(l) }))
    .sort((a, b) => b.o.score - a.o.score)
    .slice(0, 10);
  for (const { l, o, p } of ranking) {
    const enc = avaliarSistema(l);
    console.log(
      `  ${p.emoji} ${String(o.score).padStart(3)} ${l.nome.slice(0, 34).padEnd(34)} ` +
        `${categoriaSingular(l.categoria).slice(0, 16).padEnd(16)} ${enc.serve ? enc.sistema.slice(0, 40) : "—"}`,
    );
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
