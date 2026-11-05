import "dotenv/config";
import express from "express";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState as carregarEstadoAutenticacao,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = Number(process.env.PORT || process.env.API_PORT || 8081);
const PAIRING_PORT = Number(process.env.PAIRING_PORT || 8082);
const BIND_HOST = process.env.BIND_HOST || "0.0.0.0";
const AUTH_DIR = path.resolve(__dirname, process.env.AUTH_DIR || "./auth");
const API_TOKEN = process.env.BRIDGE_API_TOKEN || "";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

let sock = null;
let qrAtual = null;
let estado = "iniciando";
let reinicioAgendado = false;

function autorizado(req) {
  if (!API_TOKEN) return false;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.headers.apikey;
  return token === API_TOKEN;
}

async function notificarWebhook(body) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEBHOOK_SECRET ? { Authorization: `Bearer ${WEBHOOK_SECRET}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error("Webhook do Leadsite indisponível:", error instanceof Error ? error.message : "erro de rede");
  }
}

function textoDaMensagem(message) {
  const content = message.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ""
  );
}

async function conectar() {
  const { state, saveCreds } = await carregarEstadoAutenticacao(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      estado = "aguardando-qr";
      console.log("QR pronto. Abra http://localhost:" + PAIRING_PORT + " no computador para parear.");
    }
    if (connection === "open") {
      qrAtual = null;
      estado = "conectado";
      console.log("WhatsApp conectado.");
    }
    if (connection === "close") {
      estado = "desconectado";
      const code = lastDisconnect?.error?.output?.statusCode;
      const deveReconectar = code !== DisconnectReason.loggedOut;
      if (deveReconectar && !reinicioAgendado) {
        reinicioAgendado = true;
        setTimeout(() => {
          reinicioAgendado = false;
          void conectar().catch((e) => console.error("Falha ao reconectar:", e instanceof Error ? e.message : "erro"));
        }, 3_000);
      } else if (!deveReconectar) {
        estado = "sessao-encerrada";
        console.error("Sessão encerrada pelo WhatsApp. Apague a sessão local e pareie novamente.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      const jid = message.key?.remoteJid || "";
      if (!jid || message.key?.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text = textoDaMensagem(message).trim();
      if (!text) continue;
      await notificarWebhook({
        event: "messages.upsert",
        data: {
          key: {
            id: message.key?.id || null,
            fromMe: false,
            remoteJid: jid,
          },
          message: { conversation: text },
        },
      });
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    for (const item of updates) {
      const id = item.key?.id;
      const jid = item.key?.remoteJid;
      if (!id || !jid || !item.update.status) continue;
      const status = item.update.status === 4 ? "READ" : "DELIVERED";
      await notificarWebhook({
        event: "messages.update",
        data: { key: { id, fromMe: true, remoteJid: jid }, status },
      });
    }
  });
}

const api = express();
api.disable("x-powered-by");
api.use(express.json({ limit: "64kb" }));

api.get("/healthz", (_req, res) => res.json({ ok: true }));

api.get("/status", (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: "Não autorizado" });
  res.json({ conectado: Boolean(sock?.user), estado, numero: sock?.user?.id?.split(":")[0] || null });
});

api.get("/pairing", async (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: "Não autorizado" });
  const qrDataUrl = qrAtual ? await QRCode.toDataURL(qrAtual, { width: 280, margin: 2 }) : null;
  res.json({ estado, conectado: Boolean(sock?.user), numero: sock?.user?.id?.split(":")[0] || null, qrDataUrl });
});

api.get("/worker/status", (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: "Não autorizado" });
  // O agendador da fila fica no n8n; esta bridge só mantém a sessão e envia.
  res.json({ filaWorkerAtivo: false, limiteWorkerRestante: null, gerenciadoPor: "n8n" });
});

api.post("/send", async (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: "Não autorizado" });
  const number = String(req.body?.number || "").replace(/\D/g, "");
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (number.length < 10 || number.length > 15 || !text) {
    return res.status(400).json({ error: "Informe número internacional e texto." });
  }
  if (!sock?.user) return res.status(503).json({ error: "WhatsApp desconectado." });

  try {
    const sent = await sock.sendMessage(`${number}@s.whatsapp.net`, { text });
    return res.json({ id: sent?.key?.id || null, accepted: true });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Falha de envio." });
  }
});

api.listen(API_PORT, BIND_HOST, () => {
  console.log(`Bridge escutando na porta ${API_PORT}`);
  if (!API_TOKEN) console.warn("BRIDGE_API_TOKEN não configurado; chamadas protegidas ficarão bloqueadas.");
  if (!WEBHOOK_URL) console.warn("WEBHOOK_URL não configurada; respostas não chegarão ao Leadsite.");
  if (!WEBHOOK_SECRET) console.warn("WEBHOOK_SECRET não configurado; callbacks não terão autenticação Bearer.");
});

const pairing = express();
pairing.disable("x-powered-by");
pairing.get("/", async (_req, res) => {
  const qrData = qrAtual ? await QRCode.toDataURL(qrAtual, { width: 280, margin: 2 }) : null;
  const statusText = estado === "conectado" ? "WhatsApp conectado" : estado;
  res.type("html").send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>Conectar WhatsApp</title><body style="margin:0;background:#101114;color:#f7f7f7;font:16px system-ui;display:grid;min-height:100vh;place-items:center"><main style="text-align:center;padding:24px"><h1>Leadsite · WhatsApp</h1><p>${statusText}</p>${qrData ? `<img alt="QR code de conexão" width="280" height="280" src="${qrData}" style="border-radius:12px;background:#fff;padding:8px"><p>WhatsApp no celular → Aparelhos conectados → Conectar aparelho</p>` : `<p>${estado === "conectado" ? "Aparelho pareado. Pode fechar esta página." : "Aguardando QR code…"}</p>`}<small>Esta página fica somente no computador local.</small></main></body></html>`);
});
pairing.listen(PAIRING_PORT, "127.0.0.1", () => {
  console.log(`Página local de pareamento em http://localhost:${PAIRING_PORT}`);
});

if (!API_TOKEN) {
  console.error("Configure BRIDGE_API_TOKEN no arquivo .env antes de disponibilizar a bridge.");
}
void conectar().catch((e) => {
  estado = "erro";
  console.error("Não foi possível iniciar a sessão:", e instanceof Error ? e.message : "erro");
});
