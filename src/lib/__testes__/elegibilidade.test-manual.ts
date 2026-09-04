import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import { avaliarContato, type Config, type HistoricoLead } from "@/lib/fila";
import { validarTelefone, variantesTelefoneBR } from "@/lib/telefone";

/**
 * Elegibilidade para ENTRAR numa campanha nova.
 *
 * Duas regras que este arquivo protege, e que são diferentes entre si:
 *
 *  - telefone claramente FIXO não entra (mas isso NÃO afirma que celular tem
 *    WhatsApp — formato não prova conta);
 *  - lead com mensagem viva em QUALQUER campanha não entra em outra.
 *
 * E uma distinção que precisa continuar valendo: rascunho bloqueia campanha
 * nova, mas nunca bloqueia o ENVIO de uma mensagem já aprovada.
 *
 * Sem banco, sem IA, sem envio.
 *
 *   npm run test:elegibilidade
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

const cfg = { janelaRecontatoDias: 30 } as Config;

function lead(o: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    nome: "Empresa Teste",
    categoria: "car_repair",
    cidade: "Uberlândia",
    etapa: "novo",
    naoContatar: false,
    whatsapp: "https://wa.me/5534991345424", // celular
    telefone: null,
    ...o,
  } as unknown as Lead;
}

const nova = { paraNovaCampanha: true };

function main() {
  console.log("\n=== A. TELEFONE (reusa lib/telefone, sem lógica nova) ===");
  ok(
    "1. celular brasileiro NÃO é rejeitado como fixo",
    validarTelefone("34991345424")?.tipo === "celular",
    validarTelefone("34991345424")?.formatado ?? "",
  );
  ok(
    "2. telefone fixo é reconhecido como fixo",
    validarTelefone("1130312500")?.tipo === "fixo",
    validarTelefone("1130312500")?.formatado ?? "",
  );
  ok("3. número inválido devolve null", validarTelefone("123") === null);
  ok("4. sem telefone devolve null", validarTelefone(null) === null);
  ok(
    "5. DDD inexistente é rejeitado",
    validarTelefone("00991345424") === null,
    "DDD 00",
  );
  ok(
    "6. nono dígito continua funcionando (variantes)",
    variantesTelefoneBR("5534991345424").length === 2,
    variantesTelefoneBR("5534991345424").join(" / "),
  );
  ok(
    "7. fixo NÃO ganha variante de nono dígito",
    variantesTelefoneBR("551130312500").length === 1,
    "fixo não tem 'nono dígito'",
  );

  console.log("\n=== B. FIXO NÃO ENTRA EM CAMPANHA NOVA ===");
  const fixo = lead({ whatsapp: "https://wa.me/551130312500" });
  const rFixo = avaliarContato(fixo, cfg, [], nova);
  ok("8. fixo é excluído da campanha", !rFixo.pode, rFixo.pode ? "" : rFixo.motivo);
  ok("9. o motivo é específico", !rFixo.pode && rFixo.motivo === "Telefone fixo.");

  const celular = lead();
  ok("10. celular entra normalmente", avaliarContato(celular, cfg, [], nova).pode);

  /**
   * A regra é sobre ENTRADA. O envio de uma mensagem que já existe continua
   * decidido pela Bridge — mudar isso mudaria o comportamento de mensagens já
   * aprovadas, que não é o que esta correção se propõe.
   */
  ok(
    "11. fora de campanha nova, fixo NÃO é bloqueado (a Bridge decide)",
    avaliarContato(fixo, cfg, []).pode,
    "formato não prova ausência de WhatsApp Business",
  );

  console.log("\n=== C. FORMATO NÃO PROVA WHATSAPP ===");
  ok(
    "12. celular válido não é declarado 'tem WhatsApp' em lugar nenhum",
    validarTelefone("34991345424")?.tipo === "celular" &&
      !JSON.stringify(validarTelefone("34991345424")).includes("whatsapp"),
    "validarTelefone devolve só e164/formatado/tipo",
  );

  console.log("\n=== D. DUPLICIDADE ENTRE CAMPANHAS ===");
  const aprovadaEmOutra: HistoricoLead = [
    { id: "m-outra", status: "aprovada", enviadaEm: null },
  ];
  const rDup = avaliarContato(lead(), cfg, aprovadaEmOutra, nova);
  ok("13. mensagem aprovada existente bloqueia campanha nova", !rDup.pode, rDup.pode ? "" : rDup.motivo);

  const naFila: HistoricoLead = [{ id: "m2", status: "na-fila", enviadaEm: null }];
  ok("14. mensagem na fila também bloqueia", !avaliarContato(lead(), cfg, naFila, nova).pode);

  const rascunho: HistoricoLead = [{ id: "m3", status: "rascunho", enviadaEm: null }];
  const rRasc = avaliarContato(lead(), cfg, rascunho, nova);
  ok(
    "15. RASCUNHO pendente bloqueia campanha nova",
    !rRasc.pode && rRasc.motivo === "Já tem mensagem aguardando revisão.",
    rRasc.pode ? "" : rRasc.motivo,
  );
  ok(
    "16. mas rascunho NÃO bloqueia o envio de outra já aprovada",
    avaliarContato(lead(), cfg, rascunho).pode,
    "senão um rascunho solto travaria a fila inteira",
  );

  console.log("\n=== E. ESTADOS TERMINAIS NÃO BLOQUEIAM INDEVIDAMENTE ===");
  const antiga = new Date(Date.now() - 90 * 86_400_000);
  const enviadaVelha: HistoricoLead = [{ id: "m4", status: "enviada", enviadaEm: antiga }];
  ok(
    "17. enviada há 90 dias (fora da janela) libera novo contato",
    avaliarContato(lead(), cfg, enviadaVelha, nova).pode,
    "janela de 30 dias",
  );
  const cancelada: HistoricoLead = [{ id: "m5", status: "cancelada", enviadaEm: null }];
  ok("18. mensagem cancelada não bloqueia", avaliarContato(lead(), cfg, cancelada, nova).pode);
  const erro: HistoricoLead = [{ id: "m6", status: "erro", enviadaEm: null }];
  ok("19. mensagem com erro não bloqueia", avaliarContato(lead(), cfg, erro, nova).pode);

  console.log("\n=== F. RECONTATO CONTINUA SENDO REGRA SEPARADA ===");
  const recente: HistoricoLead = [
    { id: "m7", status: "enviada", enviadaEm: new Date(Date.now() - 5 * 86_400_000) },
  ];
  const rRec = avaliarContato(lead(), cfg, recente, nova);
  ok(
    "20. contatado há 5 dias é bloqueado pelo recontato",
    !rRec.pode && /contatado/i.test(rRec.motivo),
    rRec.pode ? "" : rRec.motivo,
  );
  ok(
    "21. recontato e duplicidade são motivos diferentes",
    (() => {
      const a = avaliarContato(lead(), cfg, recente, nova);
      const b = avaliarContato(lead(), cfg, aprovadaEmOutra, nova);
      return !a.pode && !b.pode && a.motivo !== b.motivo;
    })(),
  );

  console.log("\n=== G. AS OUTRAS TRAVAS CONTINUAM ===");
  ok(
    "22. opt-out bloqueia",
    !avaliarContato(lead({ naoContatar: true }), cfg, [], nova).pode,
  );
  ok(
    "23. lead sem WhatsApp bloqueia",
    !avaliarContato(lead({ whatsapp: null }), cfg, [], nova).pode,
  );
  const respondeu: HistoricoLead = [{ id: "m8", status: "respondida", enviadaEm: antiga }];
  ok(
    "24. quem respondeu sai da automação",
    !avaliarContato(lead(), cfg, respondeu, nova).pode,
  );

  console.log("\n=== H. A MENSAGEM AVALIADA NÃO CONTA CONTRA ELA MESMA ===");
  const propria: HistoricoLead = [{ id: "minha", status: "aprovada", enviadaEm: null }];
  ok(
    "25. ignorarMensagemId evita a fila travar em si mesma",
    avaliarContato(lead(), cfg, propria, { ignorarMensagemId: "minha" }).pode,
  );
  ok(
    "26. assinatura antiga (id como 4º argumento) continua funcionando",
    avaliarContato(lead(), cfg, propria, "minha").pode,
    "compatibilidade preservada",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
