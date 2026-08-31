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
  chalet: { singular: "chalé", plural: "chalés" },
  apartment: { singular: "casa de temporada", plural: "casas de temporada" },
  camp_site: { singular: "camping", plural: "campings" },
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

/**
 * "aqui em Capitólio" / "aqui na região".
 *
 * A crase muda com a palavra: `em + a região` é "na região", não "em a
 * região". A versão anterior interpolava `lead.cidade ?? "a região"` direto
 * depois de "aqui em", e todo lead sem cidade recebia "procurando chalés
 * aqui em a região" — erro de português na primeira frase da abordagem.
 *
 * Isso era raro enquanto a busca era só por cidade (quem pesquisa sabe a
 * cidade). Virou comum com a busca por cachoeira, que varre um estado e
 * traz muita hospedagem sem `addr:city` no mapa.
 */
export function ondeFica(cidade?: string | null): string {
  return cidade?.trim() ? `aqui em ${cidade.trim()}` : "aqui na região";
}

/**
 * Estado sempre como SIGLA de duas letras.
 *
 * Duas rotas gravam lead e cada uma recebia o estado num formato: a busca por
 * cidade manda `uf` do seletor ("MG"), e a busca por cachoeira recebe do
 * Nominatim ora "Minas Gerais", ora "MG". Sem convergir, a mesma cidade vira
 * "Pirenópolis/Goiás" e "Pirenópolis/GO" — dois lugares diferentes para o
 * filtro, escondendo metade dos leads de quem filtrar por um dos dois.
 *
 * A sigla venceu por ser o que a base já usava e o que a tela exibe
 * ("Uberlândia/MG"). A normalização mora no ponto de GRAVAÇÃO, não em cada
 * chamador, porque chamador novo esquece.
 */
const SIGLA_POR_NOME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amazonas: "AM", amapa: "AP", bahia: "BA",
  ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO",
  maranhao: "MA", "minas gerais": "MG", "mato grosso do sul": "MS",
  "mato grosso": "MT", para: "PA", paraiba: "PB", pernambuco: "PE",
  piaui: "PI", parana: "PR", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", rondonia: "RO", roraima: "RR",
  "rio grande do sul": "RS", "santa catarina": "SC", sergipe: "SE",
  "sao paulo": "SP", tocantins: "TO",
};

/**
 * Emoji por segmento — puramente visual, cai num padrão quando não conhece.
 * Compartilhado entre /campanhas e /disparos: as duas telas mostram grade de
 * nicho, então o mapeamento vive num só lugar.
 */
export function iconeCategoria(segmentoSingular: string): string {
  const t = segmentoSingular.toLowerCase();
  if (/oficina|mec[âa]nic|auto|borracharia|pneu/.test(t)) return "🔧";
  if (/lava|est[ée]tica automotiva/.test(t)) return "🚗";
  if (/cl[íi]nic|m[ée]dic|consult[óo]rio|odonto|dentista|fisio|psicolog/.test(t)) return "🏥";
  if (/sal[ãa]o|barbear|cabelo|beleza|manicure/.test(t)) return "💇";
  if (/est[ée]tica/.test(t)) return "💆";
  if (/pet|veterin/.test(t)) return "🐶";
  if (/restaurante|lanchonete|pizza|caf[ée]|padaria|bar\b/.test(t)) return "🍽️";
  if (/farm[áa]cia|drogaria/.test(t)) return "💊";
  if (/im[óo]vel|imobili/.test(t)) return "🏠";
  if (/academia|pilates|crossfit/.test(t)) return "🏋️";
  if (/advoc|advogad/.test(t)) return "⚖️";
  if (/contab/.test(t)) return "🧾";
  if (/arquitet/.test(t)) return "📐";
  if (/engenh/.test(t)) return "🏗️";
  if (/escola|ensino|curso/.test(t)) return "🎓";
  if (/m[óo]vel|marcenaria|decora[çc][ãa]o/.test(t)) return "🛋️";
  return "🏢";
}

export function siglaDoEstado(bruto?: string | null): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const chave = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return SIGLA_POR_NOME[chave] ?? t;
}
