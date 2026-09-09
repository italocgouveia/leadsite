import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import type { Lead } from "@/lib/db";
import {
  validarComProcedencia,
  estadoDoNumero,
  FREQUENCIA,
} from "@/lib/telefone-procedencia";
import { canalDoLead, temSiteProprio } from "@/lib/canais";
import { avaliarOportunidadeComercial } from "@/lib/oportunidade-comercial";

/**
 * PROCEDÊNCIA DE TELEFONE E O CANAL SITE.
 *
 * Dois assuntos, os dois vindos de medição:
 *
 *  1. um número pode ser perfeitamente válido e ainda assim não servir — o
 *     piloto da Receita encontrou 571 números dividos por mais de uma empresa,
 *     e um deles servia a 90 CNPJs;
 *  2. site é caminho até um canal, não um canal — quem só tem site não pode
 *     ser abordado hoje e não pode ocupar vaga na lista de prontos.
 *
 * Sem banco, sem rede, sem envio.
 *
 *   npm run test:procedencia
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
const FIXO = "(34) 3232-4545";

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
    statusSite: "nao-verificado",
    dadosOsm: {},
    memoriaComercial: null,
    avaliacoes: null,
    nota: null,
    horarios: null,
    ...o,
  } as unknown as Lead;
}

function main() {
  console.log("\n=== A. O NÚMERO SOZINHO NÃO DIZ TUDO ===");
  const bom = validarComProcedencia(CELULAR, { origem: "cadastro", uf: "MG" });
  ok("1. celular do cadastro é possível WhatsApp", bom.possivelWhatsapp, `confiança ${bom.confianca}`);
  ok("2. …e o tipo e o DDD saem explícitos", bom.tipo === "celular" && bom.ddd === 34);

  const fixo = validarComProcedencia(FIXO, { origem: "cadastro" });
  ok(
    "3. fixo é válido mas NÃO entra na fila de WhatsApp",
    fixo.valido && !fixo.possivelWhatsapp,
    fixo.bloqueios.join(" · "),
  );

  console.log("\n=== B. FREQUÊNCIA: A ASSINATURA DO CONTADOR ===");
  const duas = validarComProcedencia(CELULAR, { origem: "receita", frequencia: 2 });
  const dez = validarComProcedencia(CELULAR, { origem: "receita", frequencia: 10 });
  const muitas = validarComProcedencia(CELULAR, { origem: "receita", frequencia: 90 });

  ok(
    "4. em 2 empresas: passa, mas com aviso e confiança menor",
    duas.possivelWhatsapp && duas.confianca < bom.confianca,
    duas.motivos.join(" · "),
  );
  ok(
    "5. em 10 empresas: derruba a confiança",
    dez.confianca < duas.confianca,
    `${duas.confianca} → ${dez.confianca}`,
  );
  ok(
    "6. em 90 empresas: BLOQUEIA",
    !muitas.possivelWhatsapp && muitas.confianca === 0,
    muitas.bloqueios.join(" · "),
  );
  ok(
    "6b. a escala é a que a operação definiu",
    FREQUENCIA.revisar === 2 && FREQUENCIA.suspeito === 10 && FREQUENCIA.bloquear === 50,
  );

  console.log("\n=== C. PROCEDÊNCIA MUDA A CONFIANÇA ===");
  const daReceita = validarComProcedencia(CELULAR, { origem: "receita" });
  const doSite = validarComProcedencia(CELULAR, { origem: "site-proprio" });
  ok(
    "7. número da Receita vale menos que o publicado pela empresa",
    daReceita.confianca < doSite.confianca,
    `receita ${daReceita.confianca} · site ${doSite.confianca}`,
  );

  const reconstruido = validarComProcedencia(CELULAR, {
    origem: "receita",
    nonoReconstruido: true,
  });
  ok(
    "8. nono dígito reconstruído é marcado e custa confiança",
    reconstruido.nonoDigito === "reconstruido" && reconstruido.confianca < daReceita.confianca,
    `${daReceita.confianca} → ${reconstruido.confianca}`,
  );

  const deOutro = validarComProcedencia(CELULAR, { origem: "receita", jaPertenceA: "outro-lead" });
  ok("9. número que já é de outro lead bloqueia", !deOutro.possivelWhatsapp, deOutro.bloqueios[0]);

  const foraDaUf = validarComProcedencia("(11) 99999-8888", { origem: "receita", uf: "MG" });
  ok(
    "10. DDD que não bate com o endereço custa confiança",
    foraDaUf.motivos.some((m) => /não bate com o endereço/.test(m)),
    foraDaUf.motivos.join(" · "),
  );

  console.log("\n=== D. LIXO DE FORMULÁRIO ===");
  const lixo = validarComProcedencia("(34) 99999-9999", { origem: "receita" });
  ok("11. (34) 99999-9999 é recusado", !lixo.valido, lixo.bloqueios[0]);

  console.log("\n=== E. OS TRÊS ESTADOS CONTINUAM SEPARADOS ===");
  ok("12. celular sem prova é 'possível celular'", estadoDoNumero(bom) === "possivel-celular");
  ok("13. com prova vira 'WhatsApp confirmado'", estadoDoNumero(bom, true) === "whatsapp-confirmado");
  ok("14. fixo é só 'telefone'", estadoDoNumero(fixo) === "telefone");
  ok(
    "15. formato NUNCA promove sozinho a confirmado",
    estadoDoNumero(bom) !== "whatsapp-confirmado",
    "só evidência do sistema confirma conta",
  );

  console.log("\n=== F. SITE É CAMINHO ATÉ UM CANAL, NÃO UM CANAL ===");
  const soSite = lead({ website: "https://oficinadojoao.com.br", statusSite: "tem-site" });
  ok("16. site próprio é reconhecido", temSiteProprio(soSite));
  ok("17. …e vira canal 'site'", canalDoLead(soSite) === "site", canalDoLead(soSite));

  const av = avaliarOportunidadeComercial(soSite);
  ok(
    "18. mas NÃO é oportunidade pronta — não dá para conversar com um site",
    !av.elegivel,
    av.bloqueios.join(" · "),
  );
  ok(
    "19. …e vai para a fila de enriquecimento, não para o descarte",
    av.aguardandoCanal,
    "é uma empresa boa esperando um canal aparecer",
  );

  const instagramNaoEhSite = lead({ website: "https://instagram.com/oficina" });
  ok(
    "20. Instagram na coluna de site NÃO conta como site próprio",
    !temSiteProprio(instagramNaoEhSite),
    "link de rede social já é outro canal",
  );

  const naoVerificado = lead({ website: "https://algo.com.br", statusSite: "nao-verificado" });
  ok(
    "21. site não verificado ainda conta — ausência de auditoria não é prova",
    canalDoLead(naoVerificado) === "site",
    "o que não entra é Instagram/Linktree/iFood, que a auditoria já marca",
  );

  const comWpp = lead({
    telefone: CELULAR,
    whatsapp: CELULAR,
    website: "https://oficinadojoao.com.br",
    statusSite: "tem-site",
  });
  ok(
    "22. quem tem WhatsApp é classificado por ele, não pelo site",
    canalDoLead(comWpp) === "whatsapp",
    "site só decide o canal de quem não tem canal de conversa",
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main();
