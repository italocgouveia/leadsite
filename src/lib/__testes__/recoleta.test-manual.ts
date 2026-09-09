import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { eq } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { buscarEGravar } from "@/lib/coletar";
import type { BuscaOsmResultado, LugarOsm } from "@/lib/osm/search";

/**
 * REBUSCAR O MESMO NICHO NÃO PODE APAGAR CONTATO.
 *
 * O upsert de `coletar.ts` gravava `telefone: excluded.telefone`, e o mapa
 * aberto quase nunca publica telefone: de 4.280 estabelecimentos de Uberlândia,
 * 171 têm número. Então rodar a mesma varredura de novo — coisa que se faz
 * toda vez que um nicho ganha uma tag nova — zerava o número dos leads que já
 * tinham um. Inclusive os 2 que o enriquecimento encontrou, que custaram
 * varredura de site, validação de DDD e checagem de dono para entrar ali.
 *
 * Este teste faz a coleta duas vezes com um buscador falso: a primeira traz
 * contato completo, a segunda traz o mesmo lugar mudo. O cadastro tem de sair
 * intacto.
 *
 * Cria UM lead de teste com `placeId` próprio e o apaga no fim. Não toca em
 * lead real, não envia mensagem, não mexe em configuração.
 *
 *   npm run test:recoleta
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

/** Um osmId que não existe no mapa real — o lead é só deste teste. */
const OSM_ID = "node/999000111222";
const PLACE_ID = `osm:${OSM_ID}`;

function lugar(o: Partial<LugarOsm> = {}): LugarOsm {
  return {
    osmId: OSM_ID,
    nome: "Oficina de Teste — recoleta",
    categoria: "car_repair",
    endereco: "Rua Inexistente, 1",
    cidade: "Uberlândia",
    estado: "MG",
    extras: {},
    ...o,
  };
}

/** Substitui a consulta ao Overpass. Nenhuma chamada de rede sai daqui. */
const buscadorFalso =
  (l: LugarOsm) =>
  async (): Promise<BuscaOsmResultado> => ({
    lugares: [l],
    buscaPorNome: false,
    totalEncontrado: 1,
    totalContatavel: l.telefone ? 1 : 0,
  });

const params = { nicho: "oficina mecânica", cidade: "Uberlândia", estado: "MG" };

async function limpar() {
  await db.delete(leads).where(eq(leads.placeId, PLACE_ID));
}

async function main() {
  await limpar();

  try {
    // ---------- 1ª coleta: o mapa publica tudo ----------
    await buscarEGravar(
      params,
      buscadorFalso(
        lugar({
          telefone: "(34) 99134-5424",
          website: "https://oficinadeteste.com.br",
          instagram: "https://instagram.com/oficinadeteste",
          email: "contato@oficinadeteste.com.br",
        }),
      ),
    );

    const [primeiro] = await db.select().from(leads).where(eq(leads.placeId, PLACE_ID));
    ok("1. a primeira coleta grava o lead com contato", Boolean(primeiro?.telefone), primeiro?.telefone ?? "sem telefone");
    ok("1b. e monta o link de WhatsApp", Boolean(primeiro?.whatsapp));

    // ---------- 2ª coleta: o MESMO lugar, agora sem contato nenhum ----------
    await buscarEGravar(params, buscadorFalso(lugar()));

    const [depois] = await db.select().from(leads).where(eq(leads.placeId, PLACE_ID));

    ok(
      "2. rebuscar NÃO apaga o telefone",
      depois?.telefone === primeiro?.telefone,
      `${primeiro?.telefone ?? "—"} → ${depois?.telefone ?? "APAGADO"}`,
    );
    ok(
      "3. rebuscar NÃO apaga o WhatsApp",
      depois?.whatsapp === primeiro?.whatsapp,
      "telefone e link precisam continuar de acordo",
    );
    ok(
      "4. rebuscar NÃO apaga o site",
      depois?.website === primeiro?.website,
      `${depois?.website ?? "APAGADO"}`,
    );
    ok(
      "5. rebuscar NÃO apaga o Instagram",
      depois?.instagram === primeiro?.instagram,
      `${depois?.instagram ?? "APAGADO"}`,
    );
    ok("6. rebuscar NÃO apaga o e-mail", depois?.email === primeiro?.email);
    ok(
      "7. e não duplica o cadastro",
      (await db.select().from(leads).where(eq(leads.placeId, PLACE_ID))).length === 1,
      "upsert por placeId",
    );

    // ---------- 3ª coleta: o mapa passou a publicar um número novo ----------
    await buscarEGravar(params, buscadorFalso(lugar({ telefone: "(34) 3232-4545" })));
    const [atualizado] = await db.select().from(leads).where(eq(leads.placeId, PLACE_ID));
    ok(
      "8. mas quando a fonte TEM algo a dizer, ela atualiza",
      atualizado?.telefone !== primeiro?.telefone && Boolean(atualizado?.telefone),
      `${atualizado?.telefone ?? "—"}`,
    );
    ok(
      "8b. …preservando o que ela continua sem publicar",
      atualizado?.website === primeiro?.website,
      "silêncio da fonte não é ordem de apagar",
    );
  } finally {
    await limpar();
    const sobrou = await db.select().from(leads).where(eq(leads.placeId, PLACE_ID));
    ok("9. o lead de teste foi removido", sobrou.length === 0, "nenhum resíduo na base");
  }

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
