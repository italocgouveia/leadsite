import type { AnaliseSite } from "@/lib/analise-site";
import { validarTelefone } from "@/lib/telefone";
import { NAO_E_PERFIL } from "@/lib/canais";
import { ehPlataformaCompartilhada } from "@/lib/places/audit";
import { baixarPagina, validarUrl, type Transporte } from "./http";

type Contatos = { whatsapp: string | null; instagram: string | null; email: string | null; telefones: string[] };
export type Raspagem = { analise: AnaliseSite; paginas: string[]; fontes: Partial<Record<"whatsapp" | "instagram" | "email" | "telefone", string>>; avisos: string[] };

function entidades(s: string) {
  return s.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
    const n = parseInt(hex || dec, hex ? 16 : 10);
    return n <= 0x10ffff ? String.fromCodePoint(n) : "";
  }).replace(/&nbsp;/gi, " ");
}

export function extrairContatos(html: string): Contatos {
  // Scripts de rastreamento e CSS não são canais de contato. JSON-LD só fornece campos explícitos.
  const estruturados: string[] = [];
  function lerLd(v: unknown, profundidade = 0) {
    if (!v || typeof v !== "object" || profundidade > 8) return;
    for (const [k, x] of Object.entries(v)) {
      if (["telephone", "email", "sameAs"].includes(k)) {
        for (const valor of Array.isArray(x) ? x : [x]) if (typeof valor === "string") estruturados.push(valor);
      } else if (typeof x === "object") lerLd(x, profundidade + 1);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { lerLd(JSON.parse(m[1])); } catch { /* JSON inválido não impede os demais canais. */ }
  }
  const limpo = entidades(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " "));
  const links = [...limpo.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
  const contatos: Contatos = { whatsapp: null, instagram: null, email: null, telefones: [] };
  const numeros = new Set<string>();
  for (const link of [...links, ...estruturados]) {
    if (/^tel:/i.test(link) || /^\+?[\d ()-]{10,}$/.test(link)) {
      const t = validarTelefone(link.replace(/^tel:/i, ""));
      if (t) numeros.add(t.e164);
    }
    try {
      const u = new URL(link.startsWith("//") ? `https:${link}` : link);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(host)) {
        const v = validarTelefone(host === "wa.me" ? u.pathname.slice(1) : u.searchParams.get("phone"));
        if (v && !contatos.whatsapp) contatos.whatsapp = v.e164;
      }
      if (host === "instagram.com") {
        const perfil = u.pathname.split("/").filter(Boolean);
        if (perfil.length === 1 && /^[\w.]{2,30}$/.test(perfil[0]) && !NAO_E_PERFIL.has(perfil[0].toLowerCase()) && !contatos.instagram) contatos.instagram = `https://instagram.com/${perfil[0]}`;
      }
    } catch { /* tel/mailto/links relativos são tratados separadamente. */ }
  }
  const texto = `${limpo.replace(/<[^>]*>/g, " ")} ${estruturados.join(" ")}`;
  for (const m of texto.matchAll(/(?:\+55\s*)?\(?\d{2}\)?\s+9?\d{4}[-\s]\d{4}\b/g)) {
    const t = validarTelefone(m[0]); if (t) numeros.add(t.e164);
  }
  // Links mailto têm prioridade sobre texto solto. Rejeita e-mails técnicos usuais.
  const emails = [...links.filter(l => /^mailto:/i.test(l)), ...estruturados, texto].join(" ");
  for (const m of emails.matchAll(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi)) {
    if (!/(sentry|example|wixpress|noreply|no-reply|\.(png|jpg|svg|webp)$)/i.test(m[0])) { contatos.email = m[0].toLowerCase(); break; }
  }
  contatos.telefones = [...numeros].slice(0, 5);
  return contatos;
}

export function permitidoRobots(txt: string, caminho: string): boolean {
  const grupos: { agentes: string[]; regras: { permite: boolean; caminho: string }[] }[] = [];
  let atual = { agentes: [] as string[], regras: [] as { permite: boolean; caminho: string }[] };
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.split("#")[0].match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const [, chave, valor] = m;
    if (chave.toLowerCase() === "user-agent") {
      if (atual.regras.length) { grupos.push(atual); atual = { agentes: [], regras: [] }; }
      atual.agentes.push(valor.toLowerCase());
    } else if (["allow", "disallow"].includes(chave.toLowerCase()) && valor) {
      atual.regras.push({ permite: chave.toLowerCase() === "allow", caminho: valor });
    }
  }
  grupos.push(atual);
  const especificos = grupos.filter(g => g.agentes.some(a => a !== "*" && "icgleadbot".includes(a)));
  const aplicaveis = especificos.length ? especificos : grupos.filter(g => g.agentes.includes("*"));
  const regras = aplicaveis.flatMap(g => g.regras).filter(r => {
    const exp = r.caminho.split("*").map(p => p.replace(/[.+?^{}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${exp}`).test(caminho);
  }).sort((a, b) => b.caminho.length - a.caminho.length || Number(b.permite) - Number(a.permite));
  return regras[0]?.permite ?? true;
}

export function linksContato(html: string, base: URL): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/contat|contact|fale.conosco|atendimento|sobre|about/i.test(`${m[1]} ${m[2]}`)) continue;
    try {
      const u = new URL(entidades(m[1]), base);
      u.hash = "";
      if (u.origin === base.origin && !u.search && u.href !== base.href && !/logout|login|sair|delete|excluir/i.test(u.pathname)) links.add(u.href);
    } catch { /* Link inválido. */ }
  }
  return [...links].slice(0, 2);
}

export async function rasparSite(entrada: string, transporte: Transporte = baixarPagina): Promise<Raspagem> {
  const paginas: string[] = [], fontes: Raspagem["fontes"] = {}, avisos: string[] = [];
  const signal = AbortSignal.timeout(20_000);
  const robots = new Map<string, string>();
  const cache = new Map<string, Awaited<ReturnType<Transporte>>>();
  async function baixar(u: URL) {
    validarUrl(u); signal.throwIfAborted();
    const chave = u.href;
    if (!cache.has(chave)) cache.set(chave, await transporte(u, signal));
    return cache.get(chave)!;
  }
  async function regras(u: URL) {
    if (robots.has(u.origin)) return robots.get(u.origin)!;
    let alvo = new URL("/robots.txt", u.origin);
    for (let i = 0; i < 4; i++) {
      const r = await baixar(alvo);
      if (r.status >= 300 && r.status < 400 && r.location) { alvo = new URL(r.location, alvo); continue; }
      if (r.status === 429 || r.status >= 500) throw new Error("Site temporariamente indisponível para coleta.");
      const txt = r.status >= 200 && r.status < 300 ? r.html : "";
      robots.set(u.origin, txt); return txt;
    }
    throw new Error("Redirecionamentos excessivos em robots.txt.");
  }
  async function pagina(entradaUrl: URL) {
    let u = entradaUrl;
    for (let i = 0; i < 4; i++) {
      if (!permitidoRobots(await regras(u), u.pathname + u.search)) throw new Error("Coleta não permitida pelo robots.txt.");
      const r = await baixar(u);
      if (r.status >= 300 && r.status < 400 && r.location) {
        const proxima = new URL(r.location, u);
        if (proxima.hostname.replace(/^www\./, "") !== entradaUrl.hostname.replace(/^www\./, "")) throw new Error("Site redireciona para outro domínio; revise o cadastro.");
        u = proxima; continue;
      }
      if (r.status < 200 || r.status >= 300) throw new Error(`Site respondeu HTTP ${r.status}.`);
      if (!r.tipo.toLowerCase().includes("html")) throw new Error("O endereço não retornou uma página HTML.");
      return { url: u, html: r.html };
    }
    throw new Error("Muitos redirecionamentos no site.");
  }
  try {
    const alvo = new URL(/^https?:\/\//i.test(entrada) ? entrada : `https://${entrada}`);
    validarUrl(alvo);
    if (ehPlataformaCompartilhada(alvo.href)) throw new Error("Informe o site próprio da empresa, não um perfil social ou diretório.");
    const home = await pagina(alvo);
    const contatos: Contatos = { whatsapp: null, instagram: null, email: null, telefones: [] };
    let bytes = 0;
    function incorporar(p: { url: URL; html: string }) {
      paginas.push(p.url.href); bytes += Buffer.byteLength(p.html);
      const extraidos = extrairContatos(p.html);
      for (const campo of ["whatsapp", "instagram", "email"] as const) {
        if (!contatos[campo] && extraidos[campo]) { contatos[campo] = extraidos[campo]; fontes[campo] = p.url.href; }
      }
      if (!contatos.telefones.length && extraidos.telefones.length) { contatos.telefones = extraidos.telefones; fontes.telefone = p.url.href; }
    }
    incorporar(home);
    for (const url of linksContato(home.html, home.url)) {
      try { incorporar(await pagina(new URL(url))); }
      catch (e) { avisos.push(e instanceof Error ? e.message : "Não foi possível ler uma página de contato."); }
    }
    return { analise: { ok: true, url: home.url.href, host: home.url.hostname.replace(/^www\./, ""), ...contatos, redes: [], servicos: [], sinais: [], bytes }, paginas, fontes, avisos };
  } catch (e) {
    return { analise: { ok: false, url: entrada, motivo: signal.aborted ? "O site excedeu o tempo de coleta." : e instanceof Error ? e.message : "Falha na coleta." }, paginas, fontes, avisos };
  }
}
