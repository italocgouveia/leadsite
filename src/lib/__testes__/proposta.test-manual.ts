import { MARCA_SAUDACAO, resolverSaudacao } from "@/lib/saudacao";
const MANHA = new Date("2026-08-25T09:00:00-03:00");
import { montarProposta } from "../proposta";
import type { Lead } from "@/lib/db/schema";

/**
 * Prova que a mensagem muda de verdade por ramo e por situação.
 * Rode com: npm run test:proposta
 */

function lead(p: Partial<Lead>): Lead {
  // O `...p` no fim é o que aplica as diferenças de cada caso. Sem ele, todos
  // os testes rodavam com o lead padrão e passavam sem testar nada.
  return {
    id: "x",
    placeId: "osm:1",
    nome: "Negócio",
    categoria: null,
    endereco: null,
    cidade: "Uberlândia",
    estado: "MG",
    bairro: null,
    telefone: "(34) 99999-9999",
    whatsapp: "https://wa.me/5534999999999",
    website: null,
    instagram: null,
    facebook: null,
    email: null,
    nota: null,
    avaliacoes: null,
    lat: null,
    lng: null,
    mapsUrl: null,
    fotos: [],
    dadosOsm: {},
    precos: null,
    horarios: null,
    pagamento: null,
    diferenciais: null,
    visto: false,
    noCrm: false,
    statusSite: "sem-site",
    score: 70,
    temperatura: "morno",
    etapa: "novo",
    notas: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...p,
  } as Lead;
}

const CASOS: [string, Lead][] = [
  [
    "lava-rápido com boa nota",
    lead({ nome: "BoutiqueCar Porto", categoria: "car_wash", nota: 4.9, avaliacoes: 132 }),
  ],
  [
    "pizzaria sem nota",
    lead({ nome: "Pizzaria do Zé", categoria: "restaurant" }),
  ],
  [
    "dentista com Instagram",
    lead({
      nome: "Clínica Sorriso Ltda",
      categoria: "dentist",
      instagram: "https://instagram.com/clinicasorriso",
    }),
  ],
  [
    "barbearia com site fora do ar",
    lead({
      nome: "Zion Barbearia",
      categoria: "barber",
      statusSite: "site-fora-do-ar",
      nota: 4.7,
      avaliacoes: 88,
    }),
  ],
  [
    "salão que só tem agregador",
    lead({ nome: "Studio Bella | Beleza", categoria: "hairdresser", statusSite: "so-agregador" }),
  ],
  [
    "oficina que já tem site",
    lead({ nome: "Auto Center Silva", categoria: "car_repair", statusSite: "tem-site" }),
  ],
  [
    "ramo sem mapeamento (cai no padrão)",
    lead({ nome: "Vidraçaria Central", categoria: "glaziery" }),
  ],
];

let falhas = 0;
const vistas = new Set<string>();

for (const [rotulo, l] of CASOS) {
  const { mensagem } = montarProposta(l);

  // Cada ramo precisa gerar texto diferente — senão a personalização é fake.
  const miolo = mensagem.split("\n").slice(2).join(" ");
  if (vistas.has(miolo)) {
    falhas++;
    console.log(`FALHA ${rotulo}: mensagem idêntica a outro caso`);
  }
  vistas.add(miolo);

  // Nada de placeholder vazando.
  if (/\[|\]|undefined|null/.test(mensagem)) {
    falhas++;
    console.log(`FALHA ${rotulo}: placeholder na mensagem`);
  }

  /**
   * A abertura precisa TER o marcador de saudação…
   *
   * Isto guarda a decisão, não o texto: se alguém voltar a chumbar "Boa!" ou
   * "Bom dia" direto na mensagem, ela passa a sair com a saudação do momento
   * da MONTAGEM — e a fila leva dias para escoar, então o lead receberia
   * "Boa noite" às nove da manhã.
   */
  if (!mensagem.startsWith(MARCA_SAUDACAO)) {
    falhas++;
    console.log(`FALHA ${rotulo}: abertura sem marcador de saudação`);
  }

  /**
   * …e precisa SUMIR depois de resolvida.
   *
   * A checagem de placeholder acima procura `[`, `]`, `undefined` e `null` —
   * não pega chave dupla. Sem esta linha, uma mensagem saindo com
   * "{{saudacao}}, tudo bem?" literal para um lead real passaria no teste.
   */
  const resolvida = resolverSaudacao(mensagem, MANHA);
  if (/\{\{|\}\}/.test(resolvida)) {
    falhas++;
    console.log(`FALHA ${rotulo}: marcador sobrou depois de resolver`);
  }
  if (!resolvida.startsWith("Bom dia")) {
    falhas++;
    console.log(`FALHA ${rotulo}: às 9h não abriu com "Bom dia"`);
  }

  console.log(`\n─── ${rotulo}`);
  console.log(resolvida);
}

console.log(
  falhas === 0
    ? `\n\n${CASOS.length} casos, todos com mensagem própria e sem placeholder.`
    : `\n\n${falhas} problema(s).`,
);

process.exit(falhas === 0 ? 0 : 1);
