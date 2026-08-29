import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";
import { decifrar } from "@/lib/segredo";
import { provedorDe, type ConfigProvedor, type TipoProvedor } from "@/lib/providers";

/**
 * Estado da integração de WhatsApp.
 *
 * A configuração deixou de ser uma URL escrita à mão e virou partes:
 * tipo + base + instância + token. O sistema monta o endereço de envio, e por
 * isso não existe mais o erro que originou este arquivo — colar o webhook no
 * campo da API. A validação continua, porque ainda dá para digitar a base
 * errada.
 *
 *   API DE ENVIO  →  o sistema chama o provedor   (saída)
 *   WEBHOOK       →  o provedor chama o sistema   (entrada)
 */

export type Pendencia = { item: string; feito: boolean };

export type Estado = {
  pronta: boolean;
  tipo: TipoProvedor | null;
  baseUrl: string | null;
  instancia: string | null;
  endpointCustom: string | null;
  temToken: boolean;
  urlDeEnvio: string | null;
  /** Última verificação bem-sucedida. */
  testadoEm: Date | null;
  estadoProvedor: string | null;
  webhookUltimoEm: Date | null;
  erro: string | null;
  comoCorrigir: string[];
  pendencias: Pendencia[];
  aviso: string | null;
};

/** Caminhos que pertencem a ESTE sistema — provedor nunca aponta para cá. */
const NOSSAS_ROTAS = ["/api/automacao", "/api/externo", "/api/campanhas", "/api/metricas"];

function ehLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)$/i.test(host);
}

/**
 * Valida a URL BASE do provedor.
 *
 * Recusa quando aponta para uma rota do próprio sistema — é o erro clássico,
 * e ele fazia cada mensagem virar erro sem pista nenhuma do motivo.
 */
export function validarBaseUrl(bruta: string | null | undefined): {
  ok: boolean;
  erro?: string;
  comoCorrigir?: string[];
  aviso?: string;
} {
  const v = (bruta ?? "").trim();
  if (!v) {
    return {
      ok: false,
      erro: "URL da API não informada.",
      comoCorrigir: ["Informe onde sua API roda, ex: http://localhost:8080"],
    };
  }

  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return {
      ok: false,
      erro: "Não é uma URL válida.",
      comoCorrigir: ["Precisa começar com http:// ou https://"],
    };
  }

  if (!/^https?:$/.test(u.protocol)) {
    return { ok: false, erro: `Protocolo "${u.protocol}" não serve.`, comoCorrigir: ["Use http:// ou https://"] };
  }

  if (NOSSAS_ROTAS.some((r) => u.pathname.startsWith(r)) || /webhook|\/status\b/i.test(u.pathname)) {
    return {
      ok: false,
      erro: "Você colocou o webhook deste sistema no campo da API de envio.",
      comoCorrigir: [
        "A API de envio é o endereço do SEU servidor de WhatsApp, ex: http://localhost:8080",
        "O webhook deste sistema vai no painel do provedor, na seção 📥 abaixo",
        "Aqui só a base: sem /message/sendText, sem instância, sem token",
      ],
    };
  }

  if (u.pathname !== "/" && u.pathname !== "") {
    return {
      ok: true,
      aviso: `A URL tem um caminho ("${u.pathname}"). O sistema monta o endpoint sozinho — normalmente só a base basta.`,
    };
  }

  if (ehLocal(u.hostname)) {
    return {
      ok: true,
      aviso:
        "Aponta para localhost: funciona com o painel rodando na sua máquina, mas a versão publicada na Vercel não enxerga seu computador. Para disparar de lá, exponha a API (Cloudflare Tunnel, ngrok) e use o endereço público.",
    };
  }

  return { ok: true };
}

/** A URL que o provedor deve chamar. Montada, nunca digitada. */
export function urlDoWebhook(origem: string): string {
  return `${origem.replace(/\/+$/, "")}/api/automacao/status`;
}

/** Webhook precisa ser alcançável de fora. localhost nunca é. */
export function validarWebhook(origem: string): { ok: boolean; aviso?: string } {
  try {
    const u = new URL(origem);
    if (ehLocal(u.hostname)) {
      return {
        ok: false,
        aviso:
          "Seu webhook precisa ser público para receber eventos. localhost só funciona dentro da sua máquina — use um domínio público ou um túnel de desenvolvimento.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, aviso: "Não consegui ler o endereço público do sistema." };
  }
}

/** Lê a config e devolve o objeto que os adaptadores consomem. */
export async function lerConfigProvedor(): Promise<ConfigProvedor | null> {
  const [c] = await db.select().from(configuracoes).limit(1);
  if (!c?.provedorBaseUrl) return null;

  return {
    tipo: (c.provedorTipo ?? "evolution") as TipoProvedor,
    baseUrl: c.provedorBaseUrl,
    instancia: c.provedorInstancia ?? "",
    apiKey: decifrar(c.provedorToken),
    endpointCustom: c.provedorEndpointCustom,
  };
}

/**
 * Diagnóstico completo, com checklist do que falta.
 *
 * A versão anterior devolvia só "erro: string". Uma lista do que está feito e
 * do que falta responde "o que eu faço agora?", que é a pergunta real de quem
 * vê a campanha bloqueada.
 */
export async function estadoIntegracao(): Promise<Estado> {
  const [c] = await db.select().from(configuracoes).limit(1);

  const tipo = (c?.provedorTipo ?? null) as TipoProvedor | null;
  const baseUrl = c?.provedorBaseUrl ?? null;
  const instancia = c?.provedorInstancia ?? null;
  const temToken = Boolean(c?.provedorToken);
  const precisaInstancia = tipo !== "custom";

  const val = validarBaseUrl(baseUrl);

  const pendencias: Pendencia[] = [
    { item: "Provedor escolhido", feito: Boolean(tipo) },
    { item: "URL da API", feito: Boolean(baseUrl) && val.ok },
    ...(precisaInstancia
      ? [{ item: "Instância / sessão", feito: Boolean(instancia) }]
      : [{ item: "Endpoint de envio", feito: Boolean(c?.provedorEndpointCustom) }]),
    { item: "Token", feito: temToken },
    { item: "Teste de conexão", feito: Boolean(c?.provedorTestadoEm) },
  ];

  const pronta = pendencias.every((p) => p.feito);

  const urlDeEnvio =
    tipo && baseUrl
      ? provedorDe(tipo).urlDeEnvio({
          tipo,
          baseUrl,
          instancia: instancia ?? "",
          apiKey: null,
          endpointCustom: c?.provedorEndpointCustom,
        })
      : null;

  return {
    pronta,
    tipo,
    baseUrl,
    instancia,
    endpointCustom: c?.provedorEndpointCustom ?? null,
    temToken,
    urlDeEnvio,
    testadoEm: c?.provedorTestadoEm ?? null,
    estadoProvedor: c?.provedorEstado ?? null,
    webhookUltimoEm: c?.webhookUltimoEm ?? null,
    erro: val.ok ? null : (val.erro ?? null),
    comoCorrigir: val.comoCorrigir ?? [],
    pendencias,
    aviso: val.aviso ?? null,
  };
}

/**
 * Migração da configuração antiga (`provedorUrl` inteira) para as partes.
 *
 * Idempotente e não destrutiva: a coluna velha continua no banco. Só preenche
 * o que dá para deduzir com segurança; o resto fica em branco para você
 * revisar, em vez de o sistema adivinhar e errar calado.
 */
export async function migrarConfigAntiga(): Promise<{
  migrou: boolean;
  motivo: string;
  deduzido?: Partial<ConfigProvedor>;
}> {
  const [c] = await db.select().from(configuracoes).limit(1);
  if (!c) return { migrou: false, motivo: "Nenhuma configuração salva." };
  if (c.provedorBaseUrl) return { migrou: false, motivo: "Já está no formato novo." };
  if (!c.provedorUrl) return { migrou: false, motivo: "Nada para migrar." };

  const antiga = c.provedorUrl;

  // Se a antiga era o nosso próprio webhook, não há nada de bom para aproveitar.
  if (!validarBaseUrl(antiga).ok) {
    return {
      migrou: false,
      motivo:
        "A configuração anterior apontava para o webhook deste sistema, não para uma API de WhatsApp. Precisa ser refeita.",
    };
  }

  let u: URL;
  try {
    u = new URL(antiga);
  } catch {
    return { migrou: false, motivo: "A URL anterior não é válida." };
  }

  // Evolution: /message/sendText/{instancia}
  const evo = u.pathname.match(/\/message\/sendText\/([^/?]+)/i);
  const deduzido: Partial<ConfigProvedor> = {
    tipo: evo ? "evolution" : /\/api\/sendText/i.test(u.pathname) ? "waha" : "custom",
    baseUrl: `${u.protocol}//${u.host}`,
    instancia: evo ? decodeURIComponent(evo[1]) : "",
  };

  await db
    .update(configuracoes)
    .set({
      provedorTipo: deduzido.tipo as TipoProvedor,
      provedorBaseUrl: deduzido.baseUrl,
      provedorInstancia: deduzido.instancia || null,
      provedorEndpointCustom: deduzido.tipo === "custom" ? u.pathname : null,
      atualizadoEm: new Date(),
    })
    .where(eq(configuracoes.id, c.id));

  return { migrou: true, motivo: "Configuração antiga convertida.", deduzido };
}
