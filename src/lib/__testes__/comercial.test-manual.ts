import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import { determinarProximaAcao, type ContextoConversa } from "@/lib/proxima-acao";
import { detectarObjecao, OBJECOES } from "@/lib/objecoes";
import { perguntasDeDiagnostico, lerResposta } from "@/lib/diagnostico";
import { avaliarSistema } from "@/lib/sistemas";

/**
 * Testa a INTELIGÊNCIA COMERCIAL: próxima ação, objeções e diagnóstico.
 *
 * Tudo aqui é função pura sobre dados fictícios — não toca no banco, não chama
 * IA, não gasta cota e não envia nada. Por isso roda em segundos e pode rodar
 * sempre.
 *
 *   npm run test:comercial
 */

let passou = 0;
let falhou = 0;
function ok(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  [PASS] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  } else {
    falhou++;
    console.log(`  [FAIL] ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    nome: "Empresa Fictícia",
    categoria: "car_wash",
    cidade: "Uberlândia",
    etapa: "novo",
    statusSite: "sem-site",
    fotos: [],
    naoContatar: false,
    nota: null,
    avaliacoes: null,
    website: null,
    instagram: null,
    ...over,
  } as unknown as Lead;
}

const vazio: ContextoConversa = { respondeu: false };
const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function main() {
  console.log("\n=== A. PRÓXIMA MELHOR AÇÃO ===");

  const naoAbordado = determinarProximaAcao(lead(), vazio);
  ok("1. lead não abordado → abordar", naoAbordado.tipo === "abordar", naoAbordado.titulo);

  const recemEnviado = determinarProximaAcao(lead(), {
    respondeu: false,
    ultimaEnviadaEm: dias(1),
  });
  ok("2. enviado ontem → aguardar (não cobrar cedo)", recemEnviado.tipo === "aguardar", recemEnviado.motivo);

  const silencio = determinarProximaAcao(lead(), { respondeu: false, ultimaEnviadaEm: dias(6) });
  ok("3. 6 dias sem resposta → follow-up", silencio.tipo === "follow-up", silencio.titulo);
  ok("4. follow-up vem com pergunta pronta", Boolean(silencio.pergunta), silencio.pergunta ?? "");

  const interessado = determinarProximaAcao(lead({ etapa: "respondeu" }), {
    respondeu: true,
    intencao: "interessado",
    ultimaRecebidaEm: dias(0),
  });
  ok(
    "5. respondeu interessado → DIAGNOSTICAR, não empurrar pitch",
    interessado.tipo === "diagnosticar",
    interessado.titulo,
  );
  ok(
    "6. a pergunta de diagnóstico é do ramo do lead",
    interessado.pergunta === perguntasDeDiagnostico(lead())[0],
    interessado.pergunta ?? "",
  );

  const pediuOrcamento = determinarProximaAcao(lead({ etapa: "respondeu" }), {
    respondeu: true,
    intencao: "orcamento",
  });
  ok("7. pediu orçamento → propor", pediuOrcamento.tipo === "propor", pediuOrcamento.titulo);
  ok("8. urgência alta quando pede orçamento", pediuOrcamento.urgencia === "alta");

  const querAgendar = determinarProximaAcao(lead({ etapa: "respondeu" }), {
    respondeu: true,
    intencao: "agendamento",
  });
  ok("9. quer agendar → agendar", querAgendar.tipo === "agendar", querAgendar.titulo);

  const falarDepois = determinarProximaAcao(lead({ etapa: "respondeu" }), {
    respondeu: true,
    intencao: "depois",
  });
  ok("10. 'fala depois' → follow-up, não insistir", falarDepois.tipo === "follow-up", falarDepois.motivo);

  const comObjecao = determinarProximaAcao(lead({ etapa: "respondeu" }), {
    respondeu: true,
    intencao: "orcamento",
    objecao: { id: "preco", nome: "Preço", pergunta: "Quantas vezes por semana?" },
  });
  ok(
    "11. objeção VENCE a intenção (vem antes de propor)",
    comObjecao.tipo === "tratar-objecao",
    `${comObjecao.titulo} (intenção era orçamento)`,
  );

  const diagnosticado = determinarProximaAcao(lead({ etapa: "interessado" }), {
    respondeu: true,
    intencao: "interessado",
    diagnosticoRespondido: 3,
  });
  ok("12. 3 respostas de diagnóstico → já dá para propor", diagnosticado.tipo === "propor");

  const comProposta = determinarProximaAcao(lead({ etapa: "proposta" }), {
    respondeu: true,
    temProposta: true,
    ultimaEnviadaEm: dias(4),
  });
  ok("13. proposta parada 4 dias → negociar/cobrar retorno", comProposta.tipo === "negociar");
  ok("14. urgência sobe com proposta parada", comProposta.urgencia === "alta");

  const optOut = determinarProximaAcao(lead({ naoContatar: true }), vazio);
  ok("15. opt-out → encerrar", optOut.tipo === "encerrar");

  const fechado = determinarProximaAcao(lead({ etapa: "fechado" }), { respondeu: true });
  ok("16. fechado → registrar setup e mensalidade", fechado.tipo === "fechar-ganho", fechado.titulo);

  const reuniao = determinarProximaAcao(lead({ etapa: "reuniao" }), { respondeu: true });
  ok("17. reunião marcada → preparar demonstração", reuniao.tipo === "demonstrar");

  const tipos = new Set(
    [naoAbordado, recemEnviado, silencio, interessado, pediuOrcamento, querAgendar, comObjecao, comProposta, fechado].map(
      (a) => a.tipo,
    ),
  );
  ok("18. a recomendação NÃO é sempre a mesma", tipos.size >= 7, `${tipos.size} tipos diferentes`);
  ok(
    "19. toda ação explica o motivo",
    [naoAbordado, silencio, interessado, comProposta].every((a) => a.motivo.length > 15),
  );

  console.log("\n=== B. OBJEÇÕES ===");
  const CASOS: [string, string][] = [
    ["Está caro demais pra gente agora", "preco"],
    ["quanto custa?", "preco"],
    ["Já tenho um sistema aqui", "ja-tem-sistema"],
    ["a gente já faz tudo pelo whats", "faz-pelo-whatsapp"],
    ["não precisamos disso", "nao-precisa"],
    ["não tenho interesse", "nao-precisa"],
    ["me manda uma apresentação", "manda-apresentacao"],
    ["vou pensar e te falo", "vou-pensar"],
    ["agora não é o momento", "agora-nao"],
    ["já tenho alguém que faz isso", "ja-tem-alguem"],
  ];
  for (const [frase, esperado] of CASOS) {
    const o = detectarObjecao(frase);
    ok(`20. "${frase}" → ${esperado}`, o?.id === esperado, o?.id ?? "não detectou");
  }

  ok("21. mensagem neutra NÃO vira objeção", detectarObjecao("bom dia, tudo bem?") === null);
  ok("22. mensagem vazia não quebra", detectarObjecao("  ") === null);
  ok(
    "23. toda objeção tem estratégia, pergunta e resposta",
    OBJECOES.every((o) => o.estratégia.length > 20 && o.pergunta.length > 5 && o.resposta.length > 20),
    `${OBJECOES.length} objeções`,
  );
  ok(
    "24. nenhuma resposta ataca o que o cliente já usa",
    !OBJECOES.some((o) => /\b(errado|ruim|p[ée]ssimo|ultrapassado|besteira)\b/i.test(o.resposta)),
  );

  console.log("\n=== C. DIAGNÓSTICO ===");
  const NICHOS: [string, string, string][] = [
    ["oficina", "car_repair", "ordens de serviço"],
    ["lava-jato", "car_wash", "clientes"],
    ["pet shop", "pet", "ficha do pet"],
    ["pousada", "guest_house", "reservas"],
    ["imobiliária", "estate_agent", "imóveis"],
    ["dentista", "dentist", "agenda"],
  ];
  for (const [rotulo, cat, esperaTrecho] of NICHOS) {
    const ps = perguntasDeDiagnostico(lead({ categoria: cat }));
    const bate = ps.some((p) => p.toLowerCase().includes(esperaTrecho.toLowerCase()));
    ok(`25. perguntas de ${rotulo} citam "${esperaTrecho}"`, ps.length >= 3 && bate, `${ps.length} perguntas`);
  }

  const semPerfil = perguntasDeDiagnostico(lead({ categoria: "loja_qualquer_sem_perfil" }));
  ok(
    "26. ramo sem perfil recebe pergunta genérica (não inventa)",
    semPerfil.length === 1 && !avaliarSistema(lead({ categoria: "loja_qualquer_sem_perfil" })).serve,
    semPerfil[0],
  );

  const lavaJato = perguntasDeDiagnostico(lead({ categoria: "car_wash" }));
  ok(
    "27. as perguntas vêm dos MÓDULOS do catálogo",
    lavaJato.length === avaliarSistema(lead({ categoria: "car_wash" })).modulos.length,
    `${lavaJato.length} perguntas para ${avaliarSistema(lead({ categoria: "car_wash" })).modulos.length} módulos`,
  );

  console.log("\n=== D. LEITURA DA RESPOSTA (hipótese → dor confirmada) ===");
  const planilha = lerResposta("a gente usa uma planilha mesmo");
  ok("28. 'planilha' confirma dor", planilha.confirmaDor && planilha.sinal === "manual", planilha.insight);
  const caderno = lerResposta("anotamos no caderno");
  ok("29. 'caderno' confirma dor", caderno.confirmaDor);
  const temSistema = lerResposta("temos um sistema da empresa X");
  ok(
    "30. 'temos sistema' NÃO confirma dor",
    !temSistema.confirmaDor && temSistema.sinal === "ja-tem-sistema",
    temSistema.insight,
  );
  const vago = lerResposta("mais ou menos");
  ok("31. resposta vaga não confirma dor (não força)", !vago.confirmaDor, vago.insight);
  ok("32. resposta vazia não quebra", !lerResposta(" ").confirmaDor);

  console.log(`\n${passou} PASS, ${falhou} FAIL.`);
  process.exit(falhou ? 1 : 0);
}

main();
