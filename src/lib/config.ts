import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";

export const CONFIG_ID = "default";

/**
 * Linha única de configuração.
 *
 * Antes retornava null enquanto ninguém tivesse salvado, e aí a tela mostrava
 * "marca d'água ligada" enquanto nenhum site saía com marca d'água. Agora o
 * padrão é explícito e igual nos dois lugares.
 */
export const CONFIG_PADRAO = {
  id: CONFIG_ID,
  // Desligada por padrão: marca d'água em site de cliente é decisão sua, e o
  // texto padrão anunciava o nome de outra ferramenta nos seus sites.
  marcaDaguaAtiva: false,
  marcaDaguaTexto: "",
  marcaDaguaUrl: null,
  pixelFacebook: null,
  googleAnalytics: null,
  googleAds: null,
  atualizadoEm: new Date(),
};

export async function carregarConfig() {
  const [config] = await db
    .select()
    .from(configuracoes)
    .where(eq(configuracoes.id, CONFIG_ID))
    .limit(1);
  return config ?? CONFIG_PADRAO;
}
