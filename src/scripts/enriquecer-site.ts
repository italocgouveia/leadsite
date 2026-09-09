import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db, leads } from "@/lib/db";
import { enriquecerPeloSite } from "@/lib/enriquecimento-site";
import { temSiteProprio, canalDoLead } from "@/lib/canais";
import { avaliarSistema } from "@/lib/sistemas";
import { alcanceDoLead } from "@/lib/territorio";

/**
 * Enriquecimento por site — DRY RUN por padrão.
 *
 * Sem `--gravar`, ele apenas relata o que faria. É a mesma doutrina do resto
 * do projeto: nada entra na base sem alguém ver antes o que vai entrar.
 *
 *   npm run enriquecer:site           (simula)
 *   npm run enriquecer:site -- --gravar --limite=20
 */

const GRAVAR = process.argv.includes("--gravar");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limite="))?.split("=")[1] ?? 25);
const PAUSA_MS = 1500;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const base = await db.select().from(leads);

  /**
   * A prioridade do §25: alto potencial, pequeno/local, na praça, com sistema
   * vendável. Não gastar requisição com quem não vale a visita.
   */
  const alvos = base
    .filter((l) => temSiteProprio(l))
    .filter((l) => avaliarSistema(l).serve)
    .sort((a, b) => {
      const pa = canalDoLead(a) === "site" ? 0 : 1;
      const pb = canalDoLead(b) === "site" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const la = alcanceDoLead(a) === "local" ? 0 : 1;
      const lb = alcanceDoLead(b) === "local" ? 0 : 1;
      return la - lb;
    })
    .slice(0, LIMITE);

  console.log(`\n${GRAVAR ? "🔴 GRAVANDO" : "🔵 SIMULAÇÃO (nada será gravado)"}`);
  console.log(`${alvos.length} leads com site próprio e sistema aplicável\n`);

  let ok = 0;
  let falhou = 0;
  const aceitos = { telefone: 0, whatsapp: 0, instagram: 0, email: 0 };
  const recusados: string[] = [];

  for (const lead of alvos) {
    const r = await enriquecerPeloSite(lead, !GRAVAR);
    if (!r.analisou) {
      falhou++;
      console.log(`✗ ${r.nome} — ${r.motivoFalha}`);
      await dormir(PAUSA_MS);
      continue;
    }
    ok++;
    const bons = r.achados.filter((a) => a.aceito);
    const maus = r.achados.filter((a) => !a.aceito);

    console.log(`✓ ${r.nome}`);
    for (const a of bons) {
      aceitos[a.campo]++;
      console.log(`   + ${a.campo}: ${a.valor}  (${a.motivo})`);
    }
    for (const a of maus) {
      recusados.push(`${a.campo}: ${a.motivo}`);
      console.log(`   ⊘ ${a.campo}: ${a.valor}  — ${a.motivo}`);
    }
    if (!r.achados.length) console.log("   (nada novo encontrado)");

    if (GRAVAR && Object.keys(r.gravaria).length) {
      /**
       * A gravação é feita AQUI e só aqui, campo a campo, e nunca substitui
       * valor existente — a biblioteca já recusou esses casos, e esta é a
       * segunda trava.
       */
      const { eq } = await import("drizzle-orm");
      const { linkWhatsapp } = await import("@/lib/telefone");
      const patch: Record<string, unknown> = { atualizadoEm: new Date() };
      if (r.gravaria.whatsapp && !lead.telefone) {
        patch.telefone = r.gravaria.whatsapp;
        patch.whatsapp = linkWhatsapp(r.gravaria.whatsapp);
        patch.telefoneOrigem = "site-proprio";
        patch.telefoneConfianca = 70;
        patch.telefoneEncontradoEm = new Date();
      } else if (r.gravaria.telefone && !lead.telefone) {
        patch.telefone = r.gravaria.telefone;
        patch.whatsapp = linkWhatsapp(r.gravaria.telefone);
        patch.telefoneOrigem = "site-proprio";
        patch.telefoneConfianca = 65;
        patch.telefoneEncontradoEm = new Date();
      }
      if (r.gravaria.instagram && !lead.instagram) {
        patch.instagram = r.gravaria.instagram;
        patch.instagramOrigem = "site-proprio";
        patch.instagramConfianca = 75;
      }
      if (r.gravaria.email && !lead.email) patch.email = r.gravaria.email;

      if (Object.keys(patch).length > 1) {
        await db.update(leads).set(patch).where(eq(leads.id, lead.id));
        console.log(`   💾 gravado`);
      }
    }
    await dormir(PAUSA_MS);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`analisados: ${ok} · falharam: ${falhou}`);
  console.log(`aceitos — whatsapp ${aceitos.whatsapp} · telefone ${aceitos.telefone} · instagram ${aceitos.instagram} · email ${aceitos.email}`);
  console.log(`recusados: ${recusados.length}`);
  const porMotivo = new Map<string, number>();
  for (const m of recusados) {
    const chave = m.split("—")[0].split("(")[0].trim();
    porMotivo.set(chave, (porMotivo.get(chave) ?? 0) + 1);
  }
  for (const [m, q] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`   ${q}× ${m}`);
  }
  console.log(`\nleads alterados: ${GRAVAR ? "ver acima" : "0 (simulação)"}`);
  console.log("mensagens enviadas: 0\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
