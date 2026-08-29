/**
 * Contrato único de provedor de WhatsApp.
 *
 * O worker, o teste de envio e o webhook falam SÓ com esta interface. Nenhum
 * deles sabe se por baixo está Evolution, WAHA ou uma API própria — trocar de
 * provedor não deve exigir tocar na fila, que é a parte que protege o número.
 */

export type TipoProvedor = "evolution" | "waha" | "custom";

export type ConfigProvedor = {
  tipo: TipoProvedor;
  /** Só o host, sem caminho: http://localhost:8080 */
  baseUrl: string;
  /** Evolution chama de instância; WAHA chama de sessão. Mesmo campo. */
  instancia: string;
  apiKey: string | null;
  /** Só para "custom": caminho completo montado pelo usuário. */
  endpointCustom?: string | null;
};

export type ResultadoEnvio =
  | { ok: true; provedorId: string | null; bruto: unknown }
  | { ok: false; erro: string; status?: number; bruto?: unknown };

export type ResultadoConexao =
  | { ok: true; detalhes: { provedor: string; instancia: string; estado: string } }
  | { ok: false; erro: string; comoResolver: string[] };

/** Evento do provedor traduzido para o vocabulário do sistema. */
export type EventoNormalizado = {
  tipo: "enviada" | "entregue" | "lida" | "recebida" | "desconhecido";
  /** Id da mensagem no provedor — é a chave de idempotência. */
  provedorMsgId: string | null;
  /** Só dígitos, com DDI. */
  numero: string | null;
  texto: string;
  /** true quando a mensagem foi enviada por nós, não pelo lead. */
  daNossaConta: boolean;
};

export interface Provedor {
  readonly nome: string;
  enviar(cfg: ConfigProvedor, numero: string, texto: string): Promise<ResultadoEnvio>;
  testarConexao(cfg: ConfigProvedor): Promise<ResultadoConexao>;
  /** Caminho de envio, para a tela mostrar o que será chamado. */
  urlDeEnvio(cfg: ConfigProvedor): string;
  normalizarWebhook(corpo: Record<string, unknown>): EventoNormalizado;
  /** Nem todo provedor deixa registrar webhook por API. */
  registrarWebhook?(cfg: ConfigProvedor, url: string): Promise<ResultadoConexao>;
}

/**
 * Normaliza o número para o formato que os provedores esperam.
 *
 * NÃO inventa DDI nem DDD. Se o número vier sem 55, ele sai sem 55 — supor o
 * país produziria mensagem para o número errado, que é pior do que falhar.
 */
export function normalizarNumero(bruto: string): string {
  return String(bruto).replace(/\D/g, "");
}

/** Junta base e caminho sem barra dupla nem barra faltando. */
export function juntarUrl(base: string, caminho: string): string {
  return `${base.replace(/\/+$/, "")}/${caminho.replace(/^\/+/, "")}`;
}

/**
 * Remove segredo de qualquer texto antes de virar log ou mensagem de erro.
 * O token aparece em URL, em header ecoado e em corpo de erro de alguns
 * provedores — mascarar em um lugar só não bastaria.
 */
export function limparSegredo(texto: string, apiKey: string | null): string {
  if (!apiKey || apiKey.length < 4) return texto;
  return texto.split(apiKey).join("••••");
}

/** Para exibir na tela: guarda só os 3 últimos caracteres. */
export function mascarar(apiKey: string | null): string {
  if (!apiKey) return "";
  return apiKey.length <= 3 ? "•••" : `${"•".repeat(12)}${apiKey.slice(-3)}`;
}
