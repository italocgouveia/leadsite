import type { Configuracao } from "@/lib/db/schema";

/**
 * Pixels e marca d'água são injetados DEPOIS da geração, não pedidos no prompt.
 *
 * Motivo: se o modelo escrever o pixel, ele erra o ID uma vez em cada dez e você
 * só descobre quando o cliente reclama que não rastreia. Injeção por string é
 * chata mas é exata — e permite ligar/desligar sem regerar o site.
 */

function tagFacebook(pixelId: string): string {
  return `
<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(pixelId)});
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1"/></noscript>`;
}

function tagGoogle(id: string): string {
  // Mesma tag serve pro GA4 (G-XXXX) e pro Google Ads (AW-XXXX).
  return `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(id)});
</script>`;
}

function tagMarcaDagua(texto: string, url?: string | null): string {
  const conteudo = url
    ? `<a href="${escaparAtributo(url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${escaparHtml(texto)}</a>`
    : escaparHtml(texto);

  return `
<!-- marca d'água -->
<div style="position:fixed;left:12px;bottom:12px;z-index:9998;font:500 11px/1 system-ui,-apple-system,sans-serif;color:#64748b;background:rgba(255,255,255,.92);padding:6px 10px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.12);pointer-events:auto">${conteudo}</div>`;
}

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function escaparAtributo(s: string): string {
  return escaparHtml(s).replace(/`/g, "&#96;");
}

/** Injeta antes do </head> (pixels) e do </body> (marca d'água). */
export function injetarNoSite(html: string, config: Configuracao | null): string {
  if (!config) return html;

  const head: string[] = [];
  if (config.pixelFacebook?.trim()) head.push(tagFacebook(config.pixelFacebook.trim()));
  if (config.googleAnalytics?.trim()) head.push(tagGoogle(config.googleAnalytics.trim()));
  if (config.googleAds?.trim()) head.push(tagGoogle(config.googleAds.trim()));

  const body: string[] = [];
  if (config.marcaDaguaAtiva && config.marcaDaguaTexto?.trim()) {
    body.push(tagMarcaDagua(config.marcaDaguaTexto.trim(), config.marcaDaguaUrl));
  }

  let saida = html;

  if (head.length) {
    saida = inserirAntes(saida, "</head>", head.join("\n"));
  }
  if (body.length) {
    saida = inserirAntes(saida, "</body>", body.join("\n"));
  }

  return saida;
}

function inserirAntes(html: string, tag: string, conteudo: string): string {
  const idx = html.toLowerCase().lastIndexOf(tag);
  if (idx === -1) return html + conteudo; // HTML malformado: melhor anexar que perder
  return html.slice(0, idx) + conteudo + "\n" + html.slice(idx);
}

/**
 * Remove marca d'água e pixels de um HTML já injetado, pra reinjetar do zero.
 * Necessário porque a config muda e os sites já publicados precisam acompanhar.
 */
export function limparInjecoes(html: string): string {
  return html
    .replace(/\n?<!-- Meta Pixel -->[\s\S]*?<\/noscript>/gi, "")
    .replace(/\n?<!-- Google tag \(gtag\.js\) -->[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/gi, "")
    .replace(/\n?<!-- marca d'água -->[\s\S]*?<\/div>/gi, "");
}
