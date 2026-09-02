/**
 * Identidade visual extraída do site ATUAL do negócio, quando ele existe e
 * responde — para o site gerado respeitar a marca em vez de inventar uma do
 * zero (ver regra 6 do briefing de geração: "não invente uma identidade
 * completamente diferente").
 *
 * Deliberadamente pobre em ambição: só sinais ESTRUTURADOS e confiáveis
 * (meta tags), nunca "adivinhação" de cor por pixel ou raspagem de conteúdo.
 * Falha em silêncio — um site que não responde, que é só JS, ou que não tem
 * essas tags, devolve `null` e a geração segue no caminho de sempre (cor por
 * ramo). Não é scraping de Instagram: a Instagram bloqueia isso e tentar
 * seria caminho errado — só o SITE do lead, que é HTTP simples.
 */
export type IdentidadeVisual = {
  corDestaque: string | null;
  titulo: string | null;
  descricao: string | null;
  imagemDestaque: string | null;
};

function extrairMeta(html: string, padroes: RegExp[]): string | null {
  for (const p of padroes) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function resolverUrl(bruta: string, base: string): string | null {
  try {
    return new URL(bruta, base).toString();
  } catch {
    return null;
  }
}

export async function extrairIdentidadeDoSite(url?: string | null): Promise<IdentidadeVisual | null> {
  if (!url?.trim()) return null;
  const alvo = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    const res = await fetch(alvo, {
      method: "GET",
      redirect: "follow",
      signal: controle.signal,
      headers: {
        // Cabeçalho e <head> cabem folgado nisso; não precisamos do body inteiro.
        Range: "bytes=0-40000",
        "User-Agent": "Mozilla/5.0 (compatible; LeadSiteBot/1.0)",
      },
    });
    if (!res.ok && res.status !== 206) return null;
    const html = await res.text();

    const corBruta = extrairMeta(html, [
      /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    ]);
    // Só aceita o que realmente parece cor — não repassa lixo pro prompt.
    const corDestaque = corBruta && /^#[0-9a-f]{3,8}$|^rgba?\(/i.test(corBruta.trim()) ? corBruta.trim() : null;
    const titulo = extrairMeta(html, [/<title[^>]*>([^<]{2,120})<\/title>/i]);
    const descricao = extrairMeta(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{2,300})["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{2,300})["']/i,
    ]);
    const imagemBruta = extrairMeta(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const imagemDestaque = imagemBruta ? resolverUrl(imagemBruta, alvo) : null;

    if (!corDestaque && !titulo && !descricao && !imagemDestaque) return null;
    return { corDestaque, titulo, descricao, imagemDestaque };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
