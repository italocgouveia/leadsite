import { filtrosParaNicho } from "@/lib/osm/tags";

/**
 * Os ramos de Uberlândia que compram SISTEMA.
 *
 * Esta lista é o roteiro da coleta e a definição de "nicho prioritário" no
 * score. Ela existe porque buscar "empresas em Uberlândia" traz banco,
 * supermercado e franquia — e o produto da ICG Tech não é para eles. O que
 * interessa é o negócio de bairro que controla AGENDA, ORDEM DE SERVIÇO,
 * CLIENTE QUE VOLTA e ORÇAMENTO no papel, no caderno ou na cabeça do dono.
 *
 * `recorrente` marca os ramos em que o mesmo cliente volta sozinho (oficina,
 * pet shop, barbearia). Vale ponto próprio no score: quem tem retorno natural
 * tem base de clientes para organizar, e é a venda mais fácil de sustentar —
 * o sistema se paga com o retorno que hoje se perde.
 *
 * A tradução nicho → tag do OpenStreetMap mora em `lib/osm/tags.ts`; aqui só
 * o termo de busca e o que ele significa comercialmente.
 */

export type NichoLocal = {
  /** Termo passado ao coletor. Precisa casar em `filtrosParaNicho`. */
  termo: string;
  /** Como aparece na tela. */
  rotulo: string;
  /** O mesmo cliente volta sozinho? */
  recorrente: boolean;
};

export const NICHOS_LOCAIS: NichoLocal[] = [
  // ---------------- automotivo: ordem de serviço é o coração ----------------
  { termo: "oficina mecânica", rotulo: "Oficina mecânica", recorrente: true },
  { termo: "funilaria", rotulo: "Funilaria e pintura", recorrente: false },
  { termo: "autopeças", rotulo: "Autopeças", recorrente: true },
  { termo: "lava jato", rotulo: "Lava-jato e estética automotiva", recorrente: true },
  { termo: "borracharia", rotulo: "Borracharia", recorrente: true },
  { termo: "moto", rotulo: "Oficina de motos", recorrente: true },

  // ---------------- assistência técnica ----------------
  { termo: "assistência técnica de celular", rotulo: "Assistência de celular", recorrente: false },
  { termo: "assistência técnica de computadores", rotulo: "Assistência de computadores", recorrente: false },
  { termo: "ar condicionado", rotulo: "Ar-condicionado", recorrente: true },
  { termo: "câmeras", rotulo: "Câmeras e segurança", recorrente: false },

  // ---------------- beleza: agenda é o coração ----------------
  { termo: "barbearia", rotulo: "Barbearia", recorrente: true },
  { termo: "salão de beleza", rotulo: "Salão de beleza", recorrente: true },
  { termo: "clínica de estética", rotulo: "Estética", recorrente: true },
  { termo: "unhas", rotulo: "Manicure e unhas", recorrente: true },
  { termo: "tatuagem", rotulo: "Tatuagem", recorrente: false },

  // ---------------- saúde: agenda + retorno ----------------
  { termo: "clínica", rotulo: "Clínica", recorrente: true },
  { termo: "odontologia", rotulo: "Odontologia", recorrente: true },
  { termo: "veterinária", rotulo: "Veterinária", recorrente: true },
  { termo: "nutricionista", rotulo: "Nutrição", recorrente: true },
  { termo: "ótica", rotulo: "Ótica", recorrente: false },

  // ---------------- pets ----------------
  { termo: "pet shop", rotulo: "Pet shop", recorrente: true },

  // ---------------- fitness: mensalidade e presença ----------------
  { termo: "academia", rotulo: "Academia", recorrente: true },
  { termo: "escola de dança", rotulo: "Escola de dança", recorrente: true },
  { termo: "luta", rotulo: "Artes marciais", recorrente: true },

  // ---------------- alimentação: catálogo e pedido ----------------
  { termo: "restaurante", rotulo: "Restaurante", recorrente: true },
  { termo: "lanchonete", rotulo: "Lanchonete", recorrente: true },
  { termo: "pizzaria", rotulo: "Pizzaria", recorrente: true },
  { termo: "padaria", rotulo: "Padaria", recorrente: true },
  { termo: "confeitaria", rotulo: "Confeitaria e doceria", recorrente: false },
  { termo: "cafeteria", rotulo: "Cafeteria", recorrente: true },
  { termo: "sorveteria", rotulo: "Sorveteria e açaí", recorrente: true },
  { termo: "bar", rotulo: "Bar", recorrente: true },
  { termo: "buffet", rotulo: "Buffet e festas", recorrente: false },

  // ---------------- imóveis: cliente, imóvel, visita ----------------
  { termo: "imobiliária", rotulo: "Imobiliária", recorrente: false },

  // ---------------- hospedagem: reserva e hóspede ----------------
  { termo: "pousada", rotulo: "Pousada", recorrente: false },
  { termo: "hotel", rotulo: "Hotel", recorrente: false },

  // ---------------- ofícios: orçamento e obra ----------------
  { termo: "marcenaria", rotulo: "Marcenaria e planejados", recorrente: false },
  { termo: "vidraçaria", rotulo: "Vidraçaria", recorrente: false },
  { termo: "serralheria", rotulo: "Serralheria", recorrente: false },
  { termo: "elétrica", rotulo: "Elétrica", recorrente: false },
  { termo: "encanador", rotulo: "Hidráulica", recorrente: false },
  { termo: "pintura", rotulo: "Pintura", recorrente: false },
  { termo: "gesso", rotulo: "Gesso e drywall", recorrente: false },
  { termo: "chaveiro", rotulo: "Chaveiro", recorrente: false },
  { termo: "material de construção", rotulo: "Material de construção", recorrente: true },

  // ---------------- serviços profissionais ----------------
  { termo: "contabilidade", rotulo: "Contabilidade", recorrente: true },
  { termo: "advocacia", rotulo: "Advocacia", recorrente: false },
  { termo: "arquiteto", rotulo: "Arquitetura", recorrente: false },
  { termo: "engenheiro", rotulo: "Engenharia", recorrente: false },
  { termo: "decoração", rotulo: "Design de interiores", recorrente: false },
  { termo: "seguros", rotulo: "Corretora de seguros", recorrente: true },
  { termo: "gráfica", rotulo: "Gráfica", recorrente: true },
  { termo: "agência de marketing", rotulo: "Marketing", recorrente: true },

  // ---------------- educação ----------------
  { termo: "escola de idiomas", rotulo: "Escola de idiomas", recorrente: true },
  { termo: "autoescola", rotulo: "Autoescola", recorrente: false },
  { termo: "escola de música", rotulo: "Escola de música", recorrente: true },
  { termo: "curso profissionalizante", rotulo: "Curso profissionalizante", recorrente: false },
  { termo: "escola infantil", rotulo: "Escola infantil", recorrente: true },

  // ---------------- outros serviços de bairro ----------------
  { termo: "lavanderia", rotulo: "Lavanderia", recorrente: true },
  { termo: "costura", rotulo: "Costura e ajustes", recorrente: true },
  { termo: "fotógrafo", rotulo: "Fotografia e estúdio", recorrente: false },
  { termo: "floricultura", rotulo: "Floricultura", recorrente: false },
  { termo: "joalheria", rotulo: "Joalheria e semijoias", recorrente: false },
  { termo: "bicicleta", rotulo: "Bicicletaria", recorrente: true },
  { termo: "suplementos", rotulo: "Suplementos", recorrente: true },
  { termo: "loja de roupas", rotulo: "Loja de roupas", recorrente: true },
  { termo: "calçados", rotulo: "Calçados", recorrente: false },
];

/** Só os termos, para o coletor iterar. */
export const TERMOS_LOCAIS = NICHOS_LOCAIS.map((n) => n.termo);

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Termo do nicho -> valores de tag do OSM que ele coleta.
 *
 * Derivado de `filtrosParaNicho` em vez de digitado à mão, e essa escolha
 * importa: o lead é gravado com a TAG na coluna `categoria` (`car_repair`),
 * não com o termo da busca ("oficina mecânica"). Uma segunda lista escrita à
 * mão iria divergir de `tags.ts` no primeiro nicho novo, e o efeito seria
 * silencioso — o nicho pararia de contar como prioritário no score sem
 * ninguém ver erro nenhum.
 */
const POR_TAG = new Map<string, NichoLocal>();
for (const nicho of NICHOS_LOCAIS) {
  for (const filtro of filtrosParaNicho(nicho.termo) ?? []) {
    // Primeiro nicho a reivindicar a tag fica com ela. Quando dois nichos
    // dividem a mesma tag (barbearia e salão são ambos `hairdresser`), o que
    // o score usa — ser prioritário e ser recorrente — é igual nos dois.
    if (!POR_TAG.has(filtro.valor)) POR_TAG.set(filtro.valor, nicho);
  }
}

/**
 * O lead está num ramo prioritário?
 *
 * Aceita tanto a tag do OSM quanto o termo digitado, porque `categoria` traz
 * uma ou outra dependendo de o elemento ter vindo classificado do mapa.
 */
export function nichoPrioritario(categoria: string | null | undefined): NichoLocal | null {
  if (!categoria) return null;
  const alvo = normalizar(categoria);
  return (
    POR_TAG.get(alvo) ??
    NICHOS_LOCAIS.find((n) => normalizar(n.termo) === alvo) ??
    NICHOS_LOCAIS.find((n) => alvo.includes(normalizar(n.termo))) ??
    null
  );
}
