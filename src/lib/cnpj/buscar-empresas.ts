import type { BuscaOsmParams, BuscaOsmResultado, LugarOsm } from "@/lib/osm/search";

/** CNAEs mais usados para buscas de prospecção. A fonte só consulta empresas ativas. */
const CNAES: { termos: string[]; codigos: string[]; rotulo: string; categoria: string }[] = [
  { termos: ["transportadora", "transportadoras", "logística", "logistica", "transporte de carga"], codigos: ["4930201", "4930202", "4930203", "4930204"], rotulo: "Transportadoras", categoria: "transportadora" },
  { termos: ["restaurante", "restaurantes", "lanchonete", "lanchonetes"], codigos: ["5611201", "5611203", "5611204"], rotulo: "Restaurantes", categoria: "restaurant" },
  { termos: ["oficina", "oficinas", "mecânica", "mecanica", "auto center"], codigos: ["4520001", "4520002", "4520003", "4520007"], rotulo: "Oficinas mecânicas", categoria: "car_repair" },
  { termos: ["salão de beleza", "salao de beleza", "salões de beleza", "cabeleireiro", "barbearia"], codigos: ["9602501", "9602502"], rotulo: "Salões de beleza", categoria: "hairdresser" },
  { termos: ["pousada", "pousadas", "hotel", "hotéis", "hoteis"], codigos: ["5510801", "5510802", "5590601"], rotulo: "Hospedagem", categoria: "hotel" },
  { termos: ["clínica", "clinica", "clínicas", "clinicas", "consultório", "consultorio"], codigos: ["8630501", "8630502", "8630503", "8630504", "8630506", "8630507", "8630599"], rotulo: "Clínicas e consultórios", categoria: "clinic" },
  { termos: ["dentista", "dentistas", "odontologia"], codigos: ["8630504"], rotulo: "Consultórios odontológicos", categoria: "dentist" },
  { termos: ["contabilidade", "contador", "contadores"], codigos: ["6920601", "6920602"], rotulo: "Contabilidade", categoria: "accountant" },
  { termos: ["advocacia", "advogado", "advogados"], codigos: ["6911701"], rotulo: "Serviços jurídicos", categoria: "lawyer" },
  { termos: ["academia", "academias", "pilates"], codigos: ["9313100"], rotulo: "Academias", categoria: "fitness_centre" },
  { termos: ["imobiliária", "imobiliaria", "imobiliárias", "imobiliarias"], codigos: ["6821801", "6821802"], rotulo: "Imobiliárias", categoria: "estate_agent" },
];

type Linha = {
  cnpj: string; razao_social?: string; nome_fantasia?: string | null;
  municipio?: string; uf?: string; telefone?: string | null; email?: string | null;
  url?: string; cnae_fiscal_descricao?: string; porte?: string;
};
type Pagina = { resultados?: Linha[]; total?: number; fonte?: { nome?: string; base?: string }; };

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escolherCnaes(nicho: string) {
  const termo = normalizar(nicho);
  const grupo = CNAES.find((item) => item.termos.some((t) => termo.includes(normalizar(t))));
  return grupo;
}

function telefoneLimpo(value?: string | null) {
  const digitos = (value ?? "").replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 13 ? value ?? undefined : undefined;
}

async function consultar(uf: string, cidade: string, cnae: string, pagina: number): Promise<Pagina> {
  const url = new URL("https://cnpj.genesisinnovation.io/api/v1/busca-avancada");
  url.searchParams.set("uf", uf.toUpperCase());
  url.searchParams.set("cidade", cidade);
  url.searchParams.set("cnae", cnae);
  url.searchParams.set("situacao", "ativa");
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("por_pagina", "20");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "LeadSite/1.0" }, next: { revalidate: 60 * 60 * 24 } });
    if (!response.ok) throw new Error(`A base pública de CNPJs respondeu ${response.status}. Tente novamente em instantes.`);
    return await response.json() as Pagina;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("A consulta à base pública de CNPJs demorou demais. Tente novamente.");
    throw error;
  } finally { clearTimeout(timer); }
}

/** Busca estabelecimentos ativos por CNAE, cidade e UF na base pública de CNPJ. */
export async function buscarEmpresasCnpj(params: BuscaOsmParams): Promise<BuscaOsmResultado> {
  const grupo = escolherCnaes(params.nicho);
  if (!grupo) {
    throw new Error(`Ainda não tenho o CNAE de “${params.nicho}”. Tente um segmento sugerido, como transportadoras, restaurantes, oficinas, salões de beleza, pousadas ou clínicas.`);
  }
  const codigos = grupo.codigos;
  // Busca até três páginas por CNAE, evitando chamadas ilimitadas e priorizando empresas com maior capital.
  const paginasPorCnae = Math.max(1, Math.ceil((params.quantidade ?? 20) / 20));
  const consultas = await Promise.all(codigos.map(async (cnae) => {
    const respostas: Pagina[] = [];
    for (let pagina = 1; pagina <= paginasPorCnae; pagina++) respostas.push(await consultar(params.estado, params.cidade, cnae, pagina));
    return { cnae, respostas };
  }));
  const todos: LugarOsm[] = [];
  let totalEncontrado = 0;
  for (const { cnae, respostas } of consultas) {
    totalEncontrado += respostas[0]?.total ?? 0;
    for (const resposta of respostas) for (const item of resposta.resultados ?? []) {
      const cnpj = (item.cnpj ?? "").replace(/\D/g, "");
      const nome = (item.nome_fantasia || item.razao_social || "").trim();
      if (!cnpj || !nome) continue;
      todos.push({
        osmId: `cnpj:${cnpj}`, idExterno: `cnpj:${cnpj}`, cnpj,
        nome, razaoSocial: item.razao_social?.trim(), categoria: grupo.categoria,
        cidade: item.municipio || params.cidade, estado: item.uf || params.estado,
        telefone: telefoneLimpo(item.telefone), email: item.email?.trim() || undefined,
        extras: {
          fonte: "Dados abertos CNPJ da Receita Federal", cnae, segmento: grupo.rotulo,
          ...(item.porte ? { porteReceita: item.porte } : {}),
          ...(item.cnae_fiscal_descricao ? { atividadeReceita: item.cnae_fiscal_descricao } : {}),
          ...(item.url ? { urlCadastro: item.url } : {}),
        },
      });
    }
  }
  const unicos = [...new Map(todos.map((l) => [l.cnpj, l])).values()];
  const ordenados = unicos.sort((a, b) => Number(Boolean(b.telefone || b.email)) - Number(Boolean(a.telefone || a.email)));
  const contataveis = ordenados.filter((l) => l.telefone || l.email);
  const candidatos = params.incluirSites ? ordenados : contataveis;
  return { lugares: candidatos.slice(0, params.quantidade ?? 20), buscaPorNome: false, totalEncontrado, totalContatavel: contataveis.length };
}
