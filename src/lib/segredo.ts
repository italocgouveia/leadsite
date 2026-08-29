import crypto from "node:crypto";

/**
 * Criptografia do token do provedor, em repouso.
 *
 * AES-256-GCM com chave de `SEGREDO_CHAVE`. Sem a variável, o valor é gravado
 * como texto — e a tela DIZ isso, em vez de fingir proteção que não existe.
 * O banco (Neon) já é cifrado em disco; esta camada protege contra quem tem
 * acesso de leitura ao banco mas não ao ambiente da aplicação.
 *
 * O prefixo `enc:v1:` marca o que está cifrado, para conseguir ler valores
 * antigos gravados em texto sem quebrar nada.
 */

const PREFIXO = "enc:v1:";

function chave(): Buffer | null {
  const bruta = process.env.SEGREDO_CHAVE;
  if (!bruta || bruta.length < 16) return null;
  // Deriva 32 bytes de qualquer tamanho de entrada.
  return crypto.createHash("sha256").update(bruta).digest();
}

export function temCriptografia(): boolean {
  return chave() !== null;
}

export function cifrar(texto: string | null): string | null {
  if (!texto) return texto;
  const k = chave();
  if (!k) return texto;

  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const dado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();

  return `${PREFIXO}${iv.toString("base64")}.${tag.toString("base64")}.${dado.toString("base64")}`;
}

export function decifrar(guardado: string | null): string | null {
  if (!guardado) return guardado;
  if (!guardado.startsWith(PREFIXO)) return guardado; // gravado antes da chave existir

  const k = chave();
  if (!k) return null; // cifrado mas sem chave: melhor null que lixo

  try {
    const [iv, tag, dado] = guardado.slice(PREFIXO.length).split(".");
    const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(dado, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
