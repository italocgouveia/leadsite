import { juntarUrl, type ConfigProvedor } from "@/lib/providers";

/**
 * Saúde da nossa bridge WhatsApp (Baileys) — endpoints próprios (`/status`,
 * `/worker/status`) que só existem no provedor "custom" desta bridge, não em
 * Evolution/WAHA. Por isso `alcancavel:false` também cobre "provedor não é a
 * nossa bridge", não só "bridge fora do ar" — para o painel os dois casos se
 * resolvem do mesmo jeito: não dá para mostrar o estado do worker agora.
 */
export type SaudeBridge =
  | {
      alcancavel: true;
      whatsappConectado: boolean;
      whatsappEstado: string;
      filaWorkerAtivo: boolean;
      limiteWorkerRestante: number | null;
    }
  | { alcancavel: false };

const TEMPO_LIMITE_MS = 5_000;

async function buscar(url: string, apiKey: string | null): Promise<Record<string, unknown> | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(url, {
      signal: controle.signal,
      headers: apiKey ? { apikey: apiKey, Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

export async function consultarBridge(cfg: ConfigProvedor): Promise<SaudeBridge> {
  if (cfg.tipo !== "custom") return { alcancavel: false };

  const [status, worker] = await Promise.all([
    buscar(juntarUrl(cfg.baseUrl, "/status"), cfg.apiKey),
    buscar(juntarUrl(cfg.baseUrl, "/worker/status"), cfg.apiKey),
  ]);

  if (!status) return { alcancavel: false };

  return {
    alcancavel: true,
    whatsappConectado: status.conectado === true,
    whatsappEstado: typeof status.estado === "string" ? status.estado : "desconhecido",
    filaWorkerAtivo: worker?.filaWorkerAtivo === true,
    limiteWorkerRestante: typeof worker?.limiteWorkerRestante === "number" ? worker.limiteWorkerRestante : null,
  };
}

/** Liga/pausa o worker da bridge — mesma autenticação de `/send`. */
export async function controlarWorker(
  cfg: ConfigProvedor,
  acao: "ligar" | "desligar",
  limite?: number,
): Promise<{ ok: true; filaWorkerAtivo: boolean; limiteWorkerRestante: number | null } | { ok: false; erro: string }> {
  if (cfg.tipo !== "custom") {
    return { ok: false, erro: "Controle de worker só existe para a bridge própria (provedor \"custom\")." };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(juntarUrl(cfg.baseUrl, `/worker/${acao}`), {
      method: "POST",
      signal: controle.signal,
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { apikey: cfg.apiKey, Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(limite ? { limite } : {}),
    });
    const corpo = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const erro = typeof corpo?.error === "string" ? corpo.error : `HTTP ${res.status}`;
      return { ok: false, erro };
    }
    return {
      ok: true,
      filaWorkerAtivo: corpo?.filaWorkerAtivo === true,
      limiteWorkerRestante: typeof corpo?.limiteWorkerRestante === "number" ? corpo.limiteWorkerRestante : null,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede." };
  } finally {
    clearTimeout(relogio);
  }
}
