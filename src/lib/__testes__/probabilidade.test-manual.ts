import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import type { Lead } from "@/lib/db";
import {
  probabilidadeComercial,
  dorDoLead,
  ORDEM_CLASSIFICACAO,
} from "@/lib/probabilidade";
import { canalDoLead } from "@/lib/canais";
import { validarConfigDeProducao, retratoDaConfig } from "@/lib/config-producao";

/**
 * A DECISÃO DE AGENDA: 🔥 quero vender · 🟡 vale abordar · ⚪ não prioritário.
 *
 * Dois assuntos, e os dois são travas:
 *
 *  1. canal melhora a capacidade de contato mas NÃO cria oportunidade — nenhuma
 *     soma de pontos coloca em 🔥 uma empresa sem o que vender;
 *  2. configuração de teste nunca pode passar por produção.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:probabilidade
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
    score: 0,
    ...o,
  } as unknown as Lead;
}

const cls = (l: Lead) => probabilidadeComercial(l).classificacao;

function main() {
  console.log("\n=== A. QUEM EU QUERO VENDER ===");
  const oficinaUdi = lead({
    telefone: CELULAR,
    instagram: IG,
    avaliacoes: 120,
    nota: 4.8,
    horarios: "Seg a Sex 8-18",
  });
  ok(
    "1. pequena de Uberlândia + WhatsApp + sistema → 🔥 QUERO VENDER",
    cls(oficinaUdi) === "quero-vender",
    `${probabilidadeComercial(oficinaUdi).pontos}/100`,
  );

  /** Mesma empresa, mesma qualidade — só que em São Paulo. */
  const oficinaSp = lead({
    cidade: "São Paulo",
    estado: "SP",
    telefone: "(11) 99999-8888",
    instagram: IG,
    avaliacoes: 2000,
    nota: 4.9,
    horarios: "Seg a Sex 8-18",
  });
  ok(
    "2. grande volume de dados em SP NÃO supera a local",
    probabilidadeComercial(oficinaUdi).pontos > probabilidadeComercial(oficinaSp).pontos,
    `Uberlândia ${probabilidadeComercial(oficinaUdi).pontos} vs SP ${probabilidadeComercial(oficinaSp).pontos}`,
  );
  ok(
    "8. e a de fora da praça é rebaixada",
    cls(oficinaSp) !== "quero-vender",
    `${probabilidadeComercial(oficinaSp).classificacao}`,
  );

  console.log("\n=== B. AS TRAVAS DURAS ===");
  const semSistema = lead({
    nome: "Comércio Genérico",
    categoria: "zzz_nada",
    telefone: CELULAR,
    instagram: IG,
    avaliacoes: 900,
    nota: 5,
    horarios: "8-18",
  });
  ok(
    "3. local sem sistema aplicável NUNCA vira 🔥",
    cls(semSistema) === "nao-prioritario",
    "canal não cria oportunidade comercial",
  );

  const rede = lead({
    nome: "Bosch Car Service Uberlândia",
    telefone: CELULAR,
    instagram: IG,
    avaliacoes: 900,
    nota: 5,
    dadosOsm: { brand: "Bosch Car Service" },
  });
  ok("3b. rede/franquia NUNCA vira 🔥", cls(rede) === "nao-prioritario");

  const grande = lead({ nome: "Hospital Municipal", categoria: "hospital", telefone: CELULAR });
  ok("3c. ramo de grande porte NUNCA vira 🔥", cls(grande) === "nao-prioritario");

  const semCanal = lead({ avaliacoes: 120, nota: 4.8, horarios: "8-18" });
  ok(
    "4. sem canal não entra nas filas operacionais",
    cls(semCanal) === "nao-prioritario",
    "continua no banco para enriquecer, mas não ocupa a agenda",
  );

  console.log("\n=== C. OS CANAIS CONTINUAM SEPARADOS ===");
  ok("5. só Instagram → canal instagram", canalDoLead(lead({ instagram: IG })) === "instagram");
  ok("6. só WhatsApp → canal whatsapp", canalDoLead(lead({ telefone: CELULAR })) === "whatsapp");
  ok(
    "7. os dois → canal ambos",
    canalDoLead(lead({ telefone: CELULAR, instagram: IG })) === "ambos",
  );
  ok(
    "7b. só Instagram pode ser 🟡, mas nunca entra em campanha de WhatsApp",
    cls(lead({ instagram: IG, avaliacoes: 120, horarios: "8-18" })) !== "nao-prioritario" &&
      /canal === "instagram"/.test(readFileSync("src/lib/disparo.ts", "utf8")),
  );

  console.log("\n=== D. A DOR É HIPÓTESE ATÉ O CLIENTE FALAR ===");
  const soRamo = lead({ telefone: CELULAR });
  const comSinais = lead({ telefone: CELULAR, avaliacoes: 120, horarios: "8-18" });
  ok(
    "9. ramo sozinho NÃO gera dor — nem provável",
    dorDoLead(soRamo).tipo === "nenhuma",
    "oficina não significa automaticamente problema com OS",
  );
  const provavel = dorDoLead(comSinais);
  ok(
    "9b. ramo + sinais de operação gera dor PROVÁVEL, com os sinais à vista",
    provavel.tipo === "provavel" && provavel.sinais.length >= 2,
    provavel.tipo === "provavel" ? provavel.sinais.join(", ") : provavel.tipo,
  );
  const confirmada = dorDoLead(
    lead({
      telefone: CELULAR,
      memoriaComercial: { dorConfirmada: "controlo tudo em caderno" },
    } as Partial<Lead>),
  );
  ok(
    "10. dor descrita pelo cliente vira CONFIRMADA",
    confirmada.tipo === "confirmada",
    confirmada.tipo === "confirmada" ? confirmada.texto : confirmada.tipo,
  );

  console.log("\n=== E. O RANKING SE EXPLICA ===");
  const r = probabilidadeComercial(oficinaUdi);
  ok(
    "11. os fatores positivos são listados com o peso",
    r.positivos.length >= 4 && r.positivos.every((m) => m.pontos > 0),
    r.positivos.map((m) => `${m.texto} +${m.pontos}`).join(" · "),
  );
  ok(
    "11b. o que falta saber também aparece",
    probabilidadeComercial(lead({ instagram: IG })).negativos.length > 0,
    probabilidadeComercial(lead({ instagram: IG }))
      .negativos.map((m) => m.texto)
      .join(" · "),
  );
  ok(
    "11c. a ordem de trabalho é 🔥 → 🟡 → ⚪",
    ORDEM_CLASSIFICACAO["quero-vender"] < ORDEM_CLASSIFICACAO["vale-abordar"] &&
      ORDEM_CLASSIFICACAO["vale-abordar"] < ORDEM_CLASSIFICACAO["nao-prioritario"],
  );

  console.log("\n=== F. CONFIGURAÇÃO DE PRODUÇÃO ===");
  const boa = {
    provedorTipo: "custom",
    provedorBaseUrl: "https://algo.trycloudflare.com",
    provedorEndpointCustom: "/send",
    provedorToken: "Zk9x2Lq7Pm4Rw8Tn1Vb6Yc3Hd5Jf0Ks",
    provedorInstancia: null,
    provedorTestadoEm: new Date(),
    automacaoAtiva: false,
    limiteDiario: 30,
  } as never;
  ok("17a. configuração real passa", validarConfigDeProducao(boa).valida);

  const casos: [string, Record<string, unknown>][] = [
    ["URL de exemplo", { provedorBaseUrl: "https://provedor-de-teste.example.com" }],
    ["localhost", { provedorBaseUrl: "http://localhost:8098" }],
    ["127.0.0.1", { provedorBaseUrl: "http://127.0.0.1:8099" }],
    ["token de teste", { provedorToken: "chave-de-teste" }],
    ["token mock", { provedorToken: "mock-token-concorrencia" }],
    ["custom sem endpoint", { provedorEndpointCustom: null }],
    ["sem URL", { provedorBaseUrl: null }],
  ];
  for (const [rot, patch] of casos) {
    const v = validarConfigDeProducao({ ...(boa as object), ...patch } as never);
    ok(`17. ${rot} BLOQUEIA o envio`, !v.valida, v.valida ? "" : v.motivo);
  }

  /** O retrato de segurança não pode carregar segredo nenhum. */
  const retrato = JSON.stringify(retratoDaConfig(boa));
  ok(
    "14. o snapshot não registra token nem segredo",
    !retrato.includes("Zk9x2Lq7") && retrato.includes("temToken"),
    "só a presença do token, nunca o valor",
  );

  console.log("\n=== G. TESTES NÃO CORROMPEM A CONFIGURAÇÃO ===");
  const fonteCfgTeste = readFileSync("src/lib/config-teste.ts", "utf8");
  ok(
    "12. existe helper de isolamento com restauração garantida",
    /export async function comConfigDeTeste/.test(fonteCfgTeste) &&
      /finally/.test(fonteCfgTeste),
  );
  ok(
    "13. a restauração é registrada nos sinais do processo",
    /SIGINT/.test(fonteCfgTeste) && /SIGTERM/.test(fonteCfgTeste),
  );
  ok(
    "15. e também em uncaughtException / unhandledRejection",
    /uncaughtException/.test(fonteCfgTeste) && /unhandledRejection/.test(fonteCfgTeste),
  );

  /**
   * O teste que causou o incidente. A verificação é sobre a ESTRUTURA dele:
   * usa `protegerConfig` e confere a procedência no fim, em vez de depender de
   * um `restaurar()` solto que o timeout pulava.
   */
  const fonteCampanha = readFileSync("src/lib/__testes__/campanha.test-manual.ts", "utf8");
  ok(
    "13b. test:campanha usa o protetor e confere a config no fim",
    /protegerConfig/.test(fonteCampanha) &&
      /validarConfigDeProducao/.test(fonteCampanha) &&
      /\.finally\(/.test(fonteCampanha),
  );
  ok(
    "16. o valor de teste é local, para o detector pegar se vazar",
    /127\.0\.0\.1/.test(fonteCampanha),
    "se a restauração falhar, o que sobra é bloqueável",
  );

  const fonteWorker = readFileSync("src/app/api/automacao/worker/route.ts", "utf8");
  ok(
    "16b. o worker se recusa a LIGAR com configuração de teste",
    /validarConfigDeProducao/.test(fonteWorker) && /bloqueado: true/.test(fonteWorker),
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
