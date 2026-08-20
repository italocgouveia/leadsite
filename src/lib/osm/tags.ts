/**
 * Tradução de nicho em português -> tags do OpenStreetMap.
 *
 * O OSM não tem busca por texto como o Google: ele indexa por TAG. "salão de
 * beleza" não existe como termo — existe `shop=hairdresser`. Sem esse mapa a
 * busca volta vazia, então ele é a peça central do modo grátis.
 *
 * Quando o nicho digitado não bate em nada aqui, caímos num filtro por nome
 * (`name~"texto",i`), que funciona mas traz menos resultado.
 */

export type FiltroOsm = { chave: string; valor: string; extra?: string };

const MAPA: { termos: string[]; filtros: FiltroOsm[] }[] = [
  // Beleza
  {
    termos: ["salão de beleza", "salao de beleza", "salão", "cabeleireiro", "beleza"],
    filtros: [
      { chave: "shop", valor: "hairdresser" },
      { chave: "shop", valor: "beauty" },
    ],
  },
  { termos: ["barbearia", "barbeiro"], filtros: [{ chave: "shop", valor: "hairdresser" }] },
  {
    termos: ["clínica de estética", "estética", "estetica", "spa", "massagem"],
    filtros: [
      { chave: "shop", valor: "beauty" },
      { chave: "leisure", valor: "spa" },
    ],
  },
  { termos: ["unhas", "manicure", "nail"], filtros: [{ chave: "shop", valor: "beauty" }] },
  { termos: ["tatuagem", "tattoo"], filtros: [{ chave: "shop", valor: "tattoo" }] },

  // Alimentação
  { termos: ["restaurante"], filtros: [{ chave: "amenity", valor: "restaurant" }] },
  {
    termos: ["pizzaria", "pizza"],
    filtros: [
      { chave: "amenity", valor: "restaurant", extra: '["cuisine"~"pizza",i]' },
      { chave: "amenity", valor: "fast_food", extra: '["cuisine"~"pizza",i]' },
    ],
  },
  {
    termos: ["hamburgueria", "hamburguer", "burger"],
    filtros: [{ chave: "amenity", valor: "fast_food", extra: '["cuisine"~"burger",i]' }],
  },
  { termos: ["lanchonete", "fast food"], filtros: [{ chave: "amenity", valor: "fast_food" }] },
  { termos: ["cafeteria", "café", "cafe"], filtros: [{ chave: "amenity", valor: "cafe" }] },
  { termos: ["padaria"], filtros: [{ chave: "shop", valor: "bakery" }] },
  {
    termos: ["confeitaria", "doceria", "bolos"],
    filtros: [
      { chave: "shop", valor: "pastry" },
      { chave: "shop", valor: "confectionery" },
    ],
  },
  { termos: ["sorveteria", "açaí", "acai", "gelato"], filtros: [{ chave: "amenity", valor: "ice_cream" }] },
  { termos: ["bar", "petiscaria", "boteco"], filtros: [{ chave: "amenity", valor: "bar" }] },
  {
    termos: ["sushi", "japonesa", "japonês"],
    filtros: [{ chave: "amenity", valor: "restaurant", extra: '["cuisine"~"japanese|sushi",i]' }],
  },
  {
    termos: ["churrascaria", "churrasco"],
    filtros: [{ chave: "amenity", valor: "restaurant", extra: '["cuisine"~"barbecue|steak",i]' }],
  },
  { termos: ["marmitaria", "marmita", "self service"], filtros: [{ chave: "amenity", valor: "restaurant" }] },

  // Saúde
  {
    termos: ["odontologia", "dentista", "clínica odontológica", "odontológica"],
    filtros: [{ chave: "amenity", valor: "dentist" }],
  },
  { termos: ["veterinária", "veterinaria", "veterinário"], filtros: [{ chave: "amenity", valor: "veterinary" }] },
  { termos: ["farmácia", "farmacia", "drogaria"], filtros: [{ chave: "amenity", valor: "pharmacy" }] },
  {
    termos: ["clínica", "clinica", "consultório", "médico", "medico", "fisioterapia", "psicólogo", "nutricionista"],
    filtros: [
      { chave: "amenity", valor: "clinic" },
      { chave: "amenity", valor: "doctors" },
      { chave: "healthcare", valor: "physiotherapist" },
      { chave: "healthcare", valor: "psychotherapist" },
    ],
  },
  { termos: ["laboratório", "análises clínicas"], filtros: [{ chave: "healthcare", valor: "laboratory" }] },
  { termos: ["ótica", "otica", "óculos"], filtros: [{ chave: "shop", valor: "optician" }] },

  // Fitness
  {
    termos: ["academia", "pilates", "crossfit", "musculação"],
    filtros: [{ chave: "leisure", valor: "fitness_centre" }],
  },
  { termos: ["escola de dança", "dança", "danca"], filtros: [{ chave: "leisure", valor: "dance" }] },
  { termos: ["luta", "jiu jitsu", "muay thai", "karatê"], filtros: [{ chave: "leisure", valor: "sports_centre" }] },

  // Automotivo
  {
    termos: ["oficina mecânica", "oficina", "mecânica", "mecanica", "auto center", "funilaria"],
    filtros: [{ chave: "shop", valor: "car_repair" }],
  },
  { termos: ["lava jato", "lava-jato", "estética automotiva"], filtros: [{ chave: "amenity", valor: "car_wash" }] },
  { termos: ["borracharia", "pneu"], filtros: [{ chave: "shop", valor: "tyres" }] },
  { termos: ["concessionária", "revenda de carros", "loja de carros"], filtros: [{ chave: "shop", valor: "car" }] },
  { termos: ["moto", "motocicleta"], filtros: [{ chave: "shop", valor: "motorcycle" }] },

  // Serviços profissionais
  { termos: ["advocacia", "advogado", "escritório de advocacia"], filtros: [{ chave: "office", valor: "lawyer" }] },
  { termos: ["contabilidade", "contador"], filtros: [{ chave: "office", valor: "accountant" }] },
  { termos: ["imobiliária", "imobiliaria", "corretor de imóveis"], filtros: [{ chave: "office", valor: "estate_agent" }] },
  { termos: ["seguros", "corretora de seguros"], filtros: [{ chave: "office", valor: "insurance" }] },
  { termos: ["arquiteto", "arquitetura"], filtros: [{ chave: "office", valor: "architect" }] },
  { termos: ["agência de marketing", "marketing", "publicidade"], filtros: [{ chave: "office", valor: "advertising_agency" }] },
  { termos: ["gráfica", "grafica"], filtros: [{ chave: "shop", valor: "copyshop" }] },

  // Comércio
  { termos: ["pet shop", "petshop", "pet"], filtros: [{ chave: "shop", valor: "pet" }] },
  { termos: ["loja de roupas", "roupas", "moda", "boutique"], filtros: [{ chave: "shop", valor: "clothes" }] },
  { termos: ["calçados", "calcados", "sapatos"], filtros: [{ chave: "shop", valor: "shoes" }] },
  { termos: ["joalheria", "joias", "semijoias"], filtros: [{ chave: "shop", valor: "jewelry" }] },
  { termos: ["floricultura", "flores"], filtros: [{ chave: "shop", valor: "florist" }] },
  { termos: ["bicicleta", "bike"], filtros: [{ chave: "shop", valor: "bicycle" }] },
  {
    termos: ["assistência técnica de celular", "celular", "assistência técnica"],
    filtros: [
      { chave: "shop", valor: "mobile_phone" },
      { chave: "shop", valor: "electronics" },
    ],
  },
  { termos: ["informática", "informatica", "computador"], filtros: [{ chave: "shop", valor: "computer" }] },
  { termos: ["material de construção", "construção"], filtros: [{ chave: "shop", valor: "doityourself" }] },
  { termos: ["móveis", "moveis", "planejados"], filtros: [{ chave: "shop", valor: "furniture" }] },
  { termos: ["suplementos", "suplemento"], filtros: [{ chave: "shop", valor: "nutrition_supplements" }] },
  { termos: ["mercado", "supermercado", "mercearia"], filtros: [{ chave: "shop", valor: "supermarket" }] },

  // Educação
  { termos: ["escola de idiomas", "idiomas", "inglês"], filtros: [{ chave: "amenity", valor: "language_school" }] },
  { termos: ["autoescola", "auto escola", "cfc"], filtros: [{ chave: "amenity", valor: "driving_school" }] },
  { termos: ["escola de música", "música"], filtros: [{ chave: "amenity", valor: "music_school" }] },
  { termos: ["escola", "colégio", "curso"], filtros: [{ chave: "amenity", valor: "school" }] },
  { termos: ["escola infantil", "creche", "berçário"], filtros: [{ chave: "amenity", valor: "kindergarten" }] },

  // Eventos e turismo
  { termos: ["fotógrafo", "fotografia", "estúdio fotográfico"], filtros: [{ chave: "shop", valor: "photo" }] },
  { termos: ["buffet", "festas", "casa de festas"], filtros: [{ chave: "amenity", valor: "events_venue" }] },
  { termos: ["pousada"], filtros: [{ chave: "tourism", valor: "guest_house" }] },
  { termos: ["hotel"], filtros: [{ chave: "tourism", valor: "hotel" }] },
  { termos: ["agência de viagens", "viagens", "turismo"], filtros: [{ chave: "shop", valor: "travel_agency" }] },
];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Devolve os filtros OSM para um nicho. Se nada casar, devolve null — quem
 * chama cai no modo "busca por nome", que é mais fraco mas não volta vazio.
 */
export function filtrosParaNicho(nicho: string): FiltroOsm[] | null {
  const alvo = normalizar(nicho);

  // Primeiro tenta casar exato, depois por conter — evita "pizzaria" cair em "bar".
  for (const entrada of MAPA) {
    if (entrada.termos.some((t) => normalizar(t) === alvo)) return entrada.filtros;
  }

  for (const entrada of MAPA) {
    if (entrada.termos.some((t) => alvo.includes(normalizar(t)))) return entrada.filtros;
  }

  return null;
}
