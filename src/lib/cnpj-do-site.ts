import { extrairDeTexto } from "@/lib/cnpj";

/**
 * Tenta achar o CNPJ no site do próprio lead.
 *
 * Site pequeno brasileiro costuma carimbar o CNPJ no rodapé, junto com o
 * endereço. Não é regra: medido nos sites dos leads reais desta base, só
 * 3 de 25 traziam um CNPJ válido. Por isso isto é um ATALHO, não o caminho
 * principal — quando falha, você digita o número na mão e segue.
 *
 * Busca também em /contato e /sobre, que é onde mora quando não está no rodapé.
 */

const CAMINHOS_EXTRA = ["/contato", "/sobre", "/quem-somos"];

async function baixar(url: string): Promise<string | null> {
  try {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 9_000);

    const res = await fetch(url, {
      signal: controle.signal,
      redirect: "follow",
      headers: {
        // Sem User-Agent de navegador, muito servidor devolve 403.
        "User-Agent":
          "Mozilla/5.0 (compatible; leadsite/1.0; prospecção B2B)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(relogio);

    if (!res.ok) return null;
    const tipo = res.headers.get("content-type") ?? "";
    if (!tipo.includes("html")) return null;

    return await res.text();
  } catch {
    return null;
  }
}

export async function acharCnpjNoSite(site: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(site)) return null;
  // Rede social não tem rodapé com CNPJ; nem vale a requisição.
  if (/instagram\.com|facebook\.com|linktr\.ee|wa\.me/i.test(site)) return null;

  let base: URL;
  try {
    base = new URL(site);
  } catch {
    return null;
  }

  const paginas = [site, ...CAMINHOS_EXTRA.map((c) => new URL(c, base).toString())];

  for (const pagina of paginas) {
    const html = await baixar(pagina);
    if (!html) continue;

    const achados = extrairDeTexto(html);
    // Só o primeiro válido: quando há vários, o do rodapé (o da empresa) vem
    // antes dos de parceiros ou da agência que fez o site.
    if (achados.length) return achados[0];
  }

  return null;
}
