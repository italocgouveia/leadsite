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
 * WAHA (WhatsApp HTTP API).
 *
 * Diferenças que importam em relação à Evolution:
 *   - a sessão vai no CORPO (`session`), não no caminho da URL;
 *   - o destinatário é um chatId completo: 5534999887766@c.us;
 *   - autenticação por header `X-Api-Key`.
 *
 * Endpoints: POST /api/sendText · GET /api/sessions/{sessao}
 */

const TEMPO_LIMITE = 25_000;

async function chamar(cfg: ConfigProvedor, caminho: string, init: RequestInit = {}) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  try {
    const res = await fetch(juntarUrl(cfg.baseUrl, caminho), {
      ...init,
      signal: controle.signal,
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    return { status: res.status, corpo: await res.json().catch(() => null) };
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

/** WAHA quer o destinatário como chatId: só dígitos + @c.us */
function paraChatId(numero: string): string {
  const n = normalizarNumero(numero);
  return n ? `${n}@c.us` : "";
}

export const waha: Provedor = {
  nome: "WAHA",

  urlDeEnvio(cfg) {
    return juntarUrl(cfg.baseUrl, "/api/sendText");
  },

  async enviar(cfg, numero, texto): Promise<ResultadoEnvio> {
    const chatId = paraChatId(numero);
    if (!chatId) return { ok: false, erro: "Número vazio após normalizar." };

    const r = await chamar(cfg, "/api/sendText", {
      method: "POST",
      body: JSON.stringify({ session: cfg.instancia || "default", chatId, text: texto }),
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

    const c = r.corpo as { id?: unknown; _data?: { id?: { _serialized?: unknown } } } | null;
    const id =
      (typeof c?.id === "string" && c.id) ||
      (typeof c?._data?.id?._serialized === "string" && c._data.id._serialized) ||
      null;

    return { ok: true, provedorId: id, bruto: r.corpo };
  },

  async testarConexao(cfg): Promise<ResultadoConexao> {
    const sessao = cfg.instancia || "default";
    const r = await chamar(cfg, `/api/sessions/${sessao}`);

    if (r.erro || r.status === 0) {
      return {
        ok: false,
        erro: limparSegredo(r.erro ?? "Sem resposta", cfg.apiKey),
        comoResolver: [
          "Confirme que o container do WAHA está rodando",
          `Abra ${cfg.baseUrl}/api/sessions no navegador`,
          "Se o painel está na Vercel, localhost não é alcançável — use endereço público",
        ],
      };
    }

    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        erro: "API key recusada pelo provedor.",
        comoResolver: ["Confira a WHATSAPP_API_KEY do seu WAHA", "A chave vai no campo Token"],
      };
    }

    if (r.status === 404) {
      return {
        ok: false,
        erro: `Sessão "${sessao}" não encontrada.`,
        comoResolver: ["Crie a sessão no painel do WAHA", "Confira o nome exato"],
      };
    }

    const c = r.corpo as { status?: unknown; name?: unknown } | null;
    const estado = typeof c?.status === "string" ? c.status : "desconhecido";

    if (estado !== "WORKING") {
      return {
        ok: false,
        erro: `Sessão existe, mas o estado é "${estado}".`,
        comoResolver: [
          "Leia o QR Code no painel do WAHA",
          "O estado precisa ser WORKING para enviar",
        ],
      };
    }

    return { ok: true, detalhes: { provedor: "WAHA", instancia: sessao, estado } };
  },

  normalizarWebhook(corpo): EventoNormalizado {
    const evento = String(corpo.event ?? "").toLowerCase();
    const payload = (corpo.payload ?? corpo) as Record<string, unknown>;

    const daNossaConta = payload.fromMe === true;
    const de = typeof payload.from === "string" ? payload.from : "";
    const numero = de.replace(/@.*$/, "").replace(/\D/g, "") || null;

    const tipo: EventoNormalizado["tipo"] = /message\.any|message$/.test(evento)
      ? daNossaConta
        ? "enviada"
        : "recebida"
      : /message\.ack/.test(evento)
        ? String(payload.ack ?? "") === "3"
          ? "lida"
          : "entregue"
        : "desconhecido";

    return {
      tipo,
      provedorMsgId: typeof payload.id === "string" ? payload.id : null,
      numero,
      texto: typeof payload.body === "string" ? payload.body : "",
      daNossaConta,
    };
  },
};
