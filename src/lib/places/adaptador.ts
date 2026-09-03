import { buscarPlaces, urlDaFoto, type PlaceBruto } from "./search";
import type { BuscaOsmParams, BuscaOsmResultado, LugarOsm } from "@/lib/osm/search";

/**
 * Google Places falando a língua do pipeline.
 *
 * `buscarEGravar` (lib/coletar.ts) recebe um buscador injetável e faz o
 * resto — auditar site, pontuar, gravar sem sobrescrever etapa do funil.
 * Em vez de duplicar isso para o Places, este adaptador converte o
 * resultado dele no MESMO formato do OSM. Trocar a fonte da busca vira
 * trocar um argumento.
 *
 * POR QUE O PLACES EXISTE AQUI: medido em 02/09/2026, o OSM não serve para
 * ramo de serviço. "empresa de energia solar" não tem tag no OSM, e a busca
 * por nome devolve pousada — "Solar" em português é casarão ("Pousada Solar
 * dos Ipês", "Hotel Solar do Rosário"). Foram 239 acertos desses em Minas e
 * nenhuma empresa de energia solar. O Places é diretório de empresa, não
 * mapa: acha o ramo e ainda traz nota e número de avaliações, que é o sinal
 * mais forte da pontuação (ver lib/pontuacao.ts) e o único dado de prova
 * social que a mensagem pode citar sem inventar.
 *
 * CUSTO: cada chamada é cobrada por FieldMask (ver `search.ts`). Por isso a
 * fonte é escolhida explicitamente por quem chama, nunca por fallback
 * automático — cair no Places sozinho gastaria dinheiro sem ninguém pedir.
 */

/** Extrai cidade/estado/bairro dos componentes de endereço do Places. */
function pedacosDoEndereco(p: PlaceBruto): {
  cidade?: string;
  estado?: string;
  bairro?: string;
} {
  const achar = (tipo: string) =>
    p.addressComponents?.find((c) => c.types?.includes(tipo));

  return {
    // "administrative_area_level_2" é o município no Brasil; locality falha
    // em cidade que é distrito.
    cidade:
      achar("administrative_area_level_2")?.longText ?? achar("locality")?.longText,
    // shortText vem como "MG"; o pipeline normaliza de novo por segurança.
    estado: achar("administrative_area_level_1")?.shortText,
    bairro: achar("sublocality_level_1")?.longText ?? achar("sublocality")?.longText,
  };
}

function paraLugar(p: PlaceBruto, nichoPedido: string): LugarOsm {
  const { cidade, estado, bairro } = pedacosDoEndereco(p);

  return {
    // Prefixo marca a origem: o pipeline grava como placeId e é o que impede
    // o mesmo negócio entrar duas vezes vindo de fontes diferentes.
    osmId: p.id,
    idExterno: `places:${p.id}`,
    nome: p.displayName?.text ?? "(sem nome)",
    // O tipo do Google ("Instalação de painéis solares") é mais específico
    // que o nicho digitado, então vence quando existe.
    categoria: p.primaryTypeDisplayName?.text ?? nichoPedido,
    endereco: p.formattedAddress,
    cidade,
    estado,
    bairro,
    telefone: p.nationalPhoneNumber,
    website: p.websiteUri,
    nota: p.rating,
    avaliacoes: p.userRatingCount,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    mapsUrl: p.googleMapsUri,
    // Foto real do estabelecimento — o gerador de site usa quando existe.
    fotos: (p.photos ?? []).slice(0, 3).map((f) => urlDaFoto(f.name)),
  };
}

/** Um lead sem canal de contato não dá pra abordar — mesma regra do OSM. */
function temContato(l: LugarOsm): boolean {
  return Boolean(l.telefone || l.instagram || l.email || l.facebook);
}

/**
 * Mesma assinatura de `buscarNoOsm`, para entrar direto em `buscarEGravar`.
 */
export async function buscarNoPlaces({
  nicho,
  cidade,
  estado,
  bairro,
  quantidade = 20,
  soContataveis = true,
}: BuscaOsmParams): Promise<BuscaOsmResultado> {
  /**
   * Pede mais do que precisa quando vai filtrar por contato, mas com folga
   * MENOR que a do OSM (lá são 600, aqui 60): no Places cada página é uma
   * chamada cobrada, e ele já devolve telefone na maioria dos comércios.
   */
  const alvo = soContataveis ? Math.min(60, quantidade * 3) : quantidade;

  const { places } = await buscarPlaces({ nicho, cidade, estado, bairro, quantidade: alvo });

  const lugares = places.map((p) => paraLugar(p, nicho));
  const contataveis = lugares.filter(temContato);

  return {
    lugares: (soContataveis ? contataveis : lugares).slice(0, quantidade),
    // O Places busca por texto, não por tag: nunca é o fallback por nome do OSM.
    buscaPorNome: false,
    totalEncontrado: lugares.length,
    totalContatavel: contataveis.length,
  };
}
