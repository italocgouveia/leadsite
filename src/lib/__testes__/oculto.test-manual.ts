import type { Lead } from "@/lib/db/schema";
import { perguntaDeCliente, montarRevelacao, type TesteOculto } from "@/lib/teste-oculto";

/**
 * O que este teste protege, em ordem de importância:
 *  1. o sistema NUNCA afirma "não me responderam" sem teste registrado;
 *  2. chatbot se recusa quando a resposta foi rápida (não existe argumento);
 *  3. site aceita os três resultados, inclusive o rápido — ali a resposta
 *     veloz é o gancho, não o obstáculo;
 *  4. a mensagem cita o dono pelo nome quando a Receita já foi consultada.
 */

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "x",
    nome: "Auto Center Silva",
    categoria: "car_repair",
    cidade: "Uberlândia",
    statusSite: "sem-site",
    score: 70,
    etapa: "novo",
    whatsapp: "https://wa.me/5534999887766",
    nota: 4.7,
    avaliacoes: 80,
    socios: null,
    testeOculto: null,
    ...p,
  } as Lead;
}

const ontem = new Date(Date.now() - 26 * 3_600_000).toISOString();

let falhas = 0;
function ok(titulo: string, condicao: boolean, detalhe = "") {
  console.log(
    condicao ? `  ok   ${titulo}` : `  FALHA ${titulo}${detalhe ? ` -> ${detalhe}` : ""}`,
  );
  if (!condicao) falhas++;
}

console.log("\n[pergunta de cliente]");
ok(
  "oficina recebe pergunta de oficina",
  /revis[ãa]o/i.test(perguntaDeCliente(lead())),
  perguntaDeCliente(lead()),
);
ok(
  "pizzaria recebe pergunta de pizzaria",
  /pizza/i.test(perguntaDeCliente(lead({ categoria: "pizzaria" }))),
  perguntaDeCliente(lead({ categoria: "pizzaria" })),
);
ok(
  "ramo desconhecido cai num padrao plausivel",
  /valores/i.test(perguntaDeCliente(lead({ categoria: "chaveiro_xyz" }))),
  perguntaDeCliente(lead({ categoria: "chaveiro_xyz" })),
);

console.log("\n[sem teste registrado nao existe mensagem]");
const semResultado: TesteOculto = { enviadoEm: ontem, resultado: null };
for (const p of ["site", "chatbot"] as const) {
  const r = montarRevelacao(lead(), semResultado, p);
  ok(`${p}: recusa sem resultado`, r.serve === false, JSON.stringify(r));
}

console.log("\n[chatbot]");
const semResposta: TesteOculto = { enviadoEm: ontem, resultado: "sem-resposta" };
const cb = montarRevelacao(lead({ statusSite: "tem-site" }), semResposta, "chatbot");
if (cb.serve) {
  console.log("\n" + cb.mensagem + "\n");
  ok("cita quando foi enviado", /ontem às \d{2}:\d{2}/.test(cb.mensagem), cb.mensagem);
  ok("oferece atendente", /atendente de WhatsApp/.test(cb.mensagem));
  ok("nao acusa o dono", /n[ãa]o é reclama[çc][ãa]o/i.test(cb.mensagem));
} else {
  ok("chatbot monta com sem-resposta", false, cb.motivo);
}

const rapida: TesteOculto = { enviadoEm: ontem, resultado: "rapida", minutos: 4 };
const cbRapido = montarRevelacao(lead({ statusSite: "tem-site" }), rapida, "chatbot");
ok("chatbot RECUSA quando responderam rapido", cbRapido.serve === false);
ok(
  "e explica que serve pra site",
  cbRapido.serve === false && /SITE/.test(cbRapido.motivo),
  cbRapido.serve === false ? cbRapido.motivo : "",
);

console.log("\n[site]");
const siteRapido = montarRevelacao(lead(), rapida, "site");
if (siteRapido.serve) {
  console.log("\n" + siteRapido.mensagem + "\n");
  ok("site ACEITA resposta rapida", true);
  ok(
    "usa a resposta rapida como gancho",
    /parou o que estava fazendo/.test(siteRapido.mensagem),
    siteRapido.mensagem,
  );
  ok("nao fala de chatbot", !/atendente de WhatsApp/.test(siteRapido.mensagem));
} else {
  ok("site aceita resposta rapida", false, siteRapido.motivo);
}

for (const r of ["sem-resposta", "demorou", "rapida"] as const) {
  const m = montarRevelacao(lead(), { enviadoEm: ontem, resultado: r, minutos: 30 }, "site");
  ok(`site serve para "${r}"`, m.serve === true);
}

console.log("\n[dono pelo nome]");
const comDono = lead({
  statusSite: "tem-site",
  socios: [
    { nome: "CARLOS ANTONIO DEL ROY", qualificacao: "Sócio", decide: false },
    { nome: "ULISSES FLAUZINO GODINHO", qualificacao: "Sócio-Administrador", decide: true },
  ],
});
const comNome = montarRevelacao(comDono, semResposta, "chatbot");
ok(
  "abre com o primeiro nome de quem ADMINISTRA",
  comNome.serve && comNome.mensagem.startsWith("Oi Ulisses,"),
  comNome.serve ? comNome.mensagem.split("\n")[0] : "",
);
const semDono = montarRevelacao(lead(), semResposta, "chatbot");
ok(
  "sem Receita consultada, abre neutro",
  semDono.serve && semDono.mensagem.startsWith("Oi, tudo bem?"),
  semDono.serve ? semDono.mensagem.split("\n")[0] : "",
);

console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} falha(s).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
