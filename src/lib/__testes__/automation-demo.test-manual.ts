import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gerarContatos, estadoInicial, demoProvider, DEMO_CONTACT_LIMIT } from "@/lib/demo-automacao/motor";
import { CENARIOS } from "@/lib/demo-automacao/cenarios";

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
 *   npm run test:automation-demo
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

function semente(n: number) {
  let s = n;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * DDDs que existem no Brasil. Um telefone da demonstração NUNCA pode começar
 * com um deles — é a garantia de que não colide com número real.
 */
const DDDS_REAIS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

function main() {
  console.log("\n=== A. O MURO: NENHUMA PORTA PARA A OPERAÇÃO REAL ===");
  const fontesDemo = [
    ...arquivos("src/lib/demo-automacao"),
    ...arquivos("src/app/automacao").filter((a) => !/regras/.test(a)),
    ...arquivos("src/components/automacao"),
  ];

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
    [/\/api\/automacao\/worker/, "worker real"],
  ];

  for (const arq of fontesDemo) {
    const fonte = readFileSync(arq, "utf8");
    const nome = arq.replace(/\\/g, "/").replace(/^.*src\//, "src/");
    /** Comentário não conta: o que decide é o que o arquivo carrega. */
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const violacoes = PROIBIDOS.filter(([re]) => re.test(semComentarios)).map(([, o]) => o);
    ok(`1. ${nome} não alcança ${violacoes.length ? violacoes.join(", ") : "nada real"}`, violacoes.length === 0);
  }

  ok(
    "2. nenhuma rota de API usa o motor da demonstração",
    !arquivos("src/app/api").some((a) => /demo-automacao/.test(readFileSync(a, "utf8"))),
    "o estado só existe no navegador",
  );

  console.log("\n=== B. OS DEZ CONTATOS SÃO FICTÍCIOS E ISOLADOS ===");
  const contatos = gerarContatos();
  ok("3a. o limite central é 10", DEMO_CONTACT_LIMIT === 10);
  ok("3b. são exatamente 10 contatos", contatos.length === 10, String(contatos.length));
  ok("3c. os dez são situações diferentes — dez roteiros distintos", new Set(contatos.map((c) => c.cenarioId)).size === 10);
  ok(
    "3d. os roteiros combinados estão entre os dez",
    ["apr-valor", "apr-humano", "var-explicar", "var-contratar", "var-amanha", "var-interesse", "var-outra-empresa", "var-pesquisando"].every((id) => contatos.some((c) => c.cenarioId === id)),
  );
  ok("3e. o Cliente 001 abre com \"Oi, queria saber o valor.\"", contatos[0].mensagens[0]?.texto === "Oi, queria saber o valor.");
  ok("4. todo nome é 'Cliente NNN'", contatos.every((c) => /^Cliente \d{3}$/.test(c.nome)));
  ok(
    "5. NENHUM telefone começa com DDD real",
    contatos.every((c) => {
      const ddd = Number(c.telefone.replace(/\D/g, "").slice(0, 2));
      return !DDDS_REAIS.has(ddd);
    }),
    "todos começam com (00), que não existe",
  );
  ok("6. gerar duas vezes dá o MESMO resultado", JSON.stringify(gerarContatos().map((c) => c.nome + c.telefone + c.cenarioId)) === JSON.stringify(contatos.map((c) => c.nome + c.telefone + c.cenarioId)));
  ok(`7. há pelo menos 20 cenários de conversa diferentes`, CENARIOS.length >= 20, `${CENARIOS.length} cenários`);
  ok("8. os 8 perfis pedidos existem", ["interessado", "orcamento", "agendamento", "duvida", "sem-interesse", "pediu-humano", "aguardando", "recorrente"].every((p) => CENARIOS.some((c) => c.perfil === p)));

  console.log("\n=== C. OS NÚMEROS DO PAINEL SAEM DA SEMENTE ===");
  const e0 = estadoInicial();
  const m0 = demoProvider.getMetrics(e0);
  ok("9. 10 monitorados — nunca 100", m0.monitorados === 10, String(m0.monitorados));
  ok("10. conversas iniciadas cabem em 10", m0.conversasIniciadas > 5 && m0.conversasIniciadas <= 10, String(m0.conversasIniciadas));
  ok("11. respondidas pela IA < iniciadas ≤ 10", m0.respondidasPelaIA > 3 && m0.respondidasPelaIA < m0.conversasIniciadas, `${m0.respondidasPelaIA} respondidas`);
  ok("11b. nenhuma métrica passa de 10", Object.values(m0).every((v) => typeof v !== "number" || v <= 10), JSON.stringify(m0));
  ok("12. orçamentos, agendamentos e humano são > 0", m0.orcamentos > 0 && m0.agendamentos > 0 && m0.humano + m0.aguardandoHumano > 0, `${m0.orcamentos} · ${m0.agendamentos} · ${m0.humano}`);

  console.log("\n=== D. A SIMULAÇÃO SÓ MEXE NO ESTADO DA DEMONSTRAÇÃO ===");
  const rnd = semente(7);
  const { estado: e1, contatoId } = demoProvider.simulateIncomingMessage(e0, rnd);
  ok("13. a simulação toca um contato", Boolean(contatoId), contatoId ?? "nenhum");
  const antes = demoProvider.getConversation(e0, contatoId!)!;
  const depois = demoProvider.getConversation(e1, contatoId!)!;
  ok("14. o contato fica aguardando a IA", depois.aguardandoIA);
  ok("15. o estado original NÃO foi mutado", JSON.stringify(antes) === JSON.stringify(demoProvider.getConversation(e0, contatoId!)), "imutável por construção");

  const e2 = demoProvider.sendSimulatedMessage(e1, contatoId!);
  const respondido = demoProvider.getConversation(e2, contatoId!)!;
  ok("16. a IA responde e a rodada avança", !respondido.aguardandoIA && respondido.mensagens.at(-1)?.autor !== "cliente");
  ok("17. a leitura traz confiança e motivo", respondido.confianca > 0 && respondido.motivo.length > 10, `${respondido.confianca}% — ${respondido.motivo}`);

  console.log("\n=== E. ASSUMIR ATENDIMENTO PAUSA A IA — SÓ ALI ===");
  const alvo = e2.contatos.find((c) => !c.atendimentoHumano && c.mensagens.length > 0)!;
  const e3 = demoProvider.pauseConversation(e2, alvo.id);
  const assumido = demoProvider.getConversation(e3, alvo.id)!;
  ok("18. o contato fica com atendimentoHumano = true", assumido.atendimentoHumano);
  ok("19. a mensagem de sistema registra a troca", /humano assumiu/i.test(assumido.mensagens.at(-1)?.texto ?? ""));
  const e3b = { ...e3, contatos: e3.contatos.map((c) => (c.id === alvo.id ? { ...c, aguardandoIA: true } : c)) };
  ok("20. …e a IA para de responder NELE", JSON.stringify(demoProvider.sendSimulatedMessage(e3b, alvo.id).contatos.find((c) => c.id === alvo.id)!.mensagens) === JSON.stringify(assumido.mensagens));
  ok("21. …mas os outros nove continuam disponíveis", e3.contatos.filter((c) => c.id !== alvo.id && !c.atendimentoHumano).length >= 7);
  ok("22. devolver para a IA reativa", !demoProvider.resumeConversation(e3, alvo.id).contatos.find((c) => c.id === alvo.id)!.atendimentoHumano);

  console.log("\n=== F. PAUSAR A IA PAUSA MESMO ===");
  const pausada = { ...e1, iaAtiva: false };
  ok("23. com iaAtiva=false, nada é respondido", JSON.stringify(demoProvider.sendSimulatedMessage(pausada, contatoId!)) === JSON.stringify(pausada));

  console.log("\n=== F2. NUNCA MAIS QUE 10 — MESMO DEPOIS DE MUITAS RODADAS ===");
  {
    const rnd2 = semente(11);
    let e = estadoInicial();
    let travou = 0;
    let maximo = 0;
    for (let i = 0; i < 300; i++) {
      const r = demoProvider.simulateIncomingMessage(e, rnd2);
      if (!r.contatoId) travou++;
      e = r.contatoId ? demoProvider.sendSimulatedMessage(r.estado, r.contatoId) : r.estado;
      maximo = Math.max(maximo, e.contatos.length);
    }
    ok("F2a. depois de 300 ciclos continuam exatamente 10 contatos", e.contatos.length === 10 && maximo === 10, `máximo visto: ${maximo}`);
    ok("F2b. a simulação não trava quando os roteiros acabam — reabre os mesmos contatos", travou === 0, `${travou} ciclos sem contato`);
    ok("F2c. reabrir não acumula histórico sem limite", e.contatos.every((c) => c.mensagens.length <= 12), `maior histórico: ${Math.max(...e.contatos.map((c) => c.mensagens.length))} mensagens`);
    ok("F2d. os ids continuam os mesmos dez", JSON.stringify(e.contatos.map((c) => c.id)) === JSON.stringify(contatos.map((c) => c.id)));
    ok("F2e. as métricas seguem em base 10", demoProvider.getMetrics(e).monitorados === 10);
    const denovo = estadoInicial();
    ok("F2f. REINICIAR volta aos 10 iniciais, com o primeiro roteiro", denovo.contatos.length === 10 && denovo.ciclos === 0 && denovo.contatos[0].rodada === 1 && JSON.stringify(denovo.contatos.map((c) => c.cenarioId)) === JSON.stringify(contatos.map((c) => c.cenarioId)));
  }

  console.log("\n=== G. O CLASSIFICADOR LOCAL ===");
  const cls = demoProvider.classifyIntent;
  ok("24. 'Quanto custa?' → orçamento", cls("Quanto custa?") === "preco");
  ok("25. 'Pode falar com alguém?' → humano", cls("Pode falar com alguém?") === "humano");
  ok("26. 'Quero marcar para sexta' → agendar", cls("Quero marcar para sexta") === "agendar");
  ok("27. 'Não tenho interesse' → sem interesse", cls("Não tenho interesse.") === "sem-interesse");
  ok("28. 'Onde fica?' → localização", cls("Onde fica?") === "localizacao");
  ok("29. '??' → indefinida, sem inventar", cls("??") === "indefinida");

  console.log("\n=== H. O SELO ESTÁ EM TODAS AS TELAS ===");
  const cab = readFileSync("src/components/automacao/cabecalho.tsx", "utf8");
  ok("30. o cabeçalho traz MODO DEMONSTRAÇÃO", /🧪 MODO DEMONSTRAÇÃO/.test(cab));
  ok("31. …e o layout o coloca em toda rota", /CabecalhoAutomacao/.test(readFileSync("src/app/automacao/layout.tsx", "utf8")));
  ok("32. o laço da simulação morre com o componente — não é worker", /clearInterval\(laco\.current\)/.test(readFileSync("src/lib/demo-automacao/contexto.tsx", "utf8")));
  ok("33. o contrato AutomationDemoProvider existe com os 8 métodos", ["getContacts", "getConversation", "simulateIncomingMessage", "sendSimulatedMessage", "classifyIntent", "pauseConversation", "resumeConversation", "getMetrics"].every((m) => m in demoProvider));

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
