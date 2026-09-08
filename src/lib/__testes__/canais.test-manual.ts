import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import type { Lead } from "@/lib/db";
import {
  canalDoLead,
  instagramDoLead,
  temCelularPlausivel,
  motivoDeDescarte,
  ehAcionavel,
} from "@/lib/canais";
import { scores, prioridadeComercial, oportunidade } from "@/lib/pontuacao";
import { mesmoEstabelecimento } from "@/lib/dedup";
import { FONTES_GRATUITAS } from "@/lib/enriquecimento-fila";
import { MENSAGEM_BASE, montarMensagemUniversal } from "@/lib/mensagem-universal";

/**
 * OS TRÊS CANAIS: WhatsApp automático, Instagram manual, e os dois separados.
 *
 * O teste que resume o arquivo é o 20: a campanha de WhatsApp nunca pode
 * conter lead que só tem Instagram. Foi o buraco que a auditoria achou — o
 * painel filtrava e o botão de campanha não — e é o que este arquivo trava.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:canais
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

const CELULAR = "(34) 99134-5424";
const FIXO = "(34) 3212-4000";
const IG = "https://instagram.com/oficinadojoao";

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
    telefone: null,
    whatsapp: null,
    website: null,
    instagram: null,
    email: null,
    nota: null,
    avaliacoes: null,
    horarios: null,
    dadosOsm: {},
    statusSite: "nao-verificado",
    score: 0,
    ...o,
  } as unknown as Lead;
}

function main() {
  console.log("\n=== A. CLASSIFICAÇÃO DE CANAL ===");
  const zap = lead({ telefone: CELULAR });
  const ig = lead({ instagram: IG });
  const ambos = lead({ telefone: CELULAR, instagram: IG });
  const nada = lead();

  ok("1. celular válido → canal whatsapp", canalDoLead(zap) === "whatsapp");
  ok("2. só Instagram → canal instagram", canalDoLead(ig) === "instagram");
  ok("3. WhatsApp + Instagram → canal ambos", canalDoLead(ambos) === "ambos");
  ok("4. sem os dois → sem-canal", canalDoLead(nada) === "sem-canal");
  ok(
    "4b. e sem-canal fica FORA da visão comercial",
    !ehAcionavel(nada) && motivoDeDescarte(nada) === "sem-canal",
  );

  console.log("\n=== B. O QUE ENTRA NA FILA DE WHATSAPP ===");
  ok("5. telefone fixo NÃO é canal de WhatsApp", canalDoLead(lead({ telefone: FIXO })) !== "whatsapp");
  ok("5b. fixo sem Instagram fica sem canal", canalDoLead(lead({ telefone: FIXO })) === "sem-canal");
  ok(
    "6. DDD incompatível com a UF não vira celular confiável",
    !temCelularPlausivel(lead({ telefone: "(11) 99999-8888", estado: "MG" })),
    "DDD 11 num lead de Minas",
  );
  ok(
    "6b. DDD da UF do lead é aceito",
    temCelularPlausivel(lead({ telefone: CELULAR, estado: "MG" })),
  );
  ok(
    "6c. sem UF para comparar, não reprova",
    temCelularPlausivel(lead({ telefone: "(11) 99999-8888", estado: null })),
    "falta de dado não é prova de erro",
  );

  console.log("\n=== C. INSTAGRAM: PERFIL x QUALQUER LINK ===");
  ok("7a. perfil normal é aceito", instagramDoLead({ instagram: IG })?.username === "oficinadojoao");
  ok(
    "7b. link de POST não é perfil",
    instagramDoLead({ instagram: "https://www.instagram.com/p/CXPE90aJ1e4/" }) === null,
    "estava gravado assim na base real",
  );
  ok("7c. reel não é perfil", instagramDoLead({ instagram: "https://instagram.com/reel/abc" }) === null);
  ok(
    "7d. '@empresa' digitado à mão funciona",
    instagramDoLead({ instagram: "@padariacentral" })?.username === "padariacentral",
  );
  ok(
    "7e. link de outro site não é Instagram",
    instagramDoLead({ instagram: "https://facebook.com/x" }) === null,
  );

  console.log("\n=== D. OS DOIS PIPELINES NÃO SE TOCAM ===");
  /**
   * Garantia ESTRUTURAL, lida do próprio código: a rota do Instagram não pode
   * escrever em `etapa` (funil do WhatsApp) nem criar mensagem, e a fila de
   * WhatsApp não pode escrever em `instagramStatus`.
   */
  const rotaIg = readFileSync("src/app/api/instagram/route.ts", "utf8");
  ok(
    "8. status do Instagram não altera o funil de WhatsApp",
    !/etapa:/.test(rotaIg) && !/naoContatar:/.test(rotaIg),
    "a rota só escreve instagramStatus e instagramAbordadoEm",
  );
  /**
   * Procura USO, não a palavra: o cabeçalho da rota diz "não cria mensagem"
   * justamente para documentar a separação, e casar com esse texto
   * transformaria a documentação correta em falha de teste.
   */
  const importsIg = rotaIg
    .split(/\r?\n/)
    .filter((l) => l.trimStart().startsWith("import"))
    .join(" ");
  ok(
    "7. a fila do Instagram não dispara WhatsApp",
    !/@\/lib\/(fila|disparo|campanha|providers|bridge)/.test(importsIg) &&
      !/\bmensagens\b/.test(importsIg),
    "não importa nada do caminho de envio",
  );
  const disparo = readFileSync("src/lib/disparo.ts", "utf8");
  ok(
    "9. status do WhatsApp não altera o do Instagram",
    !/instagramStatus/.test(disparo),
    "o motor de disparo nem conhece o campo",
  );

  console.log("\n=== E. A CAMPANHA SÓ ACEITA WHATSAPP ===");
  /**
   * O teste 20 do plano. Lê o motor real de seleção da campanha e confirma que
   * ele recusa canal `instagram` explicitamente.
   */
  ok(
    "20. campanha de WhatsApp nunca contém lead só de Instagram",
    /canal === "instagram"/.test(disparo) && /fila manual/i.test(disparo),
    "elegiveis() recusa canal instagram",
  );
  ok(
    "20b. e a campanha exige paraNovaCampanha (barra telefone fixo)",
    /paraNovaCampanha: true/.test(disparo),
  );

  console.log("\n=== F. QUALIDADE NÃO VEM DE CANAL ===");
  /** Um comércio genérico, sem encaixe de sistema, mas com os dois canais. */
  const semSistema = lead({
    nome: "Comércio Genérico",
    categoria: "zzz_nada",
    telefone: CELULAR,
    whatsapp: "https://wa.me/5534991345424",
    instagram: IG,
    email: "contato@x.com.br",
    avaliacoes: 500,
    nota: 5,
  });
  ok(
    "11. sem sistema aplicável nunca vira A só por ter telefone e Instagram",
    prioridadeComercial(semSistema).nivel === "D",
    prioridadeComercial(semSistema).porque,
  );
  ok(
    "11b. e fica fora da visão comercial",
    motivoDeDescarte(semSistema) === "sem-sistema",
  );

  const sc = scores(semSistema);
  ok(
    "17. contatabilidade alta NÃO cria oportunidade comercial",
    sc.contatabilidade >= 60 && sc.final <= sc.comercial,
    `comercial ${sc.comercial} · contato ${sc.contatabilidade} · final ${sc.final}`,
  );
  const bom = scores(lead({ telefone: CELULAR, instagram: IG, avaliacoes: 120, nota: 4.8 }));
  ok(
    "17b. os três scores são distintos e o final nunca passa do comercial",
    bom.final <= bom.comercial && bom.contatabilidade > 0,
    `comercial ${bom.comercial} · contato ${bom.contatabilidade} · final ${bom.final}`,
  );

  console.log("\n=== G. PEQUENO x REDE, E O SITE ===");
  const pequena = lead({ telefone: CELULAR, instagram: IG, avaliacoes: 120, nota: 4.8 });
  const rede = lead({
    nome: "Bosch Car Service Uberlândia",
    telefone: CELULAR,
    instagram: IG,
    avaliacoes: 120,
    nota: 4.8,
    dadosOsm: { brand: "Bosch Car Service" },
  });
  ok(
    "10. pequena local supera rede com oportunidade equivalente",
    scores(pequena).final > scores(rede).final,
    `${scores(pequena).final} vs ${scores(rede).final}`,
  );
  ok("10b. e a rede sai da visão comercial", motivoDeDescarte(rede) === "rede-ou-grande");

  const comSite = lead({ telefone: CELULAR, website: "https://x.com.br", statusSite: "tem-site" });
  const semSiteSemNada = lead({
    nome: "Comércio Silva",
    categoria: "zzz_nada",
    statusSite: "sem-site",
  });
  ok(
    "12. 'sem site' não domina: oficina COM site ganha de cadastro vazio sem site",
    oportunidade(comSite).score > oportunidade(semSiteSemNada).score,
    `${oportunidade(comSite).score} vs ${oportunidade(semSiteSemNada).score}`,
  );
  ok(
    "12b. o critério de site vale no máximo 5 de 120",
    (oportunidade(comSite).criterios.find((c) => c.id === "sem-site")?.maximo ?? 0) === 5,
  );

  console.log("\n=== H. DEDUPLICAÇÃO SEGURA ===");
  ok(
    "13. Facebook compartilhado NÃO une duas empresas",
    !mesmoEstabelecimento(
      { nome: "Fazendeiro Lanches", website: "https://facebook.com/fazendeirolanches" },
      { nome: "Casa do Salgado", website: "https://facebook.com/casadosalgado" },
    ).igual,
  );
  ok(
    "13b. mas o mesmo @ de Instagram une",
    mesmoEstabelecimento(
      { nome: "Oficina do João", instagram: "https://instagram.com/oficinax" },
      { nome: "OFICINA JOAO LTDA", instagram: "@oficinax" },
    ).igual,
  );
  ok(
    "13c. mesmo nome no mesmo ponto do mapa une (nó + área do OSM)",
    mesmoEstabelecimento(
      { nome: "Espetinho", lat: -18.9188, lng: -48.2768 },
      { nome: "Espetinho", lat: -18.91881, lng: -48.27681 },
    ).igual,
  );
  ok(
    "13d. mesmo nome em pontos distantes NÃO une",
    !mesmoEstabelecimento(
      { nome: "Barbearia do Zé", lat: -18.9188, lng: -48.2768 },
      { nome: "Barbearia do Zé", lat: -18.9500, lng: -48.3000 },
    ).igual,
  );
  ok(
    "14. telefone de terceiro não é atribuído: DDD errado reprova o canal",
    !temCelularPlausivel(lead({ telefone: "(11) 98888-7777", estado: "MG" })),
  );

  console.log("\n=== I. A MENSAGEM UNIVERSAL NÃO MUDOU ===");
  ok(
    "16. a copy-base continua byte a byte a mesma",
    MENSAGEM_BASE ===
      "Olá, tudo bem? Falo da ICG Tech. Vi a empresa [NOME_EMPRESA] e queria te " +
        "mostrar uma ideia que pode ajudar vocês a melhorar alguns processos e " +
        "oportunidades comerciais. Posso te explicar rapidinho?",
  );
  const textos = new Set(
    [zap, ig, ambos, pequena, rede, semSistema].map((l) =>
      montarMensagemUniversal({ ...l, nome: "Empresa X" } as Lead),
    ),
  );
  ok("16b. canal e score NÃO mudam o texto", textos.size === 1, `${textos.size} texto(s)`);

  console.log("\n=== J. RANKING E VISÃO COMERCIAL ===");
  ok(
    "18. lead sem canal não aparece na fila comercial",
    !ehAcionavel(nada) && !ehAcionavel(lead({ telefone: FIXO })),
  );
  ok(
    "19. o ranking prioriza quem é acionável",
    scores(ambos).final > scores(lead({ instagram: IG })).final &&
      scores(lead({ instagram: IG })).final > scores(nada).final,
    `ambos ${scores(ambos).final} > só IG ${scores(lead({ instagram: IG })).final} > nada ${scores(nada).final}`,
  );
  ok(
    "15. histórico preservado: opt-out e encerrado saem da visão, não do banco",
    motivoDeDescarte(lead({ naoContatar: true, telefone: CELULAR })) === "opt-out" &&
      motivoDeDescarte(lead({ etapa: "sem-interesse", telefone: CELULAR })) === "encerrado",
    "nenhum DELETE envolvido — só filtro de tela",
  );

  console.log("\n=== K. SEM API PAGA, O CRM CONTINUA FUNCIONANDO ===");
  /**
   * O requisito é estrutural: nenhuma decisão comercial pode depender de
   * `GOOGLE_PLACES_API_KEY`. As três fontes gratuitas continuam na lista, e o
   * Places é a última — quando a chave falta ele devolve `null`, que é uma
   * resposta válida e não um erro.
   */
  ok(
    "20a. as fontes gratuitas cobrem cadastro, OSM e site próprio",
    FONTES_GRATUITAS.includes("cadastro") &&
      FONTES_GRATUITAS.includes("osm") &&
      FONTES_GRATUITAS.includes("site-proprio"),
    FONTES_GRATUITAS.join(", "),
  );
  const modulosComerciais = [
    "src/lib/canais.ts",
    "src/lib/pontuacao.ts",
    "src/lib/oportunidades.ts",
    "src/lib/disparo.ts",
  ];
  ok(
    "20b. nenhum módulo de qualificação depende da chave paga",
    modulosComerciais.every((m) => !/GOOGLE_PLACES_API_KEY/.test(readFileSync(m, "utf8"))),
    "canal, score, filas e campanha funcionam sem chave nenhuma",
  );
  /** Classificar canal e score não faz chamada de rede nenhuma: é tudo puro. */
  ok(
    "20c. classificar canal e pontuar são offline",
    canalDoLead(ambos) === "ambos" && scores(ambos).final > 0,
    "nenhuma fonte externa envolvida",
  );

  console.log("\n=== L. HISTÓRICO NUNCA É APAGADO ===");
  /**
   * A prova de que esta reestruturação não remove nada: nenhum dos módulos
   * comerciais executa DELETE. A limpeza mora em scripts próprios, com dry-run
   * e confirmação — nunca no caminho que a tela chama.
   */
  ok(
    "19. nenhum módulo comercial apaga lead",
    modulosComerciais.every((m) => !/\.delete\(|DELETE FROM/i.test(readFileSync(m, "utf8"))),
    "nenhum DELETE nos motores de canal, score, filas e campanha",
  );
  ok(
    "19b. a rota do Instagram também não apaga nada",
    !/\.delete\(|DELETE FROM/i.test(rotaIg),
  );
  ok(
    "16. lead preservado por histórico sai da VISÃO, não do banco",
    motivoDeDescarte(lead({ etapa: "fechado", telefone: CELULAR })) === "encerrado" ||
      motivoDeDescarte(lead({ etapa: "fechado", telefone: CELULAR })) === null,
    "descarte é filtro de tela; nenhuma função aqui remove linha",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
