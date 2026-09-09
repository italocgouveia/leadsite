import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import type { Lead } from "@/lib/db";
import {
  avaliarOportunidadeComercial,
  prontoParaWhatsapp,
  prontoParaInstagram,
  melhorOportunidade,
  type ContextoOportunidade,
} from "@/lib/oportunidade-comercial";
import type { Config } from "@/lib/fila";

/**
 * A MÁQUINA DE VENDAS: uma única fonte decide quem é oportunidade.
 *
 * Três assuntos, e os três já falharam de verdade nesta base:
 *
 *  1. potencial de solução ≠ oportunidade comercial — 997 têm ramo que
 *     comporta um sistema, 4 dá para abordar hoje, e chamar os dois pelo mesmo
 *     nome fez a tela prometer o primeiro número e entregar o segundo;
 *  2. nenhuma tela pode ter régua própria — foi assim que o painel ofereceu 61
 *     leads dos quais 48 eram telefone fixo;
 *  3. um filtro que a tela oferece e o servidor ignora mente com cara de
 *     resposta — as abas do Modo Caça mandavam `fila` para uma rota que nunca
 *     leu o parâmetro.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:maquina
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
    memoriaComercial: null,
    statusSite: "nao-verificado",
    instagramStatus: null,
    telefoneOrigem: null,
    score: 0,
    ...o,
  } as unknown as Lead;
}

const cfg: Config = {
  automacaoAtiva: false,
  provedorUrl: "https://exemplo.invalido",
  provedorToken: "irrelevante-para-este-teste",
  intervaloSegundos: 60,
  limiteDiario: 30,
  janelaRecontatoDias: 30,
  horarioEnvioAtivo: false,
  horarioInicio: "08:00",
  horarioFim: "18:00",
  variacaoAleatoriaAtiva: false,
};

const av = (l: Lead, ctx: ContextoOportunidade = {}) => avaliarOportunidadeComercial(l, ctx);

/** A empresa que a operação quer: pequena, local, com os dois canais. */
const boa = lead({
  telefone: CELULAR,
  whatsapp: CELULAR,
  instagram: IG,
  avaliacoes: 120,
  nota: 4.8,
  horarios: "Seg a Sex 8-18",
});

function main() {
  console.log("\n=== A. POTENCIAL DE SOLUÇÃO ≠ OPORTUNIDADE COMERCIAL ===");

  /** O caso que a tela contava errado: bom negócio, nenhuma porta de entrada. */
  const semCanal = lead({ avaliacoes: 120, nota: 4.8, horarios: "8-18" });
  const sc = av(semCanal);
  ok(
    "1. bom negócio sem canal TEM potencial de solução",
    sc.temPotencialDeSolucao,
    sc.sistema ?? "—",
  );
  ok(
    "2. …e mesmo assim NÃO é oportunidade comercial",
    !sc.elegivel,
    sc.bloqueios.join(" · "),
  );
  ok(
    "3. …ele é fila de enriquecimento, não descarte",
    sc.aguardandoCanal,
    "aguardandoCanal = true",
  );
  ok("4. a boa é oportunidade de verdade", av(boa).elegivel, `${av(boa).prioridade}/100`);

  console.log("\n=== B. AS TRAVAS QUE NENHUM SCORE DERRUBA ===");
  const semSistema = lead({
    nome: "Comércio Genérico",
    categoria: "zzz_nada",
    telefone: CELULAR,
    whatsapp: CELULAR,
    instagram: IG,
    avaliacoes: 900,
    nota: 5,
  });
  ok(
    "5. sem sistema aplicável não é oportunidade, por mais sinal que tenha",
    !av(semSistema).elegivel && !av(semSistema).temPotencialDeSolucao,
    av(semSistema).bloqueios.join(" · "),
  );
  ok(
    "5b. …e não entra na fila de enriquecimento (não há o que vender)",
    !av(semSistema).aguardandoCanal,
  );

  const rede = lead({
    nome: "Bosch Car Service Uberlândia",
    telefone: CELULAR,
    whatsapp: CELULAR,
    dadosOsm: { brand: "Bosch Car Service" },
  });
  ok("6. rede/franquia nunca é oportunidade", !av(rede).elegivel, av(rede).bloqueios[0]);

  const grande = lead({
    nome: "Hospital Municipal",
    categoria: "hospital",
    telefone: CELULAR,
    whatsapp: CELULAR,
  });
  ok("7. ramo de grande porte nunca é oportunidade", !av(grande).elegivel);

  const optOut = lead({ telefone: CELULAR, whatsapp: CELULAR, naoContatar: true });
  ok(
    "8. quem pediu para não ser contatado nunca é oportunidade",
    !av(optOut).elegivel,
    av(optOut).bloqueios[0],
  );

  const encerrado = lead({ telefone: CELULAR, whatsapp: CELULAR, etapa: "sem-interesse" });
  ok("9. lead encerrado nunca é oportunidade", !av(encerrado).elegivel);

  ok(
    "10. bloqueada NUNCA sai como 🔥, por mais pontos que some",
    av(rede).classificacao === "nao-prioritario" && av(optOut).classificacao === "nao-prioritario",
  );

  console.log("\n=== C. OS CANAIS CONTINUAM SEPARADOS ===");
  const soIg = lead({ instagram: IG, avaliacoes: 120, horarios: "8-18" });
  const soWpp = lead({ telefone: CELULAR, whatsapp: CELULAR, avaliacoes: 120 });

  ok("11. só Instagram → canal instagram", av(soIg).canal === "instagram");
  ok("12. só WhatsApp → canal whatsapp", av(soWpp).canal === "whatsapp");
  ok("13. os dois → canal ambos", av(boa).canal === "ambos");

  ok(
    "14. só Instagram NÃO entra em campanha automática",
    !prontoParaWhatsapp(soIg, { cfg, historico: [] }),
  );
  ok(
    "15. …mas continua trabalhável à mão",
    prontoParaInstagram(soIg, { cfg, historico: [] }),
    "abordagem manual é adicional, não exclusiva",
  );

  /**
   * A regra cruzada que existia e não podia existir: usar "não tem WhatsApp"
   * para reprovar um lead que nunca ia receber WhatsApp nenhum.
   */
  ok(
    "16. lead de Instagram NÃO é reprovado por 'sem WhatsApp'",
    av(soIg, { cfg, historico: [] }).elegivel,
    av(soIg, { cfg, historico: [] }).bloqueios.join(" · ") || "sem bloqueios",
  );

  ok(
    "17. 🔥 melhores exige os dois canais E vale vender",
    melhorOportunidade(boa) && !melhorOportunidade(soWpp),
  );

  console.log("\n=== D. ESPERAR NÃO É SER RUIM ===");
  const recente = av(lead({ telefone: CELULAR, whatsapp: CELULAR, avaliacoes: 120 }), {
    cfg,
    historico: [{ id: "m1", status: "enviada", enviadaEm: new Date() }],
  });
  ok(
    "18. contatada há pouco fica bloqueada…",
    !recente.elegivel,
    recente.bloqueios.join(" · "),
  );
  ok(
    "19. …mas marcada como bloqueio TEMPORÁRIO — volta sozinha",
    recente.bloqueioTemporario,
    "a tela precisa distinguir isto de 'é rede nacional'",
  );
  ok(
    "20. rede NÃO é bloqueio temporário",
    !av(rede).bloqueioTemporario,
    "esse nunca passa com o tempo",
  );

  console.log("\n=== E. UMA FONTE SÓ, E AS TELAS LEEM DELA ===");
  const fonteDisparo = readFileSync("src/lib/disparo.ts", "utf8");
  ok(
    "21. a campanha monta a lista pela função central",
    /avaliarOportunidadeComercial/.test(fonteDisparo),
  );
  ok(
    "22. …e não guarda mais uma cópia das regras",
    !/motivoDeDescarte|ETAPAS_ANTES_DO_CONTATO/.test(fonteDisparo),
    "regra duplicada é regra que diverge na próxima edição",
  );

  const fonteMotor = readFileSync("src/lib/oportunidades.ts", "utf8");
  ok("23. o painel usa a mesma função", /avaliarOportunidadeComercial/.test(fonteMotor));

  const fonteCaca = readFileSync("src/app/cacada/page.tsx", "utf8");
  ok(
    "24. a tela de caça lê o veredito, não recalcula",
    /l\.oportunidade\.elegivel/.test(fonteCaca) && !/probabilidadeComercial/.test(fonteCaca),
  );
  ok(
    "25. …e tem as quatro abas",
    ["melhores", "whatsapp", "instagram", "enriquecer"].every((a) =>
      new RegExp(`id: "${a}"`).test(fonteCaca),
    ),
  );
  ok(
    "26. …com o descarte fora do caminho, mas a um clique",
    /esconderDescartados/.test(fonteCaca) && /mostrarDescartados/.test(fonteCaca),
  );
  ok(
    "27. …e uma confirmação antes de criar campanha",
    /PREPARAR CAMPANHA/.test(fonteCaca) && /confirmando/.test(fonteCaca),
  );

  /**
   * A regressão do filtro ignorado: a tela mandava `fila` e a rota não lia.
   * Três abas devolviam a mesma lista, o que fazia a fila do Instagram parecer
   * vazia quando ela tinha 46 leads.
   */
  const fonteRota = readFileSync("src/app/api/disparo/oportunidades/route.ts", "utf8");
  ok(
    "28. a rota LÊ os filtros que a tela manda",
    /q\.get\("aba"\)/.test(fonteRota) &&
      /q\.get\("fila"\)/.test(fonteRota) &&
      /q\.get\("decisao"\)/.test(fonteRota),
    "filtro oferecido e ignorado é pior que filtro nenhum",
  );

  const fonteDisparos = readFileSync("src/app/disparos/page.tsx", "utf8");
  ok(
    "29. /disparos lidera com quantas estão prontas, não com o tamanho da base",
    /funil\.prontasParaWhatsapp/.test(fonteDisparos),
  );
  ok(
    "30. …e separa potencial de solução de oportunidade",
    /funil\.comPotencialDeSolucao/.test(fonteDisparos) &&
      /funil\.oportunidadesReais/.test(fonteDisparos),
  );

  console.log("\n=== F. O RANKING SE EXPLICA ===");
  const r = av(boa);
  ok(
    "31. a oportunidade vem com os motivos que a sustentam",
    r.motivos.length >= 4,
    r.motivos.slice(0, 3).join(" · "),
  );
  ok(
    "32. a bloqueada vem com o motivo do bloqueio",
    av(rede).bloqueios.length > 0 && av(rede).motivos !== undefined,
  );
  ok(
    "33. a dor continua hipótese até o cliente falar",
    r.dor.tipo === "provavel" || r.dor.tipo === "nenhuma",
    r.dor.tipo,
  );

  console.log("\n=== G. NADA AQUI TOCA PRODUÇÃO ===");
  /**
   * A checagem olha os IMPORTS, não o texto do arquivo.
   *
   * A primeira versão procurava "db.update" no próprio fonte e reprovava por
   * encontrar a palavra dentro da própria busca. Procurar por menções acha o
   * teste falando de si mesmo; o que decide se este processo consegue escrever
   * é o que ele carrega em tempo de execução.
   */
  const meuFonte = readFileSync("src/lib/__testes__/maquina.test-manual.ts", "utf8");
  const importsDeValor = meuFonte
    .split("\n")
    .filter((l) => /^import /.test(l) && !/^import type /.test(l))
    .join("\n");

  ok(
    "34. não carrega nada que escreva no banco",
    !/from "@\/lib\/db"/.test(importsDeValor),
    "só `import type`, que some na compilação",
  );
  ok(
    "35. não carrega nada que envie mensagem ou monte campanha",
    !/@\/lib\/disparo|@\/lib\/campanha|@\/lib\/envio/.test(importsDeValor),
    "a configuração usada aqui é um objeto local, não a de produção",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
