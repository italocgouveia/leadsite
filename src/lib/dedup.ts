import { validarTelefone, normalizarTelefoneParaComparacao } from "@/lib/telefone";
import { ehPlataformaCompartilhada } from "@/lib/places/audit";
import { instagramDoLead } from "@/lib/canais";

/**
 * O mesmo estabelecimento cadastrado duas vezes.
 *
 * A coleta já evita o caso fácil: o upsert por `placeId` faz rebuscar o mesmo
 * nicho atualizar em vez de duplicar. O que sobra é o caso difícil — o mesmo
 * negócio com DOIS ids diferentes, porque foi mapeado duas vezes no OSM (uma
 * como ponto, outra como área), ou porque veio de fontes diferentes.
 *
 * ORDEM DAS REGRAS, DA MAIS FORTE PARA A MAIS FRACA
 *
 *   CNPJ      → é o identificador legal. Igual = mesma empresa, ponto.
 *   telefone  → duas empresas não dividem uma linha.
 *   domínio   → nem um site.
 *   nome+lugar→ a mais fraca, e a única que pode errar. Por isso exige as
 *               DUAS coisas: "Barbearia do Zé" existe em toda cidade do
 *               Brasil, e casar só por nome juntaria negócios sem relação.
 *
 * Nada aqui apaga nada. As funções dizem se dois cadastros são o mesmo lugar;
 * o que fazer com isso é decisão de quem chama.
 */

/** Sufixos societários e de tratamento que não distinguem um negócio de outro. */
const RUIDO =
  /\b(ltda|me|epp|eireli|mei|s\/?a|sa|cia|comercio|com|industria|ind|servicos|servico|filial|matriz|unidade)\b/g;

/** Palavras de ligação: "Oficina do João" e "Oficina João" são o mesmo lugar. */
const LIGACAO = /\b(do|da|de|dos|das|e|o|a|os|as|em|no|na)\b/g;

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * O nome reduzido ao que realmente identifica o negócio.
 *
 *   "OFICINA DO JOÃO LTDA"  → "oficina joao"
 *   "Oficina João"          → "oficina joao"
 *   "Oficina do João - ME"  → "oficina joao"
 */
export function nomeCanonico(nome: string | null | undefined): string {
  if (!nome) return "";
  return semAcento(nome)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(RUIDO, " ")
    .replace(LIGACAO, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só os dígitos do CNPJ. Vazio quando não há. */
export function cnpjCanonico(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/**
 * O domínio PRÓPRIO do negócio, sem www e sem caminho.
 *
 * Devolve vazio para plataforma compartilhada, e essa exclusão é o ponto: 37
 * leads da base têm `instagram.com` no campo de site, e 16 têm
 * `facebook.com`. Tratar isso como identidade declarava a mesma empresa para
 * negócios que só têm em comum ter perfil numa rede social — foi exatamente o
 * que o teste sobre a base real pegou.
 */
export function dominioCanonico(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  if (ehPlataformaCompartilhada(url)) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

export type Cadastro = {
  nome?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  /** O @ do Instagram é identidade forte: duas empresas não dividem um perfil. */
  instagram?: string | null;
  /** Coordenadas: mesmo ponto no mapa + mesmo nome = mesma ficha em duplicata. */
  lat?: number | null;
  lng?: number | null;
};

/**
 * O telefone do cadastro em UMA forma só.
 *
 * Passa por `validarTelefone` primeiro porque é ele que reconhece o número
 * brasileiro escrito de qualquer jeito e devolve E.164 — inclusive quando o
 * DDI não veio. Isso importa aqui porque os dois campos guardam formas
 * diferentes do MESMO número: `telefone` fica "(34) 99134-5424" e `whatsapp`
 * fica "wa.me/5534991345424". Comparar as duas formas cruas nunca casaria, e
 * a duplicata passaria batida.
 *
 * `normalizarTelefoneParaComparacao` continua como reserva para o que não é
 * telefone BR reconhecível — ela não é chamada antes porque exige o DDI para
 * canonizar, e é justamente o DDI que costuma faltar.
 */
function telefoneCanonico(c: Cadastro): string {
  const bruto = c.telefone?.trim()
    ? c.telefone
    : (c.whatsapp?.match(/wa\.me\/(\d+)/)?.[1] ?? c.whatsapp);
  return validarTelefone(bruto)?.e164 ?? normalizarTelefoneParaComparacao(bruto);
}

/** Cidade + rua + número, reduzidos para comparação. */
function lugarCanonico(
  l: { endereco?: string | null; cidade?: string | null },
): string {
  return semAcento(`${l.endereco ?? ""} ${l.cidade ?? ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export type Veredito = { igual: boolean; motivo: string };

/** Os dois cadastros são o mesmo estabelecimento? */
export function mesmoEstabelecimento(a: Cadastro, b: Cadastro): Veredito {
  const cnpjA = cnpjCanonico(a.cnpj);
  if (cnpjA && cnpjA === cnpjCanonico(b.cnpj)) return { igual: true, motivo: "mesmo CNPJ" };

  const telA = telefoneCanonico(a);
  const telB = telefoneCanonico(b);
  if (telA && telA === telB) return { igual: true, motivo: "mesmo telefone" };

  const domA = dominioCanonico(a.website);
  if (domA && domA === dominioCanonico(b.website)) return { igual: true, motivo: "mesmo domínio" };

  /**
   * Mesmo @ do Instagram é a mesma empresa. Passa por `instagramDoLead`, que
   * extrai e valida o username — sem isso, dois links de POST diferentes do
   * mesmo perfil não casariam, e duas URLs escritas de formas diferentes
   * (`@x`, `instagram.com/x/`, `www.instagram.com/x`) tampouco.
   */
  const igA = instagramDoLead({ instagram: a.instagram ?? null })?.username;
  if (igA && igA === instagramDoLead({ instagram: b.instagram ?? null })?.username) {
    return { igual: true, motivo: "mesmo perfil de Instagram" };
  }

  /**
   * Mesmo PONTO no mapa e mesmo nome: é a ficha duplicada do OpenStreetMap
   * (o lugar mapeado como nó e como área). Exige as duas coisas — coordenada
   * sozinha juntaria lojas vizinhas de um shopping, e nome sozinho juntaria
   * as duas "Barbearia do Zé" da cidade.
   *
   * 11 metros (0,0001°) é a tolerância: o suficiente para o centroide de uma
   * área não bater exatamente no nó, e pouco para alcançar o vizinho.
   */
  const nomeIgual = nomeCanonico(a.nome) && nomeCanonico(a.nome) === nomeCanonico(b.nome);
  if (nomeIgual && a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    if (Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001) {
      return { igual: true, motivo: "mesmo nome no mesmo ponto do mapa" };
    }
  }

  /**
   * Nome igual NÃO basta. Exigir o lugar junto é o que separa "duas fichas da
   * mesma barbearia" de "duas barbearias com o mesmo nome em bairros
   * diferentes" — e o segundo caso é comum o suficiente para o teste existir.
   */
  const nomeA = nomeCanonico(a.nome);
  if (nomeA && nomeA === nomeCanonico(b.nome)) {
    const lugarA = lugarCanonico(a);
    if (lugarA && lugarA === lugarCanonico(b)) {
      return { igual: true, motivo: "mesmo nome e mesmo endereço" };
    }
  }

  return { igual: false, motivo: "" };
}

/**
 * Separa uma lista em únicos e duplicados.
 *
 * O PRIMEIRO de cada grupo vence. Quem chama decide a ordem, e essa ordem é
 * a decisão importante: passando a lista ordenada por completude, o cadastro
 * que fica é o mais rico, e o que sai é o mais pobre.
 */
export function deduplicar<T extends Cadastro>(
  cadastros: T[],
): { unicos: T[]; duplicados: { item: T; de: T; motivo: string }[] } {
  const unicos: T[] = [];
  const duplicados: { item: T; de: T; motivo: string }[] = [];

  for (const c of cadastros) {
    let achou: { item: T; motivo: string } | null = null;
    for (const u of unicos) {
      const v = mesmoEstabelecimento(c, u);
      if (v.igual) {
        achou = { item: u, motivo: v.motivo };
        break;
      }
    }
    if (achou) duplicados.push({ item: c, de: achou.item, motivo: achou.motivo });
    else unicos.push(c);
  }

  return { unicos, duplicados };
}
