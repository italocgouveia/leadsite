/**
 * A categoria vem do OpenStreetMap em inglês e em formato de tag:
 * "car_repair", "restaurant", "hairdresser". Isso é aceitável num filtro
 * interno, mas vazou para a mensagem enviada ao cliente
 * ("procurando restaurant aqui em Uberlândia") — parece descuido.
 *
 * Aqui fica a tradução. Singular e plural separados porque a frase muda:
 * "uma oficina" vs "procurando oficinas".
 */

type Nomes = { singular: string; plural: string };

const MAPA: Record<string, Nomes> = {
  // alimentação
  restaurant: { singular: "restaurante", plural: "restaurantes" },
  fast_food: { singular: "lanchonete", plural: "lanchonetes" },
  cafe: { singular: "cafeteria", plural: "cafeterias" },
  bar: { singular: "bar", plural: "bares" },
  pub: { singular: "bar", plural: "bares" },
  bakery: { singular: "padaria", plural: "padarias" },
  pastry: { singular: "confeitaria", plural: "confeitarias" },
  confectionery: { singular: "doceria", plural: "docerias" },
  ice_cream: { singular: "sorveteria", plural: "sorveterias" },
  butcher: { singular: "açougue", plural: "açougues" },
  greengrocer: { singular: "hortifruti", plural: "hortifrutis" },
  supermarket: { singular: "supermercado", plural: "supermercados" },
  convenience: { singular: "mercearia", plural: "mercearias" },
  deli: { singular: "empório", plural: "empórios" },

  // beleza
  hairdresser: { singular: "salão de beleza", plural: "salões de beleza" },
  beauty: { singular: "clínica de estética", plural: "clínicas de estética" },
  barber: { singular: "barbearia", plural: "barbearias" },
  tattoo: { singular: "estúdio de tatuagem", plural: "estúdios de tatuagem" },
  massage: { singular: "casa de massagem", plural: "casas de massagem" },

  // saúde
  dentist: { singular: "clínica odontológica", plural: "clínicas odontológicas" },
  doctors: { singular: "consultório médico", plural: "consultórios médicos" },
  clinic: { singular: "clínica", plural: "clínicas" },
  veterinary: { singular: "clínica veterinária", plural: "clínicas veterinárias" },
  pharmacy: { singular: "farmácia", plural: "farmácias" },
  optician: { singular: "ótica", plural: "óticas" },
  physiotherapist: { singular: "clínica de fisioterapia", plural: "clínicas de fisioterapia" },
  psychotherapist: { singular: "consultório de psicologia", plural: "consultórios de psicologia" },
  laboratory: { singular: "laboratório", plural: "laboratórios" },

  // automotivo
  car_repair: { singular: "oficina mecânica", plural: "oficinas mecânicas" },
  car: { singular: "revenda de veículos", plural: "revendas de veículos" },
  car_wash: { singular: "lava-jato", plural: "lava-jatos" },
  tyres: { singular: "borracharia", plural: "borracharias" },
  motorcycle: { singular: "loja de motos", plural: "lojas de motos" },
  car_parts: { singular: "auto peças", plural: "lojas de auto peças" },

  // comércio
  clothes: { singular: "loja de roupas", plural: "lojas de roupas" },
  shoes: { singular: "loja de calçados", plural: "lojas de calçados" },
  jewelry: { singular: "joalheria", plural: "joalherias" },
  florist: { singular: "floricultura", plural: "floriculturas" },
  pet: { singular: "pet shop", plural: "pet shops" },
  bicycle: { singular: "loja de bicicletas", plural: "lojas de bicicletas" },
  mobile_phone: { singular: "loja de celulares", plural: "lojas de celulares" },
  electronics: { singular: "loja de eletrônicos", plural: "lojas de eletrônicos" },
  computer: { singular: "loja de informática", plural: "lojas de informática" },
  furniture: { singular: "loja de móveis", plural: "lojas de móveis" },
  doityourself: { singular: "loja de materiais de construção", plural: "lojas de materiais de construção" },
  hardware: { singular: "loja de ferragens", plural: "lojas de ferragens" },
  copyshop: { singular: "gráfica", plural: "gráficas" },
  photo: { singular: "estúdio fotográfico", plural: "estúdios fotográficos" },
  nutrition_supplements: { singular: "loja de suplementos", plural: "lojas de suplementos" },
  travel_agency: { singular: "agência de viagens", plural: "agências de viagens" },

  // serviços
  lawyer: { singular: "escritório de advocacia", plural: "escritórios de advocacia" },
  accountant: { singular: "escritório de contabilidade", plural: "escritórios de contabilidade" },
  estate_agent: { singular: "imobiliária", plural: "imobiliárias" },
  insurance: { singular: "corretora de seguros", plural: "corretoras de seguros" },
  architect: { singular: "escritório de arquitetura", plural: "escritórios de arquitetura" },
  advertising_agency: { singular: "agência de marketing", plural: "agências de marketing" },

  // fitness e educação
  fitness_centre: { singular: "academia", plural: "academias" },
  dance: { singular: "escola de dança", plural: "escolas de dança" },
  sports_centre: { singular: "centro esportivo", plural: "centros esportivos" },
  school: { singular: "escola", plural: "escolas" },
  language_school: { singular: "escola de idiomas", plural: "escolas de idiomas" },
  driving_school: { singular: "autoescola", plural: "autoescolas" },
  music_school: { singular: "escola de música", plural: "escolas de música" },
  kindergarten: { singular: "escola infantil", plural: "escolas infantis" },

  // construção e casa
  glaziery: { singular: "vidraçaria", plural: "vidraçarias" },
  locksmith: { singular: "chaveiro", plural: "chaveiros" },
  carpenter: { singular: "marcenaria", plural: "marcenarias" },
  metal_construction: { singular: "serralheria", plural: "serralherias" },
  paint: { singular: "loja de tintas", plural: "lojas de tintas" },
  electrical: { singular: "loja de material elétrico", plural: "lojas de material elétrico" },
  garden_centre: { singular: "loja de jardinagem", plural: "lojas de jardinagem" },
  houseware: { singular: "loja de utilidades", plural: "lojas de utilidades" },
  appliance: { singular: "loja de eletrodomésticos", plural: "lojas de eletrodomésticos" },
  interior_decoration: { singular: "loja de decoração", plural: "lojas de decoração" },
  flooring: { singular: "loja de pisos", plural: "lojas de pisos" },

  // outros comuns
  laundry: { singular: "lavanderia", plural: "lavanderias" },
  dry_cleaning: { singular: "lavanderia", plural: "lavanderias" },
  funeral_directors: { singular: "funerária", plural: "funerárias" },
  gift: { singular: "loja de presentes", plural: "lojas de presentes" },
  toys: { singular: "loja de brinquedos", plural: "lojas de brinquedos" },
  books: { singular: "livraria", plural: "livrarias" },
  stationery: { singular: "papelaria", plural: "papelarias" },
  variety_store: { singular: "loja de variedades", plural: "lojas de variedades" },
  alcohol: { singular: "distribuidora de bebidas", plural: "distribuidoras de bebidas" },
  beverages: { singular: "distribuidora de bebidas", plural: "distribuidoras de bebidas" },
  fabric: { singular: "loja de tecidos", plural: "lojas de tecidos" },
  sports: { singular: "loja de artigos esportivos", plural: "lojas de artigos esportivos" },
  bank: { singular: "agência bancária", plural: "agências bancárias" },
  copy: { singular: "gráfica", plural: "gráficas" },
  seafood: { singular: "peixaria", plural: "peixarias" },
  cheese: { singular: "empório", plural: "empórios" },
  chocolate: { singular: "loja de chocolates", plural: "lojas de chocolates" },
  coffee: { singular: "loja de cafés", plural: "lojas de cafés" },
  wine: { singular: "adega", plural: "adegas" },
  second_hand: { singular: "brechó", plural: "brechós" },
  charity: { singular: "brechó", plural: "brechós" },
  kiosk: { singular: "quiosque", plural: "quiosques" },
  newsagent: { singular: "banca", plural: "bancas" },
  lottery: { singular: "lotérica", plural: "lotéricas" },

  // hospedagem
  hotel: { singular: "hotel", plural: "hotéis" },
  guest_house: { singular: "pousada", plural: "pousadas" },
  events_venue: { singular: "casa de eventos", plural: "casas de eventos" },
};

function limpar(bruto?: string | null): string {
  return (bruto ?? "").trim().toLowerCase();
}

/**
 * Vazou "procurando glaziery aqui em Uberlândia" numa mensagem de venda.
 * Regra: só ecoa o valor cru quando ele PARECE português. Tag do
 * OpenStreetMap é sempre ASCII, minúscula e sem espaço — quando não está
 * traduzida, cai no genérico em vez de mandar inglês para o cliente.
 */
function pareceOsm(c: string): boolean {
  if (c.includes("_")) return true;
  // Sem acento, sem espaço e não traduzida: quase certamente é tag do OSM.
  return !/[àáâãéêíóôõúüç ]/.test(c);
}

/** "car_repair" → "oficina mecânica" */
export function categoriaSingular(bruto?: string | null): string {
  const c = limpar(bruto);
  if (!c) return "negócio";
  if (MAPA[c]) return MAPA[c].singular;
  return pareceOsm(c) ? "negócio" : c;
}

/** "car_repair" → "oficinas mecânicas" */
export function categoriaPlural(bruto?: string | null): string {
  const c = limpar(bruto);
  if (!c) return "negócios";
  if (MAPA[c]) return MAPA[c].plural;
  return pareceOsm(c) ? "negócios" : c;
}
