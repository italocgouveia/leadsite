import { classificar, LIMIAR_CONFIANCA, ROTULO_INTENCAO } from "@/lib/classificar";

/**
 * O que este teste protege:
 *  1. opt-out vence sem-interesse ("nao quero receber" contem "nao quero");
 *  2. duvida vira NECESSITA ANALISE em vez de chute;
 *  3. so acima do limiar o funil se move sozinho.
 */
let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

const casos: [string, string][] = [
  ["Quero saber mais", "interessado"],
  ["como funciona?", "interessado"],
  ["Me explica melhor por favor", "interessado"],
  ["Pode me mostrar?", "interessado"],
  ["Quanto custa?", "orcamento"],
  ["qual o valor?", "orcamento"],
  ["Pode mandar orçamento?", "orcamento"],
  ["Podemos marcar uma reunião?", "agendamento"],
  ["vamos marcar uma call amanhã", "agendamento"],
  ["que dia fica bom pra você?", "agendamento"],
  ["tem horário disponível essa semana?", "agendamento"],
  ["me chama semana que vem", "depois"],
  ["agora estou ocupado", "depois"],
  ["Não tenho interesse", "sem-interesse"],
  ["obrigado, mas não", "sem-interesse"],
  ["Já usamos um sistema", "ja-tem-sistema"],
  ["nosso sistema já atende", "ja-tem-sistema"],
  ["Não me mande mais mensagens", "opt-out"],
  ["remova meu número", "opt-out"],
  ["pare de mandar mensagem", "opt-out"],
];

console.log("\n[classificacao]");
for (const [texto, esperado] of casos) {
  const c = classificar(texto);
  ok(`"${texto}" -> ${esperado}`, c.intencao === esperado, `${c.intencao} (${c.confianca}%)`);
}

console.log("\n[opt-out vence sem-interesse]");
const oo = classificar("não quero receber mais mensagens");
ok("frase ambigua vai para opt-out", oo.intencao === "opt-out", oo.intencao);
ok("opt-out marca bloqueio permanente", oo.optOut === true);
ok("sem-interesse NAO marca opt-out", classificar("não tenho interesse").optOut === false);

console.log("\n[nao forcar classificacao]");
const vago = classificar("oi");
ok("resposta vaga vira necessita-analise", vago.intencao === "necessita-analise", vago.intencao);
ok("e nao move o funil", vago.etapaSugerida === null);
ok("resposta vazia nao quebra", classificar("").intencao === "necessita-analise");

const curto = classificar("não");
ok("'nao' sozinho tem confianca baixa", curto.confianca < LIMIAR_CONFIANCA, String(curto.confianca));
ok("e por isso nao move o funil", curto.etapaSugerida === null);

console.log("\n[texto longo reduz confianca]");
const longo = classificar("bom dia tudo bem entao olha eu vi sua mensagem aqui e queria entender como funciona esse negocio que voce falou porque a gente ja tentou outras coisas parecidas antes e nao deu muito certo entao fiquei meio na duvida sobre isso tudo agora");
console.log(`     confianca: ${longo.confianca}% -> ${longo.intencao}`);
ok("texto longo perde confianca", longo.confianca < 88, String(longo.confianca));

console.log("\n[destinos]");
ok("interessado -> etapa interessado", classificar("tenho interesse").etapaSugerida === "interessado");
ok("orcamento -> etapa interessado", classificar("quanto custa").etapaSugerida === "interessado");
ok("opt-out -> etapa opt-out", classificar("remova meu número").etapaSugerida === "opt-out");
ok("depois -> fica em respondeu", classificar("me chama depois").etapaSugerida === "respondeu");
ok("agendamento -> etapa reuniao", classificar("podemos marcar uma call?").etapaSugerida === "reuniao");
ok("todas as intencoes tem rotulo", Object.keys(ROTULO_INTENCAO).length === 8);

console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} falha(s).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
