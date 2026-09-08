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
  /**
   * Prioridade COMERCIAL do ramo — o quanto vale a pena bater nesta porta.
   *
   *   A  serviço com operação diária e processo evidente: oficina, pet shop,
   *      barbearia, clínica, manutenção e instalação. É onde a ordem de
   *      serviço, a agenda e o retorno de cliente já existem no papel, e o
   *      sistema só substitui o caderno.
   *   B  tem operação, mas o processo é mais simples ou menos recorrente:
   *      alimentação, academia, escola, ofícios criativos, comércio
   *      especializado.
   *   C  comércio genérico, sem processo evidente para organizar.
   *
   * B e C NÃO são descartados — entram com prioridade menor. O filtro do
   * painel é que decide o que aparece primeiro.
   */
  prioridade: "A" | "B" | "C";
  /**
   * Categorias que a base guarda para este ramo mas que NÃO são filtros de
   * busca no OpenStreetMap.
   *
   * Existe porque as duas listas respondem a coisas diferentes: `tags.ts` diz
   * "o que consultar no mapa", e a coluna `categoria` do lead guarda o que a
   * fonte devolveu — que às vezes é um valor de perfil interno (`phone_repair`)
   * sem tag correspondente. Sem isso, uma assistência técnica não era
   * reconhecida como nicho prioritário e perdia 13 pontos no score.
   */
  tagsExtras?: string[];
};

export const NICHOS_LOCAIS: NichoLocal[] = [
  // ---------------- automotivo: ordem de serviço é o coração ----------------
  { termo: "oficina mecânica", rotulo: "Oficina mecânica", recorrente: true, prioridade: "A" },
  { termo: "funilaria", rotulo: "Funilaria e pintura", recorrente: false, prioridade: "A" },
  { termo: "autopeças", rotulo: "Autopeças", recorrente: true, prioridade: "B" },
  { termo: "lava jato", rotulo: "Lava-jato e estética automotiva", recorrente: true, prioridade: "A" },
  { termo: "borracharia", rotulo: "Borracharia", recorrente: true, prioridade: "A" },
  { termo: "moto", rotulo: "Oficina de motos", recorrente: true, prioridade: "A" },

  // ---------------- assistência técnica ----------------
  { termo: "assistência técnica de celular", rotulo: "Assistência de celular", recorrente: false, prioridade: "A", tagsExtras: ["phone_repair", "mobile_phone_repair"] },
  { termo: "assistência técnica de computadores", rotulo: "Assistência de computadores", recorrente: false, prioridade: "A", tagsExtras: ["computer_repair"] },
  { termo: "assistência de eletrônicos", rotulo: "Assistência de eletrônicos", recorrente: false, prioridade: "A", tagsExtras: ["electronics_repair"] },
  { termo: "auto elétrica", rotulo: "Auto elétrica", recorrente: true, prioridade: "A" },
  { termo: "ar condicionado", rotulo: "Ar-condicionado", recorrente: true, prioridade: "A" },
  { termo: "câmeras", rotulo: "Câmeras e segurança", recorrente: false, prioridade: "A" },

  // ---------------- beleza: agenda é o coração ----------------
  { termo: "barbearia", rotulo: "Barbearia", recorrente: true, prioridade: "A", tagsExtras: ["barber"] },
  { termo: "salão de beleza", rotulo: "Salão de beleza", recorrente: true, prioridade: "A" },
  { termo: "clínica de estética", rotulo: "Estética", recorrente: true, prioridade: "A" },
  { termo: "unhas", rotulo: "Manicure e unhas", recorrente: true, prioridade: "A" },
  { termo: "tatuagem", rotulo: "Tatuagem", recorrente: false, prioridade: "B" },

  // ---------------- saúde: agenda + retorno ----------------
  { termo: "clínica", rotulo: "Clínica", recorrente: true, prioridade: "A", tagsExtras: ["doctors", "physiotherapist"] },
  { termo: "odontologia", rotulo: "Odontologia", recorrente: true, prioridade: "A", tagsExtras: ["dentist"] },
  { termo: "veterinária", rotulo: "Veterinária", recorrente: true, prioridade: "A", tagsExtras: ["veterinary"] },
  { termo: "nutricionista", rotulo: "Nutrição", recorrente: true, prioridade: "A" },
  { termo: "ótica", rotulo: "Ótica", recorrente: false, prioridade: "B" },

  // ---------------- pets ----------------
  { termo: "pet shop", rotulo: "Pet shop", recorrente: true, prioridade: "A" },

  // ---------------- fitness: mensalidade e presença ----------------
  { termo: "academia", rotulo: "Academia", recorrente: true, prioridade: "B", tagsExtras: ["fitness_centre"] },
  { termo: "escola de dança", rotulo: "Escola de dança", recorrente: true, prioridade: "B" },
  { termo: "luta", rotulo: "Artes marciais", recorrente: true, prioridade: "B" },

  // ---------------- alimentação: catálogo e pedido ----------------
  { termo: "restaurante", rotulo: "Restaurante", recorrente: true, prioridade: "B" },
  { termo: "lanchonete", rotulo: "Lanchonete", recorrente: true, prioridade: "B" },
  { termo: "pizzaria", rotulo: "Pizzaria", recorrente: true, prioridade: "B" },
  { termo: "padaria", rotulo: "Padaria", recorrente: true, prioridade: "B" },
  { termo: "confeitaria", rotulo: "Confeitaria e doceria", recorrente: false, prioridade: "B" },
  { termo: "cafeteria", rotulo: "Cafeteria", recorrente: true, prioridade: "B" },
  { termo: "sorveteria", rotulo: "Sorveteria e açaí", recorrente: true, prioridade: "B" },
  { termo: "bar", rotulo: "Bar", recorrente: true, prioridade: "B" },
  { termo: "buffet", rotulo: "Buffet e festas", recorrente: false, prioridade: "B" },

  // ---------------- imóveis: cliente, imóvel, visita ----------------
  { termo: "imobiliária", rotulo: "Imobiliária", recorrente: false, prioridade: "A" },

  // ---------------- hospedagem: reserva e hóspede ----------------
  { termo: "pousada", rotulo: "Pousada", recorrente: false, prioridade: "A", tagsExtras: ["guest_house", "chalet"] },
  { termo: "hotel", rotulo: "Hotel", recorrente: false, prioridade: "A" },

  // ---------------- ofícios: orçamento e obra ----------------
  { termo: "marcenaria", rotulo: "Marcenaria e planejados", recorrente: false, prioridade: "A" },
  { termo: "vidraçaria", rotulo: "Vidraçaria", recorrente: false, prioridade: "A" },
  { termo: "serralheria", rotulo: "Serralheria", recorrente: false, prioridade: "A" },
  { termo: "elétrica", rotulo: "Elétrica", recorrente: false, prioridade: "A" },
  { termo: "encanador", rotulo: "Hidráulica", recorrente: false, prioridade: "A" },
  { termo: "pintura", rotulo: "Pintura", recorrente: false, prioridade: "A" },
  { termo: "gesso", rotulo: "Gesso e drywall", recorrente: false, prioridade: "A" },
  { termo: "chaveiro", rotulo: "Chaveiro", recorrente: false, prioridade: "A" },
  { termo: "material de construção", rotulo: "Material de construção", recorrente: true, prioridade: "B" },

  // ---------------- serviços profissionais ----------------
  { termo: "contabilidade", rotulo: "Contabilidade", recorrente: true, prioridade: "A" },
  { termo: "advocacia", rotulo: "Advocacia", recorrente: false, prioridade: "B" },
  { termo: "arquiteto", rotulo: "Arquitetura", recorrente: false, prioridade: "B" },
  { termo: "engenheiro", rotulo: "Engenharia", recorrente: false, prioridade: "B" },
  { termo: "decoração", rotulo: "Design de interiores", recorrente: false, prioridade: "B" },
  { termo: "seguros", rotulo: "Corretora de seguros", recorrente: true, prioridade: "A" },
  { termo: "gráfica", rotulo: "Gráfica", recorrente: true, prioridade: "B" },
  { termo: "agência de marketing", rotulo: "Marketing", recorrente: true, prioridade: "B" },

  // ---------------- educação ----------------
  { termo: "escola de idiomas", rotulo: "Escola de idiomas", recorrente: true, prioridade: "B" },
  { termo: "autoescola", rotulo: "Autoescola", recorrente: false, prioridade: "B" },
  { termo: "escola de música", rotulo: "Escola de música", recorrente: true, prioridade: "B" },
  { termo: "curso profissionalizante", rotulo: "Curso profissionalizante", recorrente: false, prioridade: "B" },
  { termo: "escola infantil", rotulo: "Escola infantil", recorrente: true, prioridade: "B" },

  // ---------------- outros serviços de bairro ----------------
  { termo: "lavanderia", rotulo: "Lavanderia", recorrente: true, prioridade: "A" },
  { termo: "empresa de limpeza", rotulo: "Empresa de limpeza", recorrente: true, prioridade: "A" },
  { termo: "empresa de eventos", rotulo: "Empresa de eventos", recorrente: false, prioridade: "B" },
  { termo: "costura", rotulo: "Costura e ajustes", recorrente: true, prioridade: "B" },
  { termo: "fotógrafo", rotulo: "Fotografia e estúdio", recorrente: false, prioridade: "B" },
  { termo: "floricultura", rotulo: "Floricultura", recorrente: false, prioridade: "B" },
  { termo: "joalheria", rotulo: "Joalheria e semijoias", recorrente: false, prioridade: "B" },
  { termo: "bicicleta", rotulo: "Bicicletaria", recorrente: true, prioridade: "B" },
  { termo: "suplementos", rotulo: "Suplementos", recorrente: true, prioridade: "B" },
  { termo: "loja de roupas", rotulo: "Loja de roupas", recorrente: true, prioridade: "C" },
  { termo: "calçados", rotulo: "Calçados", recorrente: false, prioridade: "C" },
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
 * O termo aparece como PALAVRA INTEIRA, não como pedaço de outra.
 *
 * Sem essa fronteira, a tag `barber` casava com o nicho "bar" — e barbearia,
 * que é prioridade A, era classificada como bar, prioridade B. O mesmo tipo de
 * erro que já apareceu em "Espetinho" casando com "pet": substring solta é
 * sempre a armadilha quando se compara nome de ramo.
 */
function contemTermo(alvo: string, termo: string): boolean {
  const t = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(alvo);
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
    NICHOS_LOCAIS.find((n) => (n.tagsExtras ?? []).some((t) => normalizar(t) === alvo)) ??
    NICHOS_LOCAIS.find((n) => contemTermo(alvo, normalizar(n.termo))) ??
    null
  );
}
