/**
 * OS NICHOS QUE COMPRAM — e quanto a fonte gratuita realmente entrega de cada um.
 *
 * POR QUE ESTA LISTA TEM DOIS NÚMEROS, E NÃO UM
 *
 * "Esse ramo compra chatbot?" e "esse ramo existe na fonte?" são perguntas
 * diferentes, e a segunda decide se a busca volta cheia ou vazia. Transportadora
 * é o exemplo perfeito: vive de cotação por WhatsApp, compraria automação sem
 * pestanejar — e o mapa aberto conhece 9 em Uberlândia, com 1 contato.
 *
 * A razão é estrutural. O OpenStreetMap é cartografia: mapeia o que tem
 * fachada. Restaurante, oficina e salão estão lá porque alguém passou na
 * frente. Transportadora, contabilidade e despachante atendem por telefone num
 * galpão ou numa sala — ninguém os desenha no mapa.
 *
 * MEDIDO EM UBERLÂNDIA, e não estimado. Ver `npm run sondar:nichos`, que conta
 * quantos estabelecimentos de cada tag existem e quantos publicam algum canal.
 * Os números abaixo saíram dessa sonda; quando a praça mudar, rode de novo.
 *
 * O QUE A TELA FAZ COM ISSO
 *
 * Ordena por `contataveis` — o que rende hoje aparece primeiro — e marca os
 * que dependem de outra fonte. Oferecer "despachante" numa lista sem aviso é
 * convidar a pessoa a concluir que o sistema está quebrado quando o resultado
 * vier vazio.
 */

export type Fonte = "mapa" | "receita";

export type NichoQuente = {
  /** O termo que vai para a busca. Precisa casar em `filtrosParaNicho`. */
  termo: string;
  rotulo: string;
  grupo: string;
  /** Por que este ramo compra sistema, site ou automação de atendimento. */
  porque: string;
  /** Quantos o mapa conhece na praça. 0 = a fonte não enxerga este ramo. */
  mapeados: number;
  /** Destes, quantos publicam telefone ou Instagram. É o que dá para abordar. */
  contataveis: number;
  /**
   * De onde ele virá de verdade.
   *
   * `mapa` rende hoje. `receita` significa "compra bem, e o mapa não acha" —
   * o volume real depende do importador de CNPJ, que ainda não existe.
   */
  fonte: Fonte;
};

export const NICHOS_QUENTES: NichoQuente[] = [
  // ═══════════ o que a fonte de hoje realmente entrega ═══════════
  {
    termo: "restaurante",
    rotulo: "Restaurante",
    grupo: "Alimentação",
    porque: "Pedido, reserva e cardápio se repetem o dia inteiro no WhatsApp",
    mapeados: 174,
    contataveis: 16,
    fonte: "mapa",
  },
  {
    termo: "material de construção",
    rotulo: "Material de construção",
    grupo: "Comércio",
    porque: "Orçamento item a item e consulta de estoque por telefone",
    mapeados: 35,
    contataveis: 7,
    fonte: "mapa",
  },
  {
    termo: "lanchonete",
    rotulo: "Lanchonete e delivery",
    grupo: "Alimentação",
    porque: "Pedido por mensagem, cardápio e fechamento de caixa",
    mapeados: 74,
    contataveis: 6,
    fonte: "mapa",
  },
  {
    termo: "oficina mecânica",
    rotulo: "Oficina mecânica",
    grupo: "Automotivo",
    porque: "Ordem de serviço, orçamento e histórico do veículo",
    mapeados: 30,
    contataveis: 6,
    fonte: "mapa",
  },
  {
    termo: "hotel",
    rotulo: "Hotel e pousada",
    grupo: "Hospedagem",
    porque: "Reserva, disponibilidade e a mesma pergunta de preço todo dia",
    mapeados: 28,
    contataveis: 6,
    fonte: "mapa",
  },
  {
    termo: "salão de beleza",
    rotulo: "Salão e barbearia",
    grupo: "Beleza",
    porque: "Agenda, confirmação e retorno de cliente — automação pura",
    mapeados: 51,
    contataveis: 4,
    fonte: "mapa",
  },
  {
    termo: "odontologia",
    rotulo: "Odontologia",
    grupo: "Saúde",
    porque: "Agendamento, confirmação e falta — o custo da cadeira vazia",
    mapeados: 39,
    contataveis: 4,
    fonte: "mapa",
  },
  {
    termo: "clínica",
    rotulo: "Clínica médica",
    grupo: "Saúde",
    porque: "Agenda, prontuário e retorno de paciente",
    mapeados: 61,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "bar",
    rotulo: "Bar",
    grupo: "Alimentação",
    porque: "Comanda, reserva de mesa e evento",
    mapeados: 53,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "padaria",
    rotulo: "Padaria",
    grupo: "Alimentação",
    porque: "Encomenda com data e controle de produção",
    mapeados: 30,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "academia",
    rotulo: "Academia e studio",
    grupo: "Beleza",
    porque: "Matrícula, mensalidade e aviso de vencimento",
    mapeados: 26,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "imobiliária",
    rotulo: "Imobiliária",
    grupo: "Serviços B2B",
    porque: "Lead que chega e some — CRM e follow-up de visita",
    mapeados: 25,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "pet shop",
    rotulo: "Pet shop",
    grupo: "Beleza",
    porque: "Banho e tosa agendados, ficha do animal e retorno",
    mapeados: 14,
    contataveis: 3,
    fonte: "mapa",
  },
  {
    termo: "loja de roupas",
    rotulo: "Loja de roupas",
    grupo: "Comércio",
    porque: "Catálogo, tamanho e disponibilidade perguntados o dia todo",
    mapeados: 62,
    contataveis: 2,
    fonte: "mapa",
  },
  {
    termo: "revenda de veículos",
    rotulo: "Revenda de veículos",
    grupo: "Automotivo",
    porque: "Estoque, ficha do carro e qualificação de interessado",
    mapeados: 23,
    contataveis: 2,
    fonte: "mapa",
  },
  {
    termo: "cafeteria",
    rotulo: "Cafeteria",
    grupo: "Alimentação",
    porque: "Pedido, fidelidade e encomenda",
    mapeados: 19,
    contataveis: 2,
    fonte: "mapa",
  },
  {
    termo: "advocacia",
    rotulo: "Advocacia",
    grupo: "Serviços B2B",
    porque: "Triagem de caso e acompanhamento de processo por mensagem",
    mapeados: 12,
    contataveis: 2,
    fonte: "mapa",
  },
  {
    termo: "arquiteto",
    rotulo: "Arquitetura e engenharia",
    grupo: "Serviços B2B",
    porque: "Orçamento de projeto e etapas de obra",
    mapeados: 13,
    contataveis: 1,
    fonte: "mapa",
  },
  {
    termo: "gráfica",
    rotulo: "Gráfica",
    grupo: "Serviços B2B",
    porque: "Orçamento por arte, prazo e aprovação",
    mapeados: 10,
    contataveis: 1,
    fonte: "mapa",
  },

  // ═══════════ compram bem, e o mapa não acha ═══════════
  {
    termo: "transportadora",
    rotulo: "Transportadora e logística",
    grupo: "Serviços B2B",
    porque: "Cotação de frete e rastreio — a pergunta mais repetida do ramo",
    mapeados: 9,
    contataveis: 1,
    fonte: "receita",
  },
  {
    termo: "contabilidade",
    rotulo: "Contabilidade",
    grupo: "Serviços B2B",
    porque: "Documento, prazo e a mesma dúvida fiscal de cada cliente",
    mapeados: 1,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "assistência técnica de celular",
    rotulo: "Assistência técnica",
    grupo: "Comércio",
    porque: "Orçamento de conserto e status do aparelho",
    mapeados: 17,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "escola de idiomas",
    rotulo: "Escola e curso",
    grupo: "Educação",
    porque: "Matrícula, turma e mensalidade",
    mapeados: 10,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "autoescola",
    rotulo: "Autoescola",
    grupo: "Educação",
    porque: "Agenda de aula, prova e renovação",
    mapeados: 6,
    contataveis: 1,
    fonte: "receita",
  },
  {
    termo: "laboratório",
    rotulo: "Laboratório",
    grupo: "Saúde",
    porque: "Agendamento de exame e entrega de resultado",
    mapeados: 8,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "veterinária",
    rotulo: "Clínica veterinária",
    grupo: "Saúde",
    porque: "Consulta, vacina e retorno com data",
    mapeados: 8,
    contataveis: 1,
    fonte: "receita",
  },
  {
    termo: "lavanderia",
    rotulo: "Lavanderia",
    grupo: "Serviços B2B",
    porque: "Retirada, entrega e status da peça",
    mapeados: 3,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "locadora de veículos",
    rotulo: "Locadora de veículos",
    grupo: "Automotivo",
    porque: "Reserva, disponibilidade e contrato",
    mapeados: 2,
    contataveis: 0,
    fonte: "receita",
  },
  {
    termo: "seguros",
    rotulo: "Corretora de seguros",
    grupo: "Serviços B2B",
    porque: "Cotação, renovação e sinistro",
    mapeados: 4,
    contataveis: 1,
    fonte: "receita",
  },
];

/** Agrupados para a tela, do que mais rende para o que menos rende. */
export function nichosPorGrupo(): { grupo: string; itens: NichoQuente[] }[] {
  const mapa = new Map<string, NichoQuente[]>();
  for (const n of [...NICHOS_QUENTES].sort((a, b) => b.contataveis - a.contataveis)) {
    const atual = mapa.get(n.grupo) ?? [];
    atual.push(n);
    mapa.set(n.grupo, atual);
  }
  return [...mapa.entries()]
    .map(([grupo, itens]) => ({ grupo, itens }))
    .sort(
      (a, b) =>
        b.itens.reduce((s, x) => s + x.contataveis, 0) - a.itens.reduce((s, x) => s + x.contataveis, 0),
    );
}

/** Os que rendem hoje pela fonte gratuita. É o que a tela sugere primeiro. */
export const NICHOS_DO_MAPA = NICHOS_QUENTES.filter((n) => n.fonte === "mapa" && n.contataveis >= 2);
