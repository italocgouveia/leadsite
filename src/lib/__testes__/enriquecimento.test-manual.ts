import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import {
  precisaEnriquecer,
  qualidadePotencial,
  motivoDaGaveta,
  estadoDoContato,
  whatsappConfirmado,
} from "@/lib/enriquecimento";
import { fonteCadastro } from "@/lib/enriquecimento-fila";
import { validarTelefone, dddCompativel } from "@/lib/telefone";
import { ehPlataformaCompartilhada } from "@/lib/places/audit";
import { readFileSync } from "node:fs";

/**
 * A fila de enriquecimento: quem vale a pena caçar o telefone.
 *
 * O teste que define o arquivo é o do bloco A: uma oficina pequena SEM
 * telefone tem de entrar com prioridade alta. Isso só funciona porque a
 * prioridade usa a qualidade POTENCIAL — pela gaveta real ela seria D (sem
 * contato) e a fila nasceria vazia. Se alguém trocar isso por
 * `prioridadeComercial`, o bloco A quebra na hora.
 *
 * Sem banco, sem fonte externa, sem envio.
 *
 *   npm run test:enriquecimento
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

const CELULAR = "(34) 99134-5424";
const FIXO = "(34) 3212-4000";

function main() {
  console.log("\n=== A. QUEM ENTRA NA FILA ===");
  const oficinaSemTel = lead({ nome: "Oficina do João", instagram: "https://i" });
  const e1 = precisaEnriquecer(oficinaSemTel);
  ok("1. oficina pequena sem telefone → ALTA prioridade", e1.precisa && e1.prioridade === "alta", e1.motivo);
  ok("1b. e o motivo explica o que falta", /sem telefone/i.test(e1.motivo), e1.motivo);
  ok("1c. escalão 1 (A + potencial forte)", e1.ordem === 1, String(e1.ordem));

  const clinicaSemTel = lead({ nome: "Clínica Vida", categoria: "clinic", instagram: "https://i" });
  const e2 = precisaEnriquecer(clinicaSemTel);
  ok("2. clínica pequena sem telefone → ALTA prioridade", e2.precisa && e2.prioridade === "alta", e2.motivo);

  /**
   * A prova de que a prioridade NÃO usa a gaveta real: pela gaveta o lead é D
   * (sem contato), e mesmo assim ele entra na fila como potencial A.
   */
  ok(
    "3. o lead é D na gaveta real mas A na qualidade potencial",
    qualidadePotencial(oficinaSemTel) === "A",
    `potencial ${qualidadePotencial(oficinaSemTel)}`,
  );

  console.log("\n=== B. QUEM NÃO ENTRA ===");
  const comCelular = lead({ telefone: CELULAR, whatsapp: "https://wa.me/5534991345424" });
  ok(
    "4. A COM telefone não precisa enriquecer",
    !precisaEnriquecer(comCelular).precisa,
    precisaEnriquecer(comCelular).motivo,
  );

  /**
   * Fixo é contato existente: a fila não procura um segundo número. O que
   * falta nele é CONFIRMAR WhatsApp, que é outro problema.
   */
  const comFixo = lead({ telefone: FIXO });
  const eFixo = precisaEnriquecer(comFixo);
  ok("5. telefone fixo não entra na fila", !eFixo.precisa);
  ok(
    "5b. e o motivo aponta a validação de WhatsApp, não a busca de número",
    /confirmar whatsapp/i.test(eFixo.motivo),
    eFixo.motivo,
  );

  const semSistema = lead({ nome: "Empresa Genérica", categoria: "zzz", instagram: "https://i" });
  const eSem = precisaEnriquecer(semSistema);
  ok("6. lead sem potencial de sistema não entra", !eSem.precisa, eSem.motivo);

  const grande = lead({ nome: "Hospital Municipal", categoria: "hospital" });
  ok("7. empresa grande não é priorizada", !precisaEnriquecer(grande).precisa, precisaEnriquecer(grande).motivo);

  const franquia = lead({ nome: "Cacau Show Centro", categoria: "confectionery" });
  ok("8. franquia não é priorizada", !precisaEnriquecer(franquia).precisa, precisaEnriquecer(franquia).motivo);

  ok(
    "9. opt-out nunca entra",
    !precisaEnriquecer(lead({ naoContatar: true })).precisa,
  );
  ok(
    "9b. lead já encerrado nunca entra",
    !precisaEnriquecer(lead({ etapa: "sem-interesse" })).precisa,
  );

  /**
   * C/D sem telefone: a instrução foi "não gastar esforço em C/D". Um ramo sem
   * encaixe fica de fora mesmo sem telefone.
   */
  const c = precisaEnriquecer(semSistema);
  ok(
    "10. C/D sem telefone → não enriquecer (ou baixa)",
    !c.precisa || c.prioridade === "baixa",
    c.motivo,
  );

  console.log("\n=== C. OS QUATRO ESCALÕES ===");
  /**
   * ATENÇÃO À AMBIGUIDADE: "A/B/C" aparece em DUAS escalas diferentes.
   *
   *   prioridade do RAMO   (nichos-locais)  — oficina é A, bar é B, roupas é C
   *   gaveta do LEAD       (pontuacao)      — A/B/C/D, qualidade do lead
   *
   * O escalão da fila usa a GAVETA. Um bar (ramo B) com todos os sinais chega
   * à gaveta A — e está certo, porque a gaveta mede o lead, não o ramo.
   *
   * Para exercitar o escalão 2 é preciso um lead cuja GAVETA seja B: loja de
   * roupas é ramo C, o que bloqueia a gaveta A, e tem 5 módulos (estoque,
   * catálogo, clientes, pedidos, financeiro), o que a torna potencial forte.
   */
  const lojaSemTel = lead({ nome: "Loja Bela", categoria: "clothes", instagram: "https://i" });
  const eLoja = precisaEnriquecer(lojaSemTel);
  ok(
    "11. gaveta B + potencial forte = escalão 2, prioridade alta",
    eLoja.precisa && eLoja.ordem === 2 && eLoja.prioridade === "alta",
    `ordem ${eLoja.ordem}, ${eLoja.prioridade} · potencial ${eLoja.qualidadePotencial}`,
  );
  ok(
    "11b. A + forte vem ANTES de B + forte",
    (e1.ordem ?? 9) < (eLoja.ordem ?? 9),
    `${e1.ordem} < ${eLoja.ordem}`,
  );

  console.log("\n=== D. TELEFONE ENCONTRADO: VALIDAÇÃO ===");
  ok(
    "12. telefone inválido não é aceito",
    validarTelefone("123") === null && validarTelefone("00 0000-0000") === null,
  );
  ok(
    "12b. celular válido é aceito e normalizado",
    validarTelefone("5534991345424")?.formatado === CELULAR,
    validarTelefone("5534991345424")?.formatado ?? "",
  );

  /** A fonte mais barata: o número que já estava no cadastro do mapa. */
  ok(
    "13. fonte do cadastro acha telefone em dadosOsm",
    fonteCadastro(lead({ dadosOsm: { "contact:phone": "+55 34 99134-5424" } }))?.telefone === CELULAR,
  );
  ok(
    "13b. e ignora tag que não é telefone",
    fonteCadastro(lead({ dadosOsm: { cuisine: "pizza", brand: "X" } })) === null,
  );
  ok(
    "13c. e recusa número inválido mesmo vindo do mapa",
    fonteCadastro(lead({ dadosOsm: { phone: "não informado" } })) === null,
  );

  console.log("\n=== D2. O NÚMERO PRECISA SER DA EMPRESA ===");
  /**
   * As duas travas que a raspagem real exigiu. Medido nos 17 leads da base que
   * têm site: sem elas entravam número de outra empresa em 4 dos 7 achados.
   */
  ok(
    "17. DDD de outro estado é recusado",
    !dddCompativel("(11) 5753-4303", "MG") && !dddCompativel("(17) 2176-3190", "MG"),
    "DDD 11 e 17 não existem em Minas",
  );
  ok(
    "17b. DDD do estado do lead é aceito",
    dddCompativel("(34) 3257-9900", "MG") && dddCompativel("(31) 3333-4444", "MG"),
  );
  ok(
    "17c. sem UF para comparar, não reprova — falta de dado não é prova",
    dddCompativel("(11) 5753-4303", null),
  );
  ok(
    "18. página de plataforma compartilhada não é 'site próprio'",
    ehPlataformaCompartilhada("https://facebook.com/casadosalgado") &&
      ehPlataformaCompartilhada("https://instagram.com/x") &&
      ehPlataformaCompartilhada("https://keepo.io/12TribosPizzaria"),
    "foi assim que duas empresas ganharam o mesmo telefone",
  );
  ok(
    "18b. domínio próprio continua valendo",
    !ehPlataformaCompartilhada("https://cajuba.org.br/"),
  );

  console.log("\n=== E. WHATSAPP: FORMATO NÃO É PROVA ===");
  ok(
    "14. celular é 'possível celular', NUNCA 'confirmado'",
    estadoDoContato(comCelular, false) === "possivel-celular",
  );
  ok(
    "14b. só vira confirmado com envio ou resposta",
    estadoDoContato(comCelular, true) === "confirmado" &&
      whatsappConfirmado({ enviouComSucesso: true, recebeuResposta: false }) &&
      whatsappConfirmado({ enviouComSucesso: false, recebeuResposta: true }) &&
      !whatsappConfirmado({ enviouComSucesso: false, recebeuResposta: false }),
  );
  ok("14c. fixo é 'telefone', não celular", estadoDoContato(comFixo, false) === "telefone");
  ok(
    "14d. sem número é 'precisa telefone'",
    estadoDoContato(oficinaSemTel, false) === "sem-contato",
  );

  console.log("\n=== F. POR QUE OS D ===");
  const casos: [string, Lead, string][] = [
    ["sem telefone nem Instagram", lead({}), "sem-telefone"],
    ["opt-out", lead({ naoContatar: true }), "opt-out"],
    ["já encerrado", lead({ etapa: "sem-interesse" }), "ja-trabalhado"],
    ["rede", lead({ nome: "Cacau Show Centro", categoria: "confectionery" }), "rede-ou-grande"],
    ["ramo grande", lead({ nome: "Hospital X", categoria: "hospital" }), "rede-ou-grande"],
    [
      "sem encaixe de sistema",
      lead({ nome: "Empresa X", categoria: "zzz", telefone: CELULAR }),
      "sem-potencial-sistema",
    ],
  ];
  for (const [rot, l, esperado] of casos) {
    const m = motivoDaGaveta(l);
    ok(`15. motivo de D — ${rot}`, m === esperado, m);
  }
  ok(
    "15b. duplicata é motivo quando o contexto informa",
    motivoDaGaveta(lead({ telefone: CELULAR }), { possivelDuplicata: true }) === "duplicado",
  );

  console.log("\n=== G. A FILA NÃO ENVIA NADA ===");
  /**
   * Garantia estrutural: o módulo da fila não importa `lib/fila` nem
   * `lib/providers`, que são os únicos caminhos de saída de mensagem.
   */
  const fonte = readFileSync("src/lib/enriquecimento-fila.ts", "utf8");
  ok(
    "16. o módulo da fila não importa nada que envie",
    !/from "@\/lib\/(fila|providers|bridge)"/.test(fonte),
    "sem import de envio",
  );
  /**
   * Procura USO da tabela, não a palavra: o cabeçalho do arquivo fala de "fila
   * de mensagens" justamente para explicar de que ela se separa, e casar com
   * isso transformaria a documentação correta em falha de teste.
   */
  ok(
    "16b. e não lê nem escreve na tabela de mensagens",
    !/(from|insert|update|delete)\(\s*mensagens/.test(fonte) &&
      !/import \{[^}]*\bmensagens\b[^}]*\} from "@\/lib\/db"/.test(fonte),
    "a tabela mensagens nunca é tocada",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
