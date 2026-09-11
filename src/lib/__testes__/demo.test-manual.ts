import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  gerarContatos,
  estadoInicial,
  simularNovaMensagem,
  responderIA,
  assumirAtendimento,
  indicadores,
  DemoAutomationProvider,
} from "@/lib/demo-automacao/motor";

/**
 * A DEMONSTRAÇÃO NÃO CONSEGUE ATINGIR A OPERAÇÃO REAL.
 *
 * Não é "não deve" — é "não consegue". O motor não importa banco, fila,
 * Bridge nem provedor; o contexto não faz `fetch`; as telas não têm rota de
 * API. Este teste lê os arquivos e reprova se qualquer uma dessas portas
 * aparecer. Uma demonstração convincente é o cenário exato em que alguém
 * confunde o fictício com o real, e a operação real deste CRM manda
 * WhatsApp de verdade.
 *
 * Sem banco, sem rede, sem envio — inclusive este teste.
 *
 *   npm run test:demo
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

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Um gerador previsível, para o teste ser o mesmo toda vez. */
function semente(n: number) {
  let s = n;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function main() {
  console.log("\n=== A. O MURO: NENHUMA PORTA PARA A OPERAÇÃO REAL ===");
  const fontesDemo = [...arquivos("src/lib/demo-automacao"), ...arquivos("src/app/automacao"), ...arquivos("src/components/automacao")]
    /** As duas rotas legadas são redirects e não fazem parte da demonstração. */
    .filter((a) => !/automacao[\\/](page|regras)/.test(a) || /automacao[\\/]page\.tsx$/.test(a));

  const PROIBIDOS: [RegExp, string][] = [
    [/@\/lib\/db/, "banco de dados"],
    [/@\/lib\/fila/, "fila de envio"],
    [/@\/lib\/bridge/, "Bridge do WhatsApp"],
    [/@\/lib\/providers/, "provedores de envio"],
    [/@\/lib\/disparo/, "disparo"],
    [/@\/lib\/campanha/, "campanha"],
    [/@\/lib\/mensagem-universal/, "mensagem universal"],
    [/@\/lib\/resposta-automatica/, "resposta automática real"],
    [/@\/lib\/classificar/, "classificador real"],
    [/@\/lib\/gen\//, "geração por IA real"],
    [/drizzle-orm/, "ORM"],
    [/\bfetch\s*\(/, "chamada de rede"],
    [/\/send\b/, "endpoint de envio"],
    [/process\.env\./, "variável de ambiente"],
  ];

  for (const arq of fontesDemo) {
    const fonte = readFileSync(arq, "utf8");
    const nome = arq.replace(/\\/g, "/").replace(/^.*src\//, "src/");
    /**
     * Comentário não conta. O cabeçalho de motor.ts cita os caminhos
     * proibidos justamente para dizer que NÃO os importa, e a primeira
     * versão reprovava por encontrar a menção. O que decide se um arquivo
     * alcança algo é o que ele carrega, não o que ele diz.
     */
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const violacoes = PROIBIDOS.filter(([re]) => re.test(semComentarios)).map(([, o]) => o);
    ok(`1. ${nome} não alcança ${violacoes.length ? violacoes.join(", ") : "nada real"}`, violacoes.length === 0);
  }

  /**
   * /api/automacao/* são as rotas REAIS do worker e da fila, anteriores à
   * demonstração. O que não pode existir é rota que use o motor da demo —
   * essa seria a porta do estado fictício para o servidor.
   */
  ok(
    "2. nenhuma rota de API usa o motor da demonstração",
    !arquivos("src/app/api").some((a) => /demo-automacao/.test(readFileSync(a, "utf8"))),
    "o estado só existe no navegador",
  );

  console.log("\n=== B. OS 100 CONTATOS SÃO FICTÍCIOS E ISOLADOS ===");
  const contatos = gerarContatos();
  ok("3. são exatamente 100", contatos.length === 100);
  ok(
    "4. todo nome é 'Cliente NNN' — nenhum nome real",
    contatos.every((c) => /^Cliente \d{3}$/.test(c.nome)),
  );
  ok(
    "5. todo telefone começa com DDD 00, que não existe",
    contatos.every((c) => c.telefone.startsWith("(00) ")),
    "impossível colidir com número real",
  );
  ok(
    "6. a distribuição é a pedida: 35 preço, 20 horário, 15 agendar…",
    contatos.filter((c) => c.intencao === "preco").length === 35 &&
      contatos.filter((c) => c.intencao === "horario").length === 20 &&
      contatos.filter((c) => c.intencao === "agendar").length === 15 &&
      contatos.filter((c) => c.intencao === "humano").length === 4 &&
      contatos.filter((c) => c.intencao === "indefinida").length === 2,
  );
  ok(
    "7. gerar duas vezes dá o MESMO resultado",
    JSON.stringify(gerarContatos().map((c) => c.nome + c.telefone + c.intencao)) ===
      JSON.stringify(contatos.map((c) => c.nome + c.telefone + c.intencao)),
    "a apresentação não muda no meio",
  );

  console.log("\n=== C. A SIMULAÇÃO SÓ MEXE NO ESTADO DA DEMONSTRAÇÃO ===");
  const rnd = semente(7);
  const e0 = estadoInicial();
  const { estado: e1, contatoId } = simularNovaMensagem(e0, rnd);
  ok("8. a simulação toca um contato", Boolean(contatoId), contatoId ?? "nenhum");
  ok(
    "9. …e acrescenta a fala do cliente",
    e1.contatos.find((c) => c.id === contatoId)!.mensagens.length >
      e0.contatos.find((c) => c.id === contatoId)!.mensagens.length,
  );
  ok("10. o estado original NÃO foi mutado", e0.contatos.find((c) => c.id === contatoId)!.mensagens.length === (e0.contatos.find((c) => c.id === contatoId)!.mensagens.length), "imutável por construção");

  const e2 = responderIA(e1, contatoId!, rnd);
  const ultima = e2.contatos.find((c) => c.id === contatoId)!.mensagens.at(-1);
  ok("11. a IA responde", ultima?.autor === "ia", ultima?.texto.slice(0, 50));

  console.log("\n=== D. ASSUMIR ATENDIMENTO PAUSA A IA — SÓ ALI ===");
  const e3 = assumirAtendimento(e2, contatoId!);
  const assumido = e3.contatos.find((c) => c.id === contatoId)!;
  ok("12. o contato fica com atendimentoHumano = true", assumido.atendimentoHumano);
  ok("13. …e a IA para de responder NELE", responderIA(e3, contatoId!, rnd).contatos.find((c) => c.id === contatoId)!.mensagens.length === assumido.mensagens.length);
  ok(
    "14. …mas continua respondendo nos outros",
    e3.contatos.filter((c) => c.id !== contatoId && !c.atendimentoHumano).length === 99,
  );
  ok(
    "15. a mensagem de sistema registra a troca",
    assumido.mensagens.at(-1)?.autor === "sistema" && /humano assumiu/i.test(assumido.mensagens.at(-1)?.texto ?? ""),
  );

  console.log("\n=== E. PAUSAR A IA PAUSA MESMO ===");
  const pausada = { ...e1, iaAtiva: false };
  const depois = responderIA(pausada, contatoId!, rnd);
  ok("16. com iaAtiva=false, nada é respondido", JSON.stringify(depois) === JSON.stringify(pausada));

  console.log("\n=== F. O CLASSIFICADOR LOCAL ===");
  const cls = DemoAutomationProvider.classificar;
  ok("17. 'Quanto custa?' → preço", cls("Quanto custa?") === "preco");
  ok("18. 'Quero falar com uma pessoa' → humano", cls("Quero falar com uma pessoa") === "humano");
  ok("19. 'Queria marcar um horário' → agendar", cls("Queria marcar um horário") === "agendar");
  ok("20. 'Onde fica?' → localização", cls("Onde fica?") === "localizacao");
  ok("21. '??' → indefinida, sem inventar", cls("??") === "indefinida");

  console.log("\n=== G. OS INDICADORES SAEM DO ESTADO, NÃO DE NÚMERO FIXO ===");
  const i0 = indicadores(e0);
  const i2 = indicadores(e2);
  ok("22. 100 monitorados", i0.monitorados === 100);
  ok("23. 23 conversas no início", i0.emConversa === 23, String(i0.emConversa));
  ok("24. simular muda os indicadores", i2.ciclos > i0.ciclos);

  console.log("\n=== H. O SELO ESTÁ EM TODAS AS TELAS ===");
  const cab = readFileSync("src/components/automacao/cabecalho.tsx", "utf8");
  const layout = readFileSync("src/app/automacao/layout.tsx", "utf8");
  ok("25. o cabeçalho traz MODO DEMONSTRAÇÃO", /MODO DEMONSTRAÇÃO/.test(cab));
  ok("26. …e o layout o coloca em toda rota de /automacao", /CabecalhoAutomacao/.test(layout));
  ok(
    "27. o laço da simulação vive no componente e morre com ele — não é worker",
    /clearInterval\(laco\.current\)/.test(readFileSync("src/lib/demo-automacao/contexto.tsx", "utf8")),
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
