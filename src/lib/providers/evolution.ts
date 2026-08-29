import {
  juntarUrl,
  limparSegredo,
  normalizarNumero,
  type ConfigProvedor,
  type EventoNormalizado,
  type Provedor,
  type ResultadoConexao,
  type ResultadoEnvio,
} from "./tipos";

/**
 * Evolution API.
 *
 * Endpoints usados:
 *   POST /message/sendText/{instancia}     enviar
 *   GET  /instance/connectionState/{inst}  estado da conexão
 *   POST /webhook/set/{instancia}          registrar webhook
 *
 * Autenticação por header `apikey`. Diferente da Cloud API, que usa Bearer —
 * por isso cada adaptador manda o SEU header em vez de mandar os dois em toda
 * requisição, como a versão anterior fazia.
 */

const TEMPO_LIMITE = 25_000;

async function chamar(
  cfg: ConfigProvedor,
  caminho: string,
  init: RequestInit = {},
): Promise<{ status: number; corpo: unknown; erro?: string }> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);

  try {
    const res = await fetch(juntarUrl(cfg.baseUrl, caminho), {
      ...init,
      signal: controle.signal,
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { apikey: cfg.apiKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    const corpo = await res.json().catch(() => null);
    return { status: res.status, corpo };
  } catch (e) {
    const erro =
      e instanceof Error && e.name === "AbortError"
        ? "O provedor não respondeu em 25s."
        : e instanceof Error
          ? e.message
          : "Falha de rede.";
    return { status: 0, corpo: null, erro };
  } finally {
    clearTimeout(relogio);
  }
}

function extrairId(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object") return null;
  const o = corpo as Record<string, unknown>;
  const key = o.key as Record<string, unknown> | undefined;
  if (typeof key?.id === "string") return key.id;
  if (typeof o.id === "string") return o.id;
  return null;
}

export const evolution: Provedor = {
  nome: "Evolution API",

  urlDeEnvio(cfg) {
    return juntarUrl(cfg.baseUrl, `/message/sendText/${cfg.instancia}`);
  },

  async enviar(cfg, numero, texto): Promise<ResultadoEnvio> {
    const n = normalizarNumero(numero);
    if (!n) return { ok: false, erro: "Número vazio após normalizar." };

    const r = await chamar(cfg, `/message/sendText/${cfg.instancia}`, {
      method: "POST",
      body: JSON.stringify({ number: n, text: texto }),
    });

    if (r.erro) return { ok: false, erro: limparSegredo(r.erro, cfg.apiKey) };

    if (r.status >= 400) {
      const c = r.corpo as { message?: unknown; error?: unknown } | null;
      const detalhe =
        (typeof c?.message === "string" && c.message) ||
        (typeof c?.error === "string" && c.error) ||
        `HTTP ${r.status}`;
      return {
        ok: false,
        erro: limparSegredo(String(detalhe).slice(0, 300), cfg.apiKey),
        status: r.status,
        bruto: r.corpo,
      };
    }

    return { ok: true, provedorId: extrairId(r.corpo), bruto: r.corpo };
  },

  async testarConexao(cfg): Promise<ResultadoConexao> {
    const r = await chamar(cfg, `/instance/connectionState/${cfg.instancia}`);

    if (r.erro || r.status === 0) {
      return {
        ok: false,
        erro: limparSegredo(r.erro ?? "Sem resposta", cfg.apiKey),
        comoResolver: [
          "Confirme que o container da Evolution está rodando",
          `Abra ${cfg.baseUrl} no navegador para ver se responde`,
          "Se o painel está na Vercel, localhost não é alcançável — use um endereço público",
        ],
      };
    }

    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        erro: "API key recusada pelo provedor.",
        comoResolver: [
          "Confira a AUTHENTICATION_API_KEY do seu docker-compose",
          "A chave vai no campo Token, não na URL",
        ],
      };
    }

    /**
     * 404 tem DUAS causas muito diferentes, e confundi-las custou uma
     * investigação inteira: a instância não existe, ou o endereço nem é a
     * Evolution. Nesta máquina a porta 8080 estava ocupada por um processo
     * Electron que respondia 200 na raiz e 404 no resto — o teste dizia
     * "instância não encontrada" para um servidor que nunca foi Evolution.
     *
     * A resposta da Evolution é sempre JSON. HTML no corpo é o sinal de que
     * do outro lado tem outra coisa.
     */
    if (r.status === 404) {
      const pareceEvolution = r.corpo !== null && typeof r.corpo === "object";

      if (!pareceEvolution) {
        return {
          ok: false,
          erro: `${cfg.baseUrl} respondeu, mas não é a Evolution API.`,
          comoResolver: [
            "Provavelmente outro programa está ocupando essa porta",
            "Confira a porta no docker-compose e use a mesma aqui",
            `Abra ${cfg.baseUrl} no navegador — a Evolution mostra JSON, não uma página`,
          ],
        };
      }

      return {
        ok: false,
        erro: `Instância "${cfg.instancia}" não encontrada.`,
        comoResolver: [
          "Confira o nome exato da instância no painel da Evolution",
          "Crie a instância antes de usar",
        ],
      };
    }

    /**
     * A Evolution muda a forma da resposta entre versões: às vezes
     * `{ instance: { state } }`, às vezes `{ state }`. Ler os dois evita
     * dizer "desconectado" para uma instância que está de pé.
     */
    const c = r.corpo as
      | { instance?: { state?: unknown; instanceName?: unknown }; state?: unknown }
      | null;
    const estado =
      (typeof c?.instance?.state === "string" && c.instance.state) ||
      (typeof c?.state === "string" && c.state) ||
      "desconhecido";

    if (estado !== "open" && estado !== "connected") {
      return {
        ok: false,
        erro: `Instância existe, mas o estado é "${estado}".`,
        comoResolver: [
          "Abra o painel da Evolution e leia o QR Code com o WhatsApp",
          "O estado precisa ficar 'open' para enviar",
        ],
      };
    }

    return {
      ok: true,
      detalhes: { provedor: "Evolution API", instancia: cfg.instancia, estado },
    };
  },

  async registrarWebhook(cfg, url): Promise<ResultadoConexao> {
    const r = await chamar(cfg, `/webhook/set/${cfg.instancia}`, {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"],
        },
      }),
    });

    if (r.erro || r.status >= 400) {
      return {
        ok: false,
        erro: limparSegredo(r.erro ?? `HTTP ${r.status}`, cfg.apiKey),
        comoResolver: [
          "Sua versão da Evolution pode usar outro formato — configure pelo painel dela",
          "Copie a URL do webhook e cole em Settings → Webhook",
        ],
      };
    }

    return {
      ok: true,
      detalhes: { provedor: "Evolution API", instancia: cfg.instancia, estado: "webhook registrado" },
    };
  },

  normalizarWebhook(corpo): EventoNormalizado {
    const evento = String(corpo.event ?? corpo.type ?? "").toLowerCase();
    const dados = (corpo.data ?? corpo) as Record<string, unknown>;
    const key = dados.key as Record<string, unknown> | undefined;
    const msg = dados.message as Record<string, unknown> | undefined;

    /**
     * `fromMe` é o que separa "o lead respondeu" de "eco da mensagem que eu
     * mandei". Sem essa checagem, o próprio envio seria registrado como
     * resposta e o lead sairia da automação sozinho.
     */
    const daNossaConta = key?.fromMe === true;

    const texto =
      (typeof msg?.conversation === "string" && msg.conversation) ||
      (typeof (msg?.extendedTextMessage as { text?: unknown })?.text === "string" &&
        ((msg!.extendedTextMessage as { text: string }).text)) ||
      (typeof dados.text === "string" && dados.text) ||
      "";

    const remoteJid = typeof key?.remoteJid === "string" ? key.remoteJid : "";
    const numero = remoteJid.replace(/@.*$/, "").replace(/\D/g, "") || null;

    const tipo: EventoNormalizado["tipo"] = /messages_upsert|messages\.upsert/.test(evento)
      ? daNossaConta
        ? "enviada"
        : "recebida"
      : /messages_update|messages\.update/.test(evento)
        ? String(dados.status ?? "").toUpperCase() === "READ"
          ? "lida"
          : "entregue"
        : /send_message/.test(evento)
          ? "enviada"
          : "desconhecido";

    return {
      tipo,
      provedorMsgId: typeof key?.id === "string" ? key.id : null,
      numero,
      texto,
      daNossaConta,
    };
  },
};
