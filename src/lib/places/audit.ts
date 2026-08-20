import type { StatusSite, Temperatura } from "@/lib/db/schema";

/**
 * Redes sociais: o negócio "tem presença", mas não tem site.
 * Alvo primário — é o discurso mais fácil de vender.
 */
const REDES_SOCIAIS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "twitter.com",
  "x.com",
];

/**
 * Agregadores, link-in-bio, diretórios, delivery e agendamento.
 * O dono acha que "tem site", mas não controla nada e não ranqueia no Google.
 */
const AGREGADORES = [
  "linktr.ee",
  "linkme.bio",
  "beacons.ai",
  "taplink.cc",
  "heylink.me",
  "lnk.bio",
  "bio.site",
  "bio.link",
  "campsite.bio",
  "negocio.site", // Google Business site — descontinuado pelo Google
  "business.site",
  "goomer.app",
  "goomer.com.br",
  "anota.ai",
  "ifood.com.br",
  "rappi.com.br",
  "pedidosja.com.br",
  "tripadvisor.com",
  "apontador.com.br",
  "guiamais.com.br",
  "telelistas.net",
  "solutudo.com.br",
  "econodata.com.br",
  "consultacnpj.com",
  "trinks.com",
  "booksy.com",
  "avec.beauty",
  "wa.me",
  "api.whatsapp.com",
  "sites.google.com",
  "wixsite.com",
  "blogspot.com",
];

export type ResultadoAuditoria = {
  status: StatusSite;
  detalhe: string;
};

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Classifica a presença online. Diferente da versão via LLM, aqui tudo é
 * determinístico: ou o domínio bate na lista, ou o HTTP responde, ou não.
 */
export async function auditarSite(
  websiteUri?: string | null,
  /**
   * A fonte de dados AFIRMA que não existe site quando o campo vem vazio?
   *
   * Google Places: sim — o Google coleta o site do próprio dono, então campo
   * vazio é evidência real de ausência.
   *
   * OpenStreetMap: NÃO — a tag `website` só existe se algum voluntário digitou.
   * Ausência ali significa "ninguém mapeou", não "não tem". Tratar como
   * "sem site" seria inventar informação, exatamente o erro que essa auditoria
   * existe pra evitar.
   */
  fonteAfirmaAusencia = true,
): Promise<ResultadoAuditoria> {
  if (!websiteUri || !websiteUri.trim()) {
    return fonteAfirmaAusencia
      ? { status: "sem-site", detalhe: "Nenhum site no perfil do Google" }
      : { status: "nao-verificado", detalhe: "O OpenStreetMap não informa site — confira antes de abordar" };
  }

  const host = hostname(websiteUri);
  if (!host) {
    return { status: "nao-verificado", detalhe: "URL inválida no cadastro" };
  }

  const bate = (lista: string[]) => lista.some((d) => host === d || host.endsWith(`.${d}`));

  if (bate(REDES_SOCIAIS)) {
    return { status: "so-rede-social", detalhe: `Só ${host}` };
  }
  if (bate(AGREGADORES)) {
    return { status: "so-agregador", detalhe: `Só ${host} (agregador/diretório)` };
  }

  // Domínio próprio: o site responde mesmo?
  const alcancavel = await checarUrl(websiteUri);

  if (!alcancavel.ok) {
    return { status: "site-fora-do-ar", detalhe: alcancavel.detalhe };
  }
  if (!alcancavel.https) {
    return { status: "sem-ssl", detalhe: "Site sem HTTPS — navegador marca como não seguro" };
  }

  return { status: "tem-site", detalhe: host };
}

async function checarUrl(
  url: string,
): Promise<{ ok: boolean; https: boolean; detalhe: string }> {
  const httpsUrl = url.startsWith("http://") ? url.replace(/^http:/, "https:") : url;

  // Tenta HTTPS primeiro. Se só o HTTP responde, é "sem SSL".
  const viaHttps = await tentar(httpsUrl);
  if (viaHttps.ok) return { ok: true, https: true, detalhe: `HTTP ${viaHttps.status}` };

  if (url.startsWith("http://")) {
    const viaHttp = await tentar(url);
    if (viaHttp.ok) return { ok: true, https: false, detalhe: `HTTP ${viaHttp.status} sem SSL` };
  }

  return { ok: false, https: false, detalhe: viaHttps.erro ?? `HTTP ${viaHttps.status}` };
}

async function tentar(url: string): Promise<{ ok: boolean; status: number; erro?: string }> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    // Alguns servidores rejeitam HEAD; GET com Range é mais confiável e igual de barato.
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controle.signal,
      headers: {
        Range: "bytes=0-2048",
        "User-Agent": "Mozilla/5.0 (compatible; LeadSiteBot/1.0)",
      },
    });
    return { ok: res.status < 400, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      erro: msg.includes("abort") ? "Tempo esgotado (site não respondeu)" : "Domínio não resolve",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Score 0–100. Quanto maior, mais vale a sua ligação.
 * A lógica: negócio ATIVO (muita avaliação, nota boa, telefone) que NÃO tem site
 * é o lead perfeito — tem dinheiro e tem dor.
 */
export function calcularScore(input: {
  status: StatusSite;
  nota?: number | null;
  avaliacoes?: number | null;
  temTelefone: boolean;
  /** Só usado quando não há nota/avaliações (fonte OSM): endereço + categoria. */
  cadastroCompleto?: boolean;
}): { score: number; temperatura: Temperatura } {
  const { status, nota, avaliacoes, temTelefone } = input;

  const pontosStatus: Record<StatusSite, number> = {
    "sem-site": 55,
    // Menos que "sem-site" de propósito: aqui a gente NÃO sabe. Não dá pra
    // tratar um palpite com a mesma confiança de um fato verificado.
    "nao-verificado": 35,
    "so-agregador": 50,
    "so-rede-social": 45,
    "site-fora-do-ar": 40,
    "sem-ssl": 25,
    "tem-site": 5,
  };

  let score = pontosStatus[status];

  // Volume de avaliações = negócio movimentado = tem caixa.
  // No modo OpenStreetMap isso vem null (o OSM não guarda avaliação), e aí o
  // score fica achatado: sem esse sinal, quase tudo cai em "morno".
  const n = avaliacoes ?? 0;
  if (n >= 300) score += 25;
  else if (n >= 100) score += 20;
  else if (n >= 40) score += 14;
  else if (n >= 10) score += 8;
  else if (n > 0) score += 3;

  // Nota alta = dono cuida do negócio = se importa com a imagem.
  if (nota != null) {
    if (nota >= 4.7) score += 12;
    else if (nota >= 4.3) score += 8;
    else if (nota >= 3.8) score += 4;
  }

  // Sem dados de avaliação (fonte OSM), compensamos parcialmente: um cadastro
  // completo indica negócio ativo o bastante pra alguém ter mapeado direito.
  if (avaliacoes == null && nota == null) {
    if (input.cadastroCompleto) score += 14;
    else score += 6;
  }

  // Sem telefone você não consegue abordar — vale menos, por mais quente que seja.
  if (temTelefone) score += 8;
  else score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const temperatura: Temperatura = score >= 75 ? "quente" : score >= 50 ? "morno" : "frio";
  return { score, temperatura };
}

/** Status em que a fonte CONFIRMA que falta um site próprio decente. */
export const SEM_SITE: StatusSite[] = [
  "sem-site",
  "so-rede-social",
  "so-agregador",
  "site-fora-do-ar",
];

/** Vale abordar, mas você precisa conferir o site antes de falar em "não tem". */
export const A_VERIFICAR: StatusSite[] = ["nao-verificado"];

export function precisaDeSite(status: StatusSite): boolean {
  return SEM_SITE.includes(status);
}
