import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarEGravar } from "@/lib/coletar";
import { buscarNoPlaces } from "@/lib/places/adaptador";

export const maxDuration = 120;

const Body = z.object({
  nicho: z.string().min(2),
  cidade: z.string().min(2),
  estado: z.string().min(2),
  bairro: z.string().optional(),
  quantidade: z.number().int().min(1).max(60).default(20),
  /**
   * De onde vêm os leads. A TELA NÃO EXPÕE ISTO — só `osm` acontece na
   * prática. O caminho do Places fica pronto, e dormente, de propósito.
   *
   * `osm` é grátis e sem cartão, mas só serve para ramo que o mapa cobre:
   * comércio de rua, restaurante, oficina, pousada, salão. Ramo de SERVIÇO
   * não está lá — medido em 02/09/2026, "empresa de energia solar" não tem
   * tag no OSM, e a busca por nome devolve pousada, porque "Solar" em
   * português é casarão ("Pousada Solar dos Ipês"): 239 acertos desses em
   * Minas, nenhuma empresa de energia solar.
   *
   * `places` resolveria isso, mas custa por chamada e exige faturamento
   * ativo no Google Cloud — que travou no erro OR_BACR2_59 (recusa de
   * cartão) em 02/09/2026, então o seletor saiu da tela. Para religar:
   * preencha GOOGLE_PLACES_API_KEY e volte a mandar `fonte: "places"` daqui.
   *
   * NUNCA vira fallback automático: se o padrão caísse no Places quando o
   * OSM não acha nada, uma busca vazia viraria conta no cartão sem ninguém
   * ter pedido.
   */
  fonte: z.enum(["osm", "places"]).default("osm"),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const usandoPlaces = params.fonte === "places";

  let resultado;
  try {
    resultado = await buscarEGravar(params, usandoPlaces ? buscarNoPlaces : undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na busca";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  const fonteNome = usandoPlaces ? "no Google" : "no OpenStreetMap";

  if (!resultado.salvos.length) {
    return NextResponse.json({
      leads: [],
      fonte: params.fonte,
      buscaPorNome: resultado.buscaPorNome,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
      aviso: resultado.totalEncontrado
        ? `Achei ${resultado.totalEncontrado} estabelecimento(s) desse nicho, mas nenhum tem telefone, Instagram ou e-mail ${fonteNome} — não daria pra abordar. Tente outro nicho ou outra cidade.`
        : usandoPlaces
          ? "O Google não retornou nenhum negócio desse nicho nessa cidade. Tente um termo mais comum ou uma cidade maior."
          : "Nenhum negócio mapeado no OpenStreetMap para esse nicho/cidade. Ramo de serviço (energia solar, contabilidade, advocacia) quase não é mapeado — nesses casos use a fonte Google.",
    });
  }

  return NextResponse.json({
    leads: resultado.salvos,
    fonte: params.fonte,
    buscaPorNome: resultado.buscaPorNome,
    totalEncontrado: resultado.totalEncontrado,
    totalContatavel: resultado.totalContatavel,
    // Explica o número: você pediu 20 e recebeu 4 porque só 4 dos 51 mapeados
    // têm contato. Sem isso, parece que a busca falhou.
    aviso: resultado.buscaPorNome
      ? "Esse nicho não tem categoria própria no OpenStreetMap, então busquei pelo nome do estabelecimento. O resultado costuma vir menor — para ramo de serviço, a fonte Google traz muito mais."
      : resultado.salvos.length < params.quantidade
        ? `${resultado.totalEncontrado} estabelecimento(s) desse nicho encontrados, mas só ${resultado.totalContatavel} têm telefone, Instagram ou e-mail. Mostro apenas os que dá pra abordar.`
        : null,
  });
}
