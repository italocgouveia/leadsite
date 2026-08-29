import {
  juntarUrl,
  limparSegredo,
  normalizarNumero,
  type EventoNormalizado,
  type Provedor,
  type ResultadoConexao,
  type ResultadoEnvio,
} from "./tipos";

/**
 * API personalizada — modo avançado.
 *
 * Faz POST em `endpointCustom` com `{ number, text }` e manda o token nos dois
 * cabeçalhos mais comuns. É o caminho para quem usa algo fora de Evolution e
 * WAHA, e por isso NÃO tem teste de conexão de verdade: não existe endpoint
 * padrão de status para inventar.
 *
 * Dizer "conectado" sem ter como verificar seria pior do que admitir que só o
 * envio de teste prova que funciona.
 */
export const custom: Provedor = {
  nome: "API personalizada",

  urlDeEnvio(cfg) {
    return cfg.endpointCustom
      ? juntarUrl(cfg.baseUrl, cfg.endpointCustom)
      : cfg.baseUrl;
  },

  async enviar(cfg, numero, texto): Promise<ResultadoEnvio> {
    const n = normalizarNumero(numero);
    if (!n) return { ok: false, erro: "Número vazio após normalizar." };

    /**
     * Sem endpoint, `urlDeEnvio` devolve a própria base — e postar na raiz de
     * um provedor costuma responder 200 com uma página de status. Aconteceu:
     * o worker levou 200, reportou "enviado", e a mensagem nunca saiu.
     *
     * Recusar aqui é melhor que mandar para o lugar errado em silêncio.
     */
    if (!cfg.endpointCustom) {
      return {
        ok: false,
        erro: "Endpoint de envio não configurado — o sistema postaria na raiz do provedor.",
      };
    }

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 25_000);

    try {
      const res = await fetch(this.urlDeEnvio(cfg), {
        method: "POST",
        signal: controle.signal,
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey
            ? { apikey: cfg.apiKey, Authorization: `Bearer ${cfg.apiKey}` }
            : {}),
        },
        body: JSON.stringify({ number: n, text: texto }),
      });

      const corpo = await res.json().catch(() => null);

      if (!res.ok) {
        const c = corpo as { message?: unknown; error?: unknown } | null;
        const detalhe =
          (typeof c?.message === "string" && c.message) ||
          (typeof c?.error === "string" && c.error) ||
          `HTTP ${res.status}`;
        return {
          ok: false,
          erro: limparSegredo(String(detalhe).slice(0, 300), cfg.apiKey),
          status: res.status,
          bruto: corpo,
        };
      }

      const o = (corpo ?? {}) as Record<string, unknown>;
      const id =
        (typeof o.id === "string" && o.id) ||
        (typeof o.messageId === "string" && o.messageId) ||
        null;

      return { ok: true, provedorId: id, bruto: corpo };
    } catch (e) {
      const erro =
        e instanceof Error && e.name === "AbortError"
          ? "O provedor não respondeu em 25s."
          : e instanceof Error
            ? e.message
            : "Falha de rede.";
      return { ok: false, erro: limparSegredo(erro, cfg.apiKey) };
    } finally {
      clearTimeout(relogio);
    }
  },

  /**
   * Sonda o que dá para sondar.
   *
   * A versão anterior recusava testar "porque não existe endpoint de status
   * padrão". Isso criava um impasse: o checklist exige teste de conexão, o
   * adaptador se recusava a fazer, e a campanha ficava bloqueada para sempre.
   *
   * Agora tenta `GET /status` e, se não houver, a própria base. Reporta só o
   * que conseguiu verificar — se a API responde mas não diz se o WhatsApp está
   * pareado, o resultado diz exatamente isso, em vez de afirmar "conectado".
   */
  async testarConexao(cfg): Promise<ResultadoConexao> {
    if (!cfg.endpointCustom) {
      return {
        ok: false,
        erro: "Endpoint de envio não informado.",
        comoResolver: ["Preencha o caminho do POST de envio, ex: /send"],
      };
    }

    const tentar = async (caminho: string) => {
      try {
        const controle = new AbortController();
        const relogio = setTimeout(() => controle.abort(), 12_000);
        const res = await fetch(juntarUrl(cfg.baseUrl, caminho), {
          signal: controle.signal,
          headers: cfg.apiKey
            ? { apikey: cfg.apiKey, Authorization: `Bearer ${cfg.apiKey}` }
            : {},
        });
        clearTimeout(relogio);
        return { status: res.status, corpo: await res.json().catch(() => null) };
      } catch {
        return null;
      }
    };

    const status = await tentar("/status");

    if (status?.corpo && typeof status.corpo === "object") {
      const o = status.corpo as Record<string, unknown>;
      const conectado = o.conectado === true || o.connected === true;
      const estado = String(o.estado ?? o.status ?? o.state ?? "desconhecido");

      if (conectado) {
        return {
          ok: true,
          detalhes: {
            provedor: "API personalizada",
            instancia: String(o.numero ?? o.number ?? cfg.endpointCustom ?? "—"),
            estado,
          },
        };
      }

      return {
        ok: false,
        erro: `A API respondeu, mas o WhatsApp não está conectado (estado: ${estado}).`,
        comoResolver: [
          estado === "aguardando-qr"
            ? "Leia o QR Code na janela do servidor"
            : "Reinicie o servidor e pareie o WhatsApp",
          "O estado precisa ser 'conectado' para enviar",
        ],
      };
    }

    // Sem /status: pelo menos confirma que tem algo respondendo na base.
    const raiz = await tentar("/");
    if (raiz && raiz.status < 500) {
      return {
        ok: true,
        detalhes: {
          provedor: "API personalizada",
          instancia: cfg.endpointCustom ?? "—",
          estado: "respondendo (sem /status para confirmar o pareamento)",
        },
      };
    }

    return {
      ok: false,
      erro: `Não consegui falar com ${cfg.baseUrl}.`,
      comoResolver: [
        "Confirme que o servidor está rodando",
        `Abra ${cfg.baseUrl} no navegador`,
        "Se o painel está na Vercel, localhost não é alcançável de lá",
      ],
    };
  },

  /** Aceita os formatos mais comuns; o que não reconhecer vira "desconhecido". */
  normalizarWebhook(corpo): EventoNormalizado {
    const evento = String(corpo.event ?? corpo.type ?? corpo.status ?? "").toLowerCase();
    const daNossaConta = corpo.fromMe === true;

    const texto =
      (typeof corpo.text === "string" && corpo.text) ||
      (typeof corpo.body === "string" && corpo.body) ||
      (typeof corpo.message === "string" && corpo.message) ||
      "";

    const numero =
      String(corpo.from ?? corpo.number ?? corpo.chatId ?? "")
        .replace(/@.*$/, "")
        .replace(/\D/g, "") || null;

    const tipo: EventoNormalizado["tipo"] = /read|lida/.test(evento)
      ? "lida"
      : /deliver|entregue/.test(evento)
        ? "entregue"
        : /reply|respon|received|inbound|upsert/.test(evento)
          ? daNossaConta
            ? "enviada"
            : "recebida"
          : /sent|enviad/.test(evento)
            ? "enviada"
            : "desconhecido";

    return {
      tipo,
      provedorMsgId:
        (typeof corpo.id === "string" && corpo.id) ||
        (typeof corpo.messageId === "string" && corpo.messageId) ||
        null,
      numero,
      texto,
      daNossaConta,
    };
  },
};
