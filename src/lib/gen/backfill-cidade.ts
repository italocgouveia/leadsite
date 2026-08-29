import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { and, isNull, isNotNull, sql } from "drizzle-orm";
import { db, leads } from "@/lib/db";
import { siglaDoEstado } from "@/lib/categoria-nome";

/**
 * Preenche cidade/estado a partir das coordenadas, para leads sem município.
 *
 * Existe por duas razões, e a segunda é um erro meu: a busca por cachoeira
 * varre um estado inteiro e nem todo lead tem `addr:city` no mapa; e uma
 * limpeza que eu rodei apagou a cidade de leads legítimos, porque a lista de
 * "nomes de estado a zerar" incluía São Paulo e Rio de Janeiro — que são
 * também nomes de CIDADE.
 *
 * A coordenada é a fonte confiável: ela não depende de quem preencheu a tag.
 *
 * Nominatim pede 1 requisição por segundo. Serial e com pausa, sempre.
 */
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const alvos = await db
    .select({ id: leads.id, lat: leads.lat, lng: leads.lng })
    .from(leads)
    .where(and(isNull(leads.cidade), isNotNull(leads.lat), isNotNull(leads.lng)));

  console.log(`leads sem cidade e com coordenada: ${alvos.length}`);
  let ok = 0;
  let vazio = 0;

  for (const [i, l] of alvos.entries()) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${l.lat}&lon=${l.lng}&format=json&zoom=10&addressdetails=1`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "LeadSite/1.0 (ferramenta pessoal de prospeccao)",
          "Accept-Language": "pt-BR",
        },
      });
      if (r.ok) {
        const j = (await r.json()) as { address?: Record<string, string> };
        const a = j.address ?? {};
        const cidade = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
        const uf = siglaDoEstado(a.state);
        if (cidade) {
          await db
            .update(leads)
            .set({ cidade, ...(uf ? { estado: uf } : {}) })
            .where(sql`${leads.id} = ${l.id}`);
          ok++;
        } else {
          vazio++;
        }
      }
    } catch {
      // Segue: um lead sem cidade cai em "aqui na região", que é verdadeiro.
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${alvos.length}  resolvidos: ${ok}`);
    await dormir(1150);
  }

  console.log(`\nresolvidos: ${ok}  |  sem município no mapa: ${vazio}`);
}

main().then(() => process.exit(0));
