/**
 * Google Places API (New) — CAMINHO DE UPGRADE, não está em uso.
 *
 * A rota /api/leads/search usa hoje `lib/osm/search.ts` (OpenStreetMap), que é
 * grátis e não pede cartão. Este arquivo fica pronto para o dia em que você
 * quiser dados melhores: notas, número de avaliações, fotos reais do
 * estabelecimento e cobertura muito maior.
 *
 * Para ligar:
 *  1. Preencha GOOGLE_PLACES_API_KEY (exige faturamento ativo no Google Cloud);
 *  2. Em src/app/api/leads/search/route.ts, troque `buscarNoOsm` por
 *     `buscarPlaces` e volte a passar `nota`/`avaliacoes` no calcularScore.
 *
 * A FieldMask define o preço da chamada — pedir campo a mais custa mais caro.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.photos",
  "nextPageToken",
].join(",");

export type PlaceBruto = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
};

export type BuscaParams = {
  nicho: string;
  cidade: string;
  estado: string;
  bairro?: string;
  quantidade?: number;
};

export async function buscarPlaces({
  nicho,
  cidade,
  estado,
  bairro,
  quantidade = 20,
}: BuscaParams): Promise<{ places: PlaceBruto[]; chamadasApi: number }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY não configurada. Veja o README.");
  }

  const local = bairro?.trim() ? `${bairro}, ${cidade}, ${estado}` : `${cidade}, ${estado}`;
  const textQuery = `${nicho} em ${local}, Brasil`;

  const places: PlaceBruto[] = [];
  let pageToken: string | undefined;
  let chamadasApi = 0;

  // Places devolve no máximo 20 por página e 3 páginas (60 resultados).
  while (places.length < quantidade && chamadasApi < 3) {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: Math.min(20, quantidade - places.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    chamadasApi++;

    if (!res.ok) {
      throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }

    const data = (await res.json()) as { places?: PlaceBruto[]; nextPageToken?: string };
    const lote = data.places ?? [];
    places.push(...lote);

    if (!data.nextPageToken || lote.length === 0) break;
    pageToken = data.nextPageToken;
  }

  const ativos = places.filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY");
  return { places: ativos.slice(0, quantidade), chamadasApi };
}

/** URL de uma foto do estabelecimento (o grande ganho sobre o OSM). */
export function urlDaFoto(photoName: string, maxWidthPx = 1200): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
}

export function extrairBairro(place: PlaceBruto): string | undefined {
  const comps = place.addressComponents ?? [];
  return comps.find(
    (c) => c.types?.includes("sublocality") || c.types?.includes("sublocality_level_1"),
  )?.longText;
}
