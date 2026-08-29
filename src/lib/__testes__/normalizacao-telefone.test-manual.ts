// Teste manual: normalização do nono dígito do celular brasileiro, usada
// para achar o lead certo mesmo quando o WhatsApp devolve o número sem o 9
// que está cadastrado (ou vice-versa). Não deve, em nenhum caso, produzir
// falso positivo — DDI/DDD/base diferentes nunca podem "bater".
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { mesmoTelefone, normalizarTelefoneParaComparacao, variantesTelefoneBR } from "@/lib/telefone";
import { db, leads } from "@/lib/db";
import { buscarLeadPorWhatsapp } from "@/lib/leads";
import { eq } from "drizzle-orm";

function afirmar(nome: string, condicao: boolean) {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  console.log(`OK: ${nome}`);
}

async function main() {
  // ---------------------------------------------------------------- DEVE ASSOCIAR
  afirmar(
    "com 9 -> sem 9",
    mesmoTelefone("5534998742209", "553498742209"),
  );
  afirmar(
    "sem 9 -> com 9 (direção invertida)",
    mesmoTelefone("553498742209", "5534998742209"),
  );
  afirmar(
    "formatos diferentes (link wa.me vs dígitos crus) continuam batendo",
    mesmoTelefone("https://wa.me/5534998742209", "553498742209"),
  );
  afirmar(
    "mesmo número, mesma forma, sempre bate",
    mesmoTelefone("5534998742209", "5534998742209"),
  );

  // ------------------------------------------------------------ NÃO DEVE ASSOCIAR
  afirmar(
    "números diferentes (último dígito) não batem",
    !mesmoTelefone("5534998742209", "5534998742210"),
  );
  afirmar(
    "DDD diferente não bate",
    !mesmoTelefone("5534998742209", "5535998742209"),
  );
  afirmar(
    "DDI diferente não bate mesmo com o resto igual",
    !mesmoTelefone("5534998742209", "1134998742209"),
  );
  afirmar(
    "telefone fixo não bate com celular parecido",
    !mesmoTelefone("553432101234", "5534932101234"),
  );
  afirmar(
    "fixo não bate com ele mesmo escrito como se fosse celular",
    !mesmoTelefone("553432101234", "553439321012340"),
  );
  afirmar(
    "número internacional (não-BR) só bate por igualdade exata",
    !mesmoTelefone("12025551234", "12025551235"),
  );
  afirmar(
    "número internacional igual a si mesmo continua batendo (sem heurística BR)",
    mesmoTelefone("12025551234", "12025551234"),
  );
  afirmar(
    "diferença maior que o nono dígito não bate",
    !mesmoTelefone("5534998742209", "5534887742209"),
  );
  afirmar(
    "DDD inexistente não ativa a regra BR — só bate por igualdade exata",
    mesmoTelefone("5500998742209", "5500998742209") && !mesmoTelefone("5500998742209", "550098742209"),
  );

  // --------------------------------------------------------------- variantes
  const variantesComNono = variantesTelefoneBR("5534998742209");
  afirmar("variantes de celular com 9: inclui as duas formas", variantesComNono.length === 2 && variantesComNono.includes("553498742209"));

  const variantesFixo = variantesTelefoneBR("553432101234");
  afirmar("variantes de fixo: só a própria forma", variantesFixo.length === 1 && variantesFixo[0] === "553432101234");

  const variantesInternacional = variantesTelefoneBR("12025551234");
  afirmar("variantes de número internacional: só a própria forma", variantesInternacional.length === 1);

  afirmar("chave vazia para entrada vazia", normalizarTelefoneParaComparacao("") === "" && normalizarTelefoneParaComparacao(null) === "");

  // ------------------------------------------------------- REGRESSÃO (buscarLeadPorWhatsapp)
  const marcador = `teste-norm-${Date.now()}`;
  const idsCriados: string[] = [];
  try {
    const [leadComNono] = await db
      .insert(leads)
      .values({
        placeId: `${marcador}-a`,
        nome: "Teste normalização — com nono",
        categoria: "teste",
        cidade: "Uberlândia",
        statusSite: "sem-site",
        score: 0,
        whatsapp: "https://wa.me/5599988877001",
      })
      .returning();
    idsCriados.push(leadComNono.id);

    // número tradicional: acha direto.
    const achadoDireto = await buscarLeadPorWhatsapp("5599988877001");
    afirmar("busca: número tradicional acha o lead", achadoDireto?.id === leadComNono.id);

    // mesmo lead, resposta chega SEM o nono dígito: precisa achar pela variante.
    const semNono = "5599988877001".slice(0, 4) + "5599988877001".slice(5); // remove o "9" na posição do nono
    afirmar("número sem-nono de teste tem 12 dígitos", semNono.length === 12);
    const achadoViaSemNono = await buscarLeadPorWhatsapp(semNono);
    afirmar("busca: variante SEM o nono acha o mesmo lead cadastrado COM o nono", achadoViaSemNono?.id === leadComNono.id);

    // lead cadastrado SEM o nono; resposta chega COM o nono.
    const [leadSemNono] = await db
      .insert(leads)
      .values({
        placeId: `${marcador}-b`,
        nome: "Teste normalização — sem nono",
        categoria: "teste",
        cidade: "Uberlândia",
        statusSite: "sem-site",
        score: 0,
        whatsapp: "https://wa.me/553499988702",
      })
      .returning();
    idsCriados.push(leadSemNono.id);

    const achadoViaComNono = await buscarLeadPorWhatsapp("5534999988702");
    afirmar("busca: variante COM o nono acha o mesmo lead cadastrado SEM o nono", achadoViaComNono?.id === leadSemNono.id);

    // número sem qualquer lead cadastrado: não acha nada (e não explode).
    const naoAchado = await buscarLeadPorWhatsapp("5599999990000");
    afirmar("busca: número sem lead cadastrado devolve undefined", naoAchado === undefined);

    // ---- regressão: LID resolvido -> número (mesmo formato usado pela bridge) ----
    afirmar(
      "regressão: LID resolvido vira número tradicional, acha o lead certo",
      (await buscarLeadPorWhatsapp("5599988877001"))?.id === leadComNono.id,
    );

    // ---- regressão: LID NÃO resolvido não deve nem chegar aqui como número ----
    afirmar(
      "regressão: identificador vazio (LID não resolvido) não acha nada e não quebra",
      (await buscarLeadPorWhatsapp("")) === undefined,
    );

    console.log("\nTodos os testes de normalização de telefone passaram.");
  } finally {
    for (const id of idsCriados) {
      await db.delete(leads).where(eq(leads.id, id));
    }
    console.log(`Limpeza: ${idsCriados.length} lead(s) de teste removido(s) por ID exato.`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
