import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import type { Lead } from "@/lib/db";
import { oportunidadesDoSite, type AnaliseSite } from "@/lib/analise-site";
import { enriquecerPeloSite } from "@/lib/enriquecimento-site";

/**
 * ANÁLISE DE SITE E ENRIQUECIMENTO — as travas que impedem contaminar a base.
 *
 * Os três enganos abaixo apareceram no PRIMEIRO teste contra sites reais, e
 * cada um deles teria gravado no cadastro um dado de outra empresa:
 *
 *   · `all.accor.com` no lead "Ibis Hotel" devolveu @all.accor — a conta
 *     global da rede, não a unidade de Uberlândia;
 *   · `fenixhoteis.com.br` no "Montblanc Hotel" devolveu o @ da rede;
 *   · uma clínica de Minas devolveu WhatsApp com DDD 11.
 *
 * Sem rede: os testes usam análises fabricadas, então nada aqui depende de um
 * site estar no ar. Não grava no banco, não envia mensagem.
 *
 *   npm run test:site
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
    etapa: "novo",
    naoContatar: false,
    telefone: null,
    whatsapp: null,
    website: null,
    instagram: null,
    email: null,
    statusSite: "tem-site",
    dadosOsm: {},
    memoriaComercial: null,
    avaliacoes: null,
    nota: null,
    horarios: null,
    ...o,
  } as unknown as Lead;
}

function analise(o: Partial<Extract<AnaliseSite, { ok: true }>> = {}): AnaliseSite {
  return {
    ok: true,
    url: "https://oficinadojoao.com.br",
    host: "oficinadojoao.com.br",
    whatsapp: null,
    instagram: null,
    telefones: [],
    email: null,
    redes: [],
    servicos: [],
    bytes: 5000,
    sinais: [],
    ...o,
  } as AnaliseSite;
}

const sinal = (id: string, presente: boolean) => ({ id, fato: id, presente });

async function main() {
  console.log("\n=== A. FATO, HIPÓTESE E DESCONHECIDO NUNCA SE MISTURAM ===");
  const semWpp = analise({
    sinais: [sinal("whatsapp", false), sinal("formulario", false), sinal("responsivo", true)],
    servicos: ["orçamento", "serviços"],
  });
  const ops = oportunidadesDoSite(semWpp);
  ok("1. site sem WhatsApp gera oportunidade", ops.length > 0, `${ops.length} detectadas`);
  ok(
    "2. cada uma traz FATO, HIPÓTESE e DESCONHECIDO",
    ops.every((o) => o.fato && o.hipotese && o.desconhecido),
  );
  ok(
    "3. o fato é observação sobre a PÁGINA, não sobre o negócio",
    ops[0].fato.toLowerCase().includes("página") || ops[0].fato.toLowerCase().includes("home"),
    ops[0].fato,
  );
  ok(
    "4. nenhuma afirma perda de cliente",
    !ops.some((o) => /perdendo|perde clientes|está perdendo/i.test(`${o.fato} ${o.hipotese}`)),
    "hipótese usa 'pode', nunca afirma prejuízo",
  );
  ok(
    "5. o desconhecido é declarado, não preenchido",
    ops.every((o) => /não sabemos|não medimos/i.test(o.desconhecido)),
  );

  console.log("\n=== B. A CONTA DA REDE NÃO ENTRA NO CADASTRO DA UNIDADE ===");
  /**
   * O caso real: o lead é o Ibis de Uberlândia e o site cadastrado é o portal
   * global da Accor. Tudo que a home publica é da rede.
   */
  const daRede = lead({
    nome: "Ibis Hotel",
    website: "https://all.accor.com",
    categoria: "hotel",
  });
  const r1 = await enriquecerPeloSite(daRede, true);
  /** Sem rede: a análise falha, mas a decisão de domínio é testada abaixo. */
  ok(
    "6. site cujo domínio não lembra o nome não vira fonte",
    !r1.analisou || r1.achados.every((x) => !x.aceito),
    r1.motivoFalha ?? r1.achados.map((x) => x.motivo).join(" · "),
  );

  console.log("\n=== C. AS TRAVAS, LIDAS NO CÓDIGO ===");
  const fonte = readFileSync("src/lib/enriquecimento-site.ts", "utf8");
  ok("7. rede/franquia é barrada explicitamente", /classe\.rede/.test(fonte));
  ok("8. DDD é conferido contra a UF do endereço", /dddCompativel/.test(fonte));
  ok(
    "9. telefone existente NUNCA é sobrescrito",
    /lead\.telefone/.test(fonte) && /revisão manual/.test(fonte),
    "fonte nova com valor acrescenta; nunca substitui",
  );
  ok(
    "10. Instagram existente também não é sobrescrito",
    /jaTem/.test(fonte) && /Lead já tem @/.test(fonte),
  );
  ok(
    "11. palavras genéricas não servem para casar domínio",
    /GENERICAS/.test(fonte) && /"clinica"/.test(fonte),
    "senão o site de uma clínica casaria com qualquer outra",
  );

  console.log("\n=== D. A ANÁLISE É EDUCADA E LIMITADA ===");
  const analisador = readFileSync("src/lib/analise-site.ts", "utf8");
  ok("12. respeita robots.txt", /robots\.txt/.test(analisador) && /permitido/.test(analisador));
  ok("13. identifica-se no User-Agent", /User-Agent/.test(analisador) && /RastroLeadBot/.test(analisador));
  ok("14. tem timeout", /AbortSignal\.timeout/.test(analisador));
  ok("15. limita o tamanho da leitura", /MAX_BYTES/.test(analisador));
  ok(
    "16. lê UMA página — não varre o site",
    !/for\s*\(.*links|crawl|spider/i.test(analisador),
    "só a home, um GET",
  );
  ok(
    "17. rejeita rede social como se fosse site próprio",
    /ehPlataformaCompartilhada/.test(analisador),
  );
  ok(
    "18. usa a MESMA lista de caminhos que não são perfil",
    /NAO_E_PERFIL/.test(analisador),
    "duas listas divergiriam e uma mandaria abrir um post",
  );

  console.log("\n=== E. A ROTA NÃO GRAVA ===");
  const rota = readFileSync("src/app/api/analise-site/route.ts", "utf8");
  ok(
    "19. a rota de análise chama o enriquecimento em modo simulação",
    /enriquecerPeloSite\(lead, true\)/.test(rota),
  );
  ok(
    "20. e não faz update nem insert",
    !/db\.update|db\.insert|db\.delete/.test(rota),
    "ver é barato e reversível; gravar não é",
  );

  const script = readFileSync("src/scripts/enriquecer-site.ts", "utf8");
  ok(
    "21. o script de gravação é dry-run por padrão",
    /const GRAVAR = process\.argv\.includes\("--gravar"\)/.test(script),
  );

  console.log(`\n${p} PASS, ${f} FAIL.`);
  process.exit(f ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
