/**
 * Municípios do Brasil via API pública do IBGE — grátis, sem chave, sem limite.
 * São 5.570 municípios; carregamos por UF sob demanda.
 */

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades";

export type Municipio = { id: number; nome: string };

export const UFS = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
] as const;

export async function municipiosDaUf(uf: string): Promise<Municipio[]> {
  const res = await fetch(`${IBGE}/estados/${uf}/municipios`, {
    // A lista de municípios muda de década em década. Cache agressivo.
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);

  const data = (await res.json()) as Array<{ id: number; nome: string }>;
  return data
    .map((m) => ({ id: m.id, nome: m.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type MunicipioBr = { nome: string; uf: string };

/**
 * TODOS os 5.571 municípios do Brasil, com a UF junto.
 *
 * Carregar a lista inteira (161 KB) uma vez só é melhor que pedir a UF ao
 * usuário: ele digita "Uberlândia" e o sistema sabe que é MG. Some um campo
 * do formulário e a busca deixa de ficar presa a um estado.
 */
export async function todosMunicipios(): Promise<MunicipioBr[]> {
  const res = await fetch(`${IBGE}/municipios`, {
    // A lista muda de década em década. Cache de 30 dias.
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);

  const dados = (await res.json()) as Array<{
    nome: string;
    microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
    "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla?: string } } };
  }>;

  return dados
    .map((m) => ({
      nome: m.nome,
      // O IBGE devolve a UF por dois caminhos diferentes conforme o município.
      uf:
        m.microrregiao?.mesorregiao?.UF?.sigla ??
        m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ??
        "",
    }))
    .filter((m) => m.uf)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
