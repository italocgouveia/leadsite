import type { BuscaOsmParams, BuscaOsmResultado, LugarOsm } from "@/lib/osm/search";

/** CNAEs mais usados para buscas de prospecção. A fonte só consulta empresas ativas. */
const CNAES: { termos: string[]; codigos: string[]; rotulo: string; categoria: string }[] = [
  { termos: ["loja de veículos", "loja de veiculos", "revenda de veículos", "revenda de veiculos", "concessionária", "concessionaria", "garagem de veículos", "garagem de veiculos"], codigos: ["4511101", "4511102", "4511103"], rotulo: "Lojas e revendas de veículos", categoria: "car" },
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
  url?: string; cnae_fiscal_descricao?: string; porte?: string; situacao?: string;
  site?: string | null; instagram?: string | null;
};
type Pagina = { resultados?: Linha[]; total?: number; fonte?: { nome?: string; base?: string }; };
type ResultadoTexto = { resultados?: Linha[]; fonte?: { nome?: string; base?: string } };
type DetalheCnpj = Linha & {
  situacao?: string;
  atividade_principal?: { codigo?: string; descricao?: string };
  endereco?: { logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null };
  site?: string | null;
  instagram?: string | null;
};

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

async function consultarJson<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "LeadSite/1.0" }, next: { revalidate: 60 * 60 * 24 } });
    if (!response.ok) throw new Error(`A base pública de CNPJs respondeu ${response.status}. Tente novamente em instantes.`);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("A consulta à base pública de CNPJs demorou demais. Tente novamente.");
    throw error;
  } finally { clearTimeout(timer); }
}

async function consultar(uf: string, cidade: string, cnae: string, pagina: number): Promise<Pagina> {
  const url = new URL("https://cnpj.genesisinnovation.io/api/v1/busca-avancada");
  url.searchParams.set("uf", uf.toUpperCase());
  url.searchParams.set("cidade", cidade);
  url.searchParams.set("cnae", cnae);
  url.searchParams.set("situacao", "ativa");
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("por_pagina", "20");
  return consultarJson<Pagina>(url);
}

async function buscarPorNome(nicho: string, uf: string, cidade: string): Promise<Linha[]> {
  const url = new URL("https://cnpj.genesisinnovation.io/api/v1/busca");
  url.searchParams.set("q", nicho);
  url.searchParams.set("uf", uf.toUpperCase());
  url.searchParams.set("cidade", cidade);
  const pagina = await consultarJson<ResultadoTexto>(url);
  const candidatos = (pagina.resultados ?? []).slice(0, 20);
  // A busca textual fornece CNPJ e nome. Consultamos os detalhes públicos para
  // trazer telefone, e-mail e site quando o cadastro disponibilizar.
  const detalhes: Linha[] = [];
  for (let i = 0; i < candidatos.length; i += 5) {
    const lote = await Promise.all(candidatos.slice(i, i + 5).map(async (candidato) => {
      const cnpj = (candidato.cnpj ?? "").replace(/\D/g, "");
      if (!cnpj) return candidato;
      const detalheUrl = new URL(`https://cnpj.genesisinnovation.io/api/v1/cnpj/${cnpj}`);
      try {
        const detalhe = await consultarJson<DetalheCnpj>(detalheUrl);
        return {
          ...candidato,
          ...detalhe,
          municipio: detalhe.endereco?.municipio ?? detalhe.municipio ?? candidato.municipio,
          uf: detalhe.endereco?.uf ?? detalhe.uf ?? candidato.uf,
          cnae_fiscal_descricao: detalhe.atividade_principal?.descricao,
        };
      } catch {
        return candidato;
      }
    }));
    detalhes.push(...lote);
  }
  return detalhes;
}

/** Busca estabelecimentos ativos por CNAE, cidade e UF na base pública de CNPJ. */
export async function buscarEmpresasCnpj(params: BuscaOsmParams): Promise<BuscaOsmResultado> {
  const grupo = escolherCnaes(params.nicho);
  const codigos = grupo?.codigos ?? [];
  // Busca até três páginas por CNAE, evitando chamadas ilimitadas e priorizando empresas com maior capital.
  const paginasPorCnae = Math.max(1, Math.ceil((params.quantidade ?? 20) / 20));
  const consultas = await Promise.all(codigos.map(async (cnae) => {
    const respostas: Pagina[] = [];
    for (let pagina = 1; pagina <= paginasPorCnae; pagina++) respostas.push(await consultar(params.estado, params.cidade, cnae, pagina));
    return { cnae, respostas };
  }));
  const porNome = !grupo ? await buscarPorNome(params.nicho, params.estado, params.cidade) : [];
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
        nome, razaoSocial: item.razao_social?.trim(), categoria: grupo?.categoria ?? params.nicho,
        cidade: item.municipio || params.cidade, estado: item.uf || params.estado,
        telefone: telefoneLimpo(item.telefone), email: item.email?.trim() || undefined,
        website: typeof item.site === "string" ? item.site : undefined,
        instagram: typeof item.instagram === "string" ? item.instagram : undefined,
        extras: {
          fonte: "Dados abertos CNPJ da Receita Federal", cnae, segmento: grupo?.rotulo ?? params.nicho,
          ...(item.porte ? { porteReceita: item.porte } : {}),
          ...(item.cnae_fiscal_descricao ? { atividadeReceita: item.cnae_fiscal_descricao } : {}),
          ...(item.url ? { urlCadastro: item.url } : {}),
        },
      });
    }
  }
  for (const item of porNome) {
    const cnpj = (item.cnpj ?? "").replace(/\D/g, "");
    const nome = (item.nome_fantasia || item.razao_social || "").trim();
    if (!cnpj || !nome || item.situacao?.toLowerCase() === "inativa") continue;
    const detalhe = item as DetalheCnpj;
    const endereco = detalhe.endereco;
    const linhaEndereco = [
      endereco?.logradouro,
      endereco?.numero,
      endereco?.bairro,
      endereco?.municipio ?? item.municipio,
      endereco?.uf ?? item.uf,
    ].filter(Boolean).join(", ");
    const cnae = detalhe.atividade_principal?.codigo ?? "";
    todos.push({
      osmId: `cnpj:${cnpj}`, idExterno: `cnpj:${cnpj}`, cnpj,
      nome, razaoSocial: item.razao_social?.trim(), categoria: grupo?.categoria ?? params.nicho,
      endereco: linhaEndereco || undefined,
      cidade: endereco?.municipio ?? item.municipio ?? params.cidade,
      estado: endereco?.uf ?? item.uf ?? params.estado,
      telefone: telefoneLimpo(item.telefone), email: item.email?.trim() || undefined,
      website: detalhe.site || undefined, instagram: detalhe.instagram || undefined,
      extras: {
        fonte: "Dados abertos CNPJ da Receita Federal", segmento: grupo?.rotulo ?? params.nicho,
        ...(cnae ? { cnae } : {}), ...(item.porte ? { porteReceita: item.porte } : {}),
        ...(item.cnae_fiscal_descricao ? { atividadeReceita: item.cnae_fiscal_descricao } : {}),
        ...(item.url ? { urlCadastro: item.url } : {}),
      },
    });
  }
  const unicos = [...new Map(todos.map((l) => [l.cnpj, l])).values()];
  const ordenados = unicos.sort((a, b) => Number(Boolean(b.telefone || b.email)) - Number(Boolean(a.telefone || a.email)));
  const contataveis = ordenados.filter((l) => l.telefone || l.email);
  const candidatos = params.incluirSites ? ordenados : contataveis;
  return { lugares: candidatos.slice(0, params.quantidade ?? 20), buscaPorNome: !grupo, totalEncontrado: totalEncontrado || unicos.length, totalContatavel: contataveis.length };
}
