/**
 * O que falta e o que dói, por ramo.
 *
 * A abordagem genérica ("não achei um site de vocês") funciona mal porque
 * qualquer um poderia ter escrito. O que prende a atenção é citar a tarefa
 * chata que o dono faz TODO DIA e que a página resolve — mandar a tabela de
 * preços no WhatsApp de novo, repetir o horário, explicar o mesmo procedimento
 * pela décima vez.
 *
 * Cada entrada tem:
 *  - `pagina`: como chamar a página na frente do dono (linguagem dele)
 *  - `falta`: o que ele não tem hoje, em termos do negócio
 *  - `dor`: a tarefa repetitiva que a página elimina
 */

export type Nicho = {
  pagina: string;
  /**
   * Gênero de `pagina`. Sem isso saía "não têm catálogo próprio" (sem artigo)
   * e "deixar página de serviços bem mais prático" (concordância errada).
   */
  genero: "m" | "f";
  falta: string;
  dor: string;
};

const PADRAO: Nicho = {
  pagina: "página rápida",
  genero: "f",
  falta: "uma página onde o cliente veja os serviços e chame vocês direto",
  dor: "evitar explicar os mesmos serviços e valores toda hora pelo WhatsApp",
};

/**
 * Chave = categoria do OpenStreetMap ou termo digitado na busca.
 * Casamento é por inclusão, então "car_repair" e "oficina mecânica" caem no
 * mesmo lugar.
 */
const NICHOS: Record<string, Nicho> = {
  // --- automotivo ---
  car_wash: {
    pagina: "menu digital",
    genero: "m",
    falta: "um menu digital para o cliente consultar as opções de lavagem e agendar direto pelo celular",
    dor: "evitar aquele envio manual da tabela de preços toda hora pelo WhatsApp",
  },
  car_repair: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página onde o cliente veja os serviços e peça orçamento sem precisar ligar",
    dor: "evitar repetir os mesmos valores de revisão e troca de óleo em cada conversa",
  },
  tyres: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página com as marcas e medidas que vocês trabalham",
    dor: "evitar responder de novo a mesma pergunta de preço de pneu no WhatsApp",
  },

  // --- beleza ---
  hairdresser: {
    pagina: "catálogo de serviços",
    genero: "m",
    falta: "um catálogo online para a cliente ver os serviços, os valores e agendar pelo celular",
    dor: "evitar mandar a tabela de preços e os horários livres toda vez que alguém pergunta",
  },
  barber: {
    pagina: "página de agendamento",
    genero: "f",
    falta: "uma página com os cortes, valores e agenda para o cliente marcar sozinho",
    dor: "evitar parar no meio do corte para responder horário no WhatsApp",
  },
  beauty: {
    pagina: "catálogo de procedimentos",
    genero: "m",
    falta: "uma página explicando cada procedimento, para a cliente chegar já decidida",
    dor: "evitar explicar o mesmo procedimento e o mesmo valor várias vezes por dia",
  },
  tattoo: {
    pagina: "portfólio online",
    genero: "m",
    falta: "um portfólio organizado, com os trabalhos e a faixa de orçamento",
    dor: "evitar mandar as mesmas fotos e explicar o orçamento em cada conversa",
  },

  // --- alimentação ---
  restaurant: {
    pagina: "cardápio digital",
    genero: "m",
    falta: "um cardápio digital que o cliente abre pelo celular e já pede pelo WhatsApp",
    dor: "evitar mandar foto do cardápio toda vez que alguém pergunta o que tem hoje",
  },
  fast_food: {
    pagina: "cardápio digital",
    genero: "m",
    falta: "um cardápio digital com os valores, para o pedido chegar já fechado",
    dor: "evitar mandar a lista de lanches e preços em cada conversa",
  },
  cafe: {
    pagina: "cardápio digital",
    genero: "m",
    falta: "um cardápio online com o que vocês servem e o horário de funcionamento",
    dor: "evitar responder o mesmo horário e o mesmo cardápio o dia inteiro",
  },
  bakery: {
    pagina: "página de encomendas",
    genero: "f",
    falta: "uma página com os produtos e as encomendas, para o cliente pedir sem ligar",
    dor: "evitar anotar encomenda por telefone e repetir os valores toda hora",
  },
  pastry: {
    pagina: "catálogo de encomendas",
    genero: "m",
    falta: "um catálogo com os bolos e doces, para a cliente escolher e já encomendar",
    dor: "evitar mandar as mesmas fotos e a mesma tabela de preços em cada pedido",
  },
  ice_cream: {
    pagina: "cardápio digital",
    genero: "m",
    falta: "um cardápio online com os sabores e tamanhos",
    dor: "evitar repetir a lista de sabores toda vez que alguém pergunta",
  },
  bar: {
    pagina: "cardápio digital",
    genero: "m",
    falta: "um cardápio digital com os petiscos, as bebidas e a programação",
    dor: "evitar mandar o cardápio e a agenda de shows em cada conversa",
  },

  // --- saúde ---
  dentist: {
    pagina: "página de procedimentos",
    genero: "f",
    falta: "uma página explicando os tratamentos, para o paciente agendar a avaliação sozinho",
    dor: "evitar explicar o mesmo tratamento e o mesmo valor várias vezes por dia no WhatsApp",
  },
  clinic: {
    pagina: "página da clínica",
    genero: "f",
    falta: "uma página com as especialidades e os convênios aceitos",
    dor: "evitar responder de novo quais convênios vocês atendem",
  },
  doctors: {
    pagina: "página do consultório",
    genero: "f",
    falta: "uma página com as especialidades e o agendamento de consulta",
    dor: "evitar que a secretária repita o mesmo horário e o mesmo valor o dia todo",
  },
  veterinary: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página com os serviços, os horários e o agendamento",
    dor: "evitar explicar preço de consulta e vacina em cada mensagem",
  },
  physiotherapist: {
    pagina: "página de tratamentos",
    genero: "f",
    falta: "uma página com os tratamentos e o agendamento da primeira sessão",
    dor: "evitar explicar cada tipo de sessão e o valor por WhatsApp",
  },
  pharmacy: {
    pagina: "página de pedidos",
    genero: "f",
    falta: "uma página com entrega e os produtos que vocês têm",
    dor: "evitar conferir estoque por telefone o tempo todo",
  },
  optician: {
    pagina: "catálogo online",
    genero: "m",
    falta: "um catálogo com as armações e as condições de pagamento",
    dor: "evitar mandar as mesmas fotos de armação em cada atendimento",
  },

  // --- fitness ---
  fitness_centre: {
    pagina: "página de planos",
    genero: "f",
    falta: "uma página com os planos, os horários e a matrícula pelo celular",
    dor: "evitar repetir valores de mensalidade e horário de aula toda hora",
  },
  dance: {
    pagina: "página de turmas",
    genero: "f",
    falta: "uma página com as turmas, os horários e a aula experimental",
    dor: "evitar responder de novo o horário de cada turma",
  },

  // --- pet ---
  pet: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página com banho, tosa e valores por porte, com agendamento",
    dor: "evitar mandar a tabela por porte de cachorro em cada conversa",
  },

  // --- serviços ---
  lawyer: {
    pagina: "página institucional",
    genero: "f",
    falta: "uma página com as áreas de atuação e o agendamento de consulta",
    dor: "evitar explicar quais casos vocês atendem em cada primeiro contato",
  },
  accountant: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página com os serviços e os planos de honorários",
    dor: "evitar explicar a mesma tabela de honorários para cada novo cliente",
  },
  estate_agent: {
    pagina: "vitrine de imóveis",
    genero: "f",
    falta: "uma vitrine online dos imóveis, que o cliente filtra sozinho",
    dor: "evitar mandar foto de imóvel um por um no WhatsApp",
  },
  advertising_agency: {
    pagina: "portfólio online",
    genero: "m",
    falta: "um portfólio com os cases e os serviços",
    dor: "evitar montar apresentação do zero para cada cliente novo",
  },

  // --- educação ---
  driving_school: {
    pagina: "página de matrícula",
    genero: "f",
    falta: "uma página com as categorias, os valores e a matrícula online",
    dor: "evitar explicar a mesma tabela de categorias por telefone",
  },
  language_school: {
    pagina: "página de turmas",
    genero: "f",
    falta: "uma página com os cursos, os horários e a matrícula",
    dor: "evitar repetir horário e valor de curso em cada contato",
  },

  // --- hospedagem ---
  hotel: {
    pagina: "página de reservas",
    genero: "f",
    falta: "uma página com os quartos, as diárias e a reserva direta",
    dor: "evitar depender só de plataforma que cobra comissão em cada reserva",
  },
  guest_house: {
    pagina: "página de reservas",
    genero: "f",
    falta: "uma página com os quartos e a reserva direta com vocês",
    dor: "evitar pagar comissão de plataforma em toda diária",
  },
  /**
   * Chalé e casa de temporada dependem quase inteiro de Airbnb/Booking hoje —
   * plataformas que cobram de 15% a 20% por diária. A página própria não
   * troca a plataforma (a maioria continua listando lá), ela dá um segundo
   * canal sem comissão para quem já conhece o lugar ou veio por indicação.
   */
  chalet: {
    pagina: "página de reservas",
    genero: "f",
    falta: "uma página com as fotos, as datas livres e a reserva direta",
    dor: "evitar pagar de 15% a 20% de comissão por diária no Airbnb ou Booking",
  },
  apartment: {
    pagina: "página de reservas",
    genero: "f",
    falta: "uma página com as fotos e a reserva direta, sem taxa de plataforma",
    dor: "evitar pagar comissão de plataforma em cada reserva de temporada",
  },

  // --- comércio ---
  clothes: {
    pagina: "catálogo online",
    genero: "m",
    falta: "um catálogo com as peças e os tamanhos disponíveis",
    dor: "evitar mandar foto de peça uma por uma no WhatsApp",
  },
  florist: {
    pagina: "catálogo de arranjos",
    genero: "m",
    falta: "um catálogo com os arranjos e o pedido com entrega",
    dor: "evitar mandar as mesmas fotos de buquê em cada encomenda",
  },
  furniture: {
    pagina: "catálogo online",
    genero: "m",
    falta: "um catálogo com os móveis e as condições de pagamento",
    dor: "evitar mandar foto e preço de cada peça manualmente",
  },
  mobile_phone: {
    pagina: "página de serviços",
    genero: "f",
    falta: "uma página com os aparelhos, os reparos e os valores",
    dor: "evitar responder o mesmo orçamento de troca de tela o dia todo",
  },
  supermarket: {
    pagina: "página de ofertas",
    genero: "f",
    falta: "uma página com as ofertas da semana e o pedido por WhatsApp",
    dor: "evitar montar e mandar o encarte de ofertas manualmente",
  },
};

/** Termos em português que caem no mesmo nicho, para busca por texto livre. */
const APELIDOS: Record<string, string> = {
  "lava jato": "car_wash",
  "lava-jato": "car_wash",
  "lava rapido": "car_wash",
  "estetica automotiva": "car_wash",
  oficina: "car_repair",
  mecanica: "car_repair",
  "auto center": "car_repair",
  borracharia: "tyres",
  salao: "hairdresser",
  cabeleireiro: "hairdresser",
  barbearia: "barber",
  estetica: "beauty",
  tatuagem: "tattoo",
  restaurante: "restaurant",
  pizzaria: "restaurant",
  churrascaria: "restaurant",
  marmitaria: "restaurant",
  lanchonete: "fast_food",
  hamburgueria: "fast_food",
  cafeteria: "cafe",
  padaria: "bakery",
  confeitaria: "pastry",
  doceria: "pastry",
  sorveteria: "ice_cream",
  acaiteria: "ice_cream",
  bar: "bar",
  dentista: "dentist",
  odontologia: "dentist",
  clinica: "clinic",
  medico: "doctors",
  veterinaria: "veterinary",
  fisioterapia: "physiotherapist",
  farmacia: "pharmacy",
  otica: "optician",
  academia: "fitness_centre",
  pilates: "fitness_centre",
  crossfit: "fitness_centre",
  danca: "dance",
  "pet shop": "pet",
  petshop: "pet",
  advocacia: "lawyer",
  advogado: "lawyer",
  contabilidade: "accountant",
  imobiliaria: "estate_agent",
  "corretor de imoveis": "estate_agent",
  marketing: "advertising_agency",
  autoescola: "driving_school",
  idiomas: "language_school",
  hotel: "hotel",
  pousada: "guest_house",
  chale: "chalet",
  chales: "chalet",
  temporada: "apartment",
  roupas: "clothes",
  floricultura: "florist",
  moveis: "furniture",
  celular: "mobile_phone",
  supermercado: "supermarket",
  mercado: "supermarket",
};

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function nichoDe(categoria?: string | null): Nicho {
  const c = normalizar(categoria ?? "");
  if (!c) return PADRAO;

  if (NICHOS[c]) return NICHOS[c];

  for (const [apelido, chave] of Object.entries(APELIDOS)) {
    if (c.includes(apelido)) return NICHOS[chave] ?? PADRAO;
  }

  return PADRAO;
}
