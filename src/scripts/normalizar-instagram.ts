import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { eq, isNotNull } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { instagramDoLead } from "@/lib/canais";

/**
 * Preenche `instagram_username` e a procedência a partir do que a coleta já
 * gravou em `instagram`.
 *
 * A coluna `instagram` recebeu de tudo: perfil, link de post, URL de outro
 * site. Este script passa cada valor por `instagramDoLead` — o mesmo validador
 * que a fila manual usa — e guarda o @ só quando é perfil de verdade.
 *
 * NÃO apaga a coluna original: `instagram` continua com o valor bruto, e o que
 * for recusado fica lá para conferência à mão. O script só ACRESCENTA.
 *
 *   npx tsx src/scripts/normalizar-instagram.ts             (simulação)
 *   npx tsx src/scripts/normalizar-instagram.ts --executar
 */

const EXECUTAR = process.argv.includes("--executar");

async function main() {
  const base = await db.select().from(leads).where(isNotNull(leads.instagram));

  const validos = base
    .map((l) => ({ l, perfil: instagramDoLead(l) }))
    .filter((x) => x.perfil !== null);
  const recusados = base.filter((l) => !instagramDoLead(l));

  console.log(`\n${base.length} leads com algo na coluna instagram`);
  console.log(`  perfis válidos   ${validos.length}`);
  console.log(`  recusados        ${recusados.length}`);

  if (recusados.length) {
    console.log("\n  recusados (ficam na coluna original, para conferir à mão):");
    for (const l of recusados.slice(0, 15)) {
      console.log(`    ${l.nome.slice(0, 30).padEnd(30)} ${l.instagram}`);
    }
  }

  if (!EXECUTAR) {
    console.log("\nSimulação. Nada foi alterado. Rode com --executar.\n");
    process.exit(0);
  }

  let gravados = 0;
  for (const { l, perfil } of validos) {
    if (l.instagramUsername === perfil!.username) continue;
    await db
      .update(leads)
      .set({
        instagramUsername: perfil!.username,
        instagramOrigem: l.instagramOrigem ?? "coleta",
        /**
         * 80: o @ veio do cadastro do estabelecimento no mapa e foi validado
         * como perfil. Não é 100 porque ninguém abriu o perfil para confirmar
         * que ele é da empresa e está ativo.
         */
        instagramConfianca: l.instagramConfianca ?? 80,
        atualizadoEm: new Date(),
      })
      .where(eq(leads.id, l.id));
    gravados++;
  }

  console.log(`\n${gravados} leads com @ normalizado.\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
