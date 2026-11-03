import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type Pagina = { status: number; html: string; tipo: string; location?: string };
export type Transporte = (url: URL, signal: AbortSignal) => Promise<Pagina>;

/** IPv4 público apenas. Resolve uma vez e fixa o endereço no socket (anti-rebinding). */
export function ipPublico(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function validarUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !url.hostname.includes(".") || (isIP(url.hostname) && !ipPublico(url.hostname)) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) {
    throw new Error("O scraper aceita apenas sites públicos HTTP/HTTPS.");
  }
}

export const baixarPagina: Transporte = async (url, signal) => {
  validarUrl(url);
  signal.throwIfAborted();
  const enderecos = await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
    const abortar = () => reject(new Error("Tempo de resolução do site excedido."));
    signal.addEventListener("abort", abortar, { once: true });
    lookup(url.hostname, { all: true, family: 4 }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abortar));
  });
  signal.throwIfAborted();
  if (!enderecos.length || enderecos.some(e => !ipPublico(e.address))) throw new Error("Endereço de rede não permitido.");
  const endereco = enderecos[0].address;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      signal, agent: false, family: 4,
      lookup: (_hostname, _options, callback) => callback(null, endereco, 4),
      headers: { "User-Agent": "ICGLeadBot/1.0", Accept: "text/html,text/plain", "Accept-Encoding": "identity" },
    }, res => {
      const partes: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) { req.destroy(new Error("Página excede o limite de 1 MB.")); return; }
        partes.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode ?? 500, tipo: res.headers["content-type"] ?? "", html: Buffer.concat(partes).toString("utf8"), location: res.headers.location }));
    });
    req.on("error", reject);
    req.end();
  });
};
