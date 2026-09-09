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
    termos: ["confeitaria", "doceria", "chocolateria", "bolos"],
    /** Doceria, confeitaria e chocolateria são o mesmo negócio para quem vende sistema. */
    filtros: [
      { chave: "shop", valor: "pastry" },
      { chave: "shop", valor: "confectionery" },
      { chave: "shop", valor: "chocolate" },
    ],
  },
  { termos: ["sorveteria", "açaí", "acai", "gelato"], filtros: [{ chave: "amenity", valor: "ice_cream" }] },
  {
    termos: ["bar", "petiscaria", "boteco"],
    /** `pub` é como o mapa marca boa parte dos bares daqui. */
    filtros: [
      { chave: "amenity", valor: "bar" },
      { chave: "amenity", valor: "pub" },
    ],
  },
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
    /** O mesmo consultório aparece nas duas tags — cobrir só uma perde metade. */
    filtros: [
      { chave: "amenity", valor: "dentist" },
      { chave: "healthcare", valor: "dentist" },
    ],
  },
  { termos: ["veterinária", "veterinaria", "veterinário"], filtros: [{ chave: "amenity", valor: "veterinary" }] },
  { termos: ["farmácia", "farmacia", "drogaria"], filtros: [{ chave: "amenity", valor: "pharmacy" }] },
  {
    termos: ["clínica", "clinica", "consultório", "médico", "medico", "fisioterapia", "psicólogo", "nutricionista"],
    filtros: [
      { chave: "amenity", valor: "clinic" },
      { chave: "amenity", valor: "doctors" },
      { chave: "healthcare", valor: "clinic" },
      { chave: "healthcare", valor: "doctor" },
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
  {
    termos: ["luta", "jiu jitsu", "muay thai", "karatê"],
    filtros: [
      { chave: "leisure", valor: "sports_centre" },
      { chave: "amenity", valor: "dojo" },
    ],
  },

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
  {
    termos: ["material de construção", "construção"],
    filtros: [
      { chave: "shop", valor: "doityourself" },
      { chave: "shop", valor: "hardware" },
      { chave: "shop", valor: "paint" },
    ],
  },
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
  /**
   * Chalé e casa de temporada.
   *
   * O OSM não tem tag própria para "casa de temporada" — o mercado brasileiro
   * de Airbnb/temporada é mapeado, quando é, sob as tags de hospedagem que
   * existem: `chalet` (a mais específica), `apartment` (unidade avulsa
   * alugada por diária, o equivalente mais próximo de "casa de temporada") e
   * `guest_house` (pousada pequena, categoria vizinha que o dono às vezes
   * usa por engano). Buscar as três é o que evita perder chalé cadastrado
   * como apartamento por quem preencheu o mapa.
   */
  {
    termos: ["chalé", "chale", "chalés", "chales"],
    filtros: [
      { chave: "tourism", valor: "chalet" },
      { chave: "tourism", valor: "apartment" },
    ],
  },
  {
    termos: ["casa de temporada", "temporada", "aluguel de temporada", "airbnb"],
    filtros: [
      { chave: "tourism", valor: "apartment" },
      { chave: "tourism", valor: "chalet" },
      { chave: "tourism", valor: "guest_house" },
    ],
  },
  {
    termos: ["camping", "glamping", "acampamento"],
    filtros: [{ chave: "tourism", valor: "camp_site" }],
  },

  /**
   * ════════ OFÍCIOS E SERVIÇOS DE BAIRRO ════════
   *
   * Bloco acrescentado para a prospecção de Uberlândia, onde o produto é
   * SISTEMA (ordem de serviço, agenda, orçamento), não site. São ramos que
   * vivem de serviço agendado e recorrente e que o mapa anterior não
   * alcançava: quase todos moram sob `craft=*`, uma chave que nenhuma
   * entrada acima usava — por isso marcenaria, vidraçaria e serralheria
   * simplesmente não existiam para o coletor.
   */
  {
    termos: ["marcenaria", "marceneiro", "móveis planejados", "moveis planejados", "planejados"],
    filtros: [
      { chave: "craft", valor: "carpenter" },
      { chave: "craft", valor: "cabinet_maker" },
      { chave: "shop", valor: "furniture" },
    ],
  },
  {
    termos: ["vidraçaria", "vidracaria", "vidraceiro", "vidro"],
    filtros: [
      { chave: "craft", valor: "glaziery" },
      { chave: "shop", valor: "glaziery" },
    ],
  },
  {
    termos: ["serralheria", "serralheiro", "solda", "estruturas metálicas"],
    filtros: [
      { chave: "craft", valor: "metal_construction" },
      { chave: "craft", valor: "blacksmith" },
    ],
  },
  {
    termos: ["elétrica", "eletrica", "eletricista", "instalação elétrica"],
    filtros: [
      { chave: "craft", valor: "electrician" },
      { chave: "shop", valor: "electrical" },
    ],
  },
  {
    termos: ["ar condicionado", "ar-condicionado", "climatização", "refrigeração", "refrigeracao"],
    filtros: [
      { chave: "craft", valor: "hvac" },
      { chave: "shop", valor: "hvac" },
    ],
  },
  {
    termos: ["câmeras", "cameras", "segurança eletrônica", "alarme", "monitoramento"],
    filtros: [
      { chave: "shop", valor: "security" },
      { chave: "office", valor: "security" },
    ],
  },
  {
    termos: ["autopeças", "autopecas", "peças automotivas", "loja de peças"],
    filtros: [{ chave: "shop", valor: "car_parts" }],
  },
  {
    termos: ["lavanderia", "lavagem de roupas", "tinturaria"],
    filtros: [
      { chave: "shop", valor: "laundry" },
      { chave: "shop", valor: "dry_cleaning" },
    ],
  },
  {
    termos: ["costura", "costureira", "alfaiate", "ajustes de roupa"],
    filtros: [
      { chave: "craft", valor: "dressmaker" },
      { chave: "craft", valor: "tailor" },
      { chave: "shop", valor: "tailor" },
    ],
  },
  {
    termos: ["decoração", "decoracao", "design de interiores", "designer de interiores"],
    filtros: [
      { chave: "shop", valor: "interior_decoration" },
      { chave: "office", valor: "interior_design" },
    ],
  },
  {
    termos: ["engenheiro", "engenharia", "empresa de engenharia"],
    filtros: [{ chave: "office", valor: "engineer" }],
  },
  {
    termos: ["chaveiro", "chaves"],
    filtros: [{ chave: "craft", valor: "locksmith" }],
  },
  {
    termos: ["pintura", "pintor", "pintura predial"],
    filtros: [{ chave: "craft", valor: "painter" }],
  },
  {
    termos: ["gesso", "drywall", "gesseiro"],
    filtros: [{ chave: "craft", valor: "plasterer" }],
  },
  {
    termos: ["encanador", "hidráulica", "hidraulica"],
    filtros: [{ chave: "craft", valor: "plumber" }],
  },
  {
    termos: ["curso profissionalizante", "treinamento", "capacitação"],
    filtros: [{ chave: "amenity", valor: "training" }],
  },
  {
    termos: ["nutricionista", "nutrição", "nutricao"],
    filtros: [{ chave: "healthcare", valor: "dietitian" }],
  },
  {
    termos: ["assistência técnica de computadores", "computadores", "manutenção de computadores"],
    filtros: [
      { chave: "shop", valor: "computer" },
      { chave: "craft", valor: "electronics_repair" },
    ],
  },
  {
    termos: ["auto elétrica", "auto eletrica", "eletricista automotivo"],
    filtros: [{ chave: "shop", valor: "car_repair", extra: '["service:vehicle:electrical"]' }],
  },
  {
    termos: ["assistência de eletrônicos", "eletrônicos", "conserto de eletrodomésticos"],
    filtros: [
      { chave: "craft", valor: "electronics_repair" },
      { chave: "shop", valor: "appliance" },
    ],
  },
  /**
   * Limpeza e eventos são ramos que o OpenStreetMap mal cobre: não têm tag
   * consolidada e quase ninguém mapeia empresa que atende no endereço do
   * cliente. Ficam aqui porque são alvo comercial legítimo (contrato mensal,
   * agenda de equipe) e porque a busca por nome ainda alcança alguma coisa —
   * mas espere pouco resultado, e isso é limitação da fonte, não do filtro.
   */
  {
    termos: ["empresa de limpeza", "limpeza", "conservação", "diarista"],
    filtros: [
      { chave: "craft", valor: "cleaning" },
      { chave: "office", valor: "cleaning" },
    ],
  },
  {
    termos: ["empresa de eventos", "eventos", "organização de eventos"],
    filtros: [
      { chave: "amenity", valor: "events_venue" },
      { chave: "office", valor: "event_management" },
    ],
  },
  /**
   * ---------------- ramos acrescentados pela sonda de cobertura ----------------
   * Ver `npm run sondar:cobertura` e o bloco correspondente em nichos-locais.ts.
   */
  {
    termos: ["farmácia", "farmacia", "drogaria"],
    filtros: [
      { chave: "amenity", valor: "pharmacy" },
      { chave: "healthcare", valor: "pharmacy" },
    ],
  },
  { termos: ["açougue", "acougue"], filtros: [{ chave: "shop", valor: "butcher" }] },
  {
    termos: ["hortifruti", "quitanda", "sacolão"],
    filtros: [{ chave: "shop", valor: "greengrocer" }],
  },
  { termos: ["agropecuária", "agropecuaria"], filtros: [{ chave: "shop", valor: "agrarian" }] },
  { termos: ["revenda de gás", "revenda de gas", "gás"], filtros: [{ chave: "shop", valor: "gas" }] },
  {
    termos: ["distribuidora de bebidas", "bebidas", "adega"],
    filtros: [{ chave: "shop", valor: "beverages" }],
  },
  {
    termos: ["cosméticos", "cosmeticos", "perfumaria"],
    filtros: [{ chave: "shop", valor: "cosmetics" }],
  },
  { termos: ["artigos de festa", "festa"], filtros: [{ chave: "shop", valor: "party" }] },
  {
    termos: ["tecidos", "aviamentos", "armarinho"],
    filtros: [{ chave: "shop", valor: "fabric" }],
  },
  {
    termos: ["revenda de veículos", "revenda de veiculos", "concessionária"],
    filtros: [{ chave: "shop", valor: "car" }],
  },
  {
    termos: ["casa noturna", "balada", "night club"],
    filtros: [{ chave: "amenity", valor: "nightclub" }],
  },
  { termos: ["papelaria"], filtros: [{ chave: "shop", valor: "stationery" }] },
  {
    termos: ["utilidades domésticas", "utilidades domesticas", "casa e decoração"],
    filtros: [
      { chave: "shop", valor: "houseware" },
      { chave: "shop", valor: "bed" },
    ],
  },
  {
    termos: ["loja de conveniência", "loja de conveniencia", "conveniência"],
    filtros: [{ chave: "shop", valor: "convenience" }],
  },
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
