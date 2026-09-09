import { validarTelefone } from "@/lib/telefone";
import { ehPlataformaCompartilhada } from "@/lib/places/audit";
import { NAO_E_PERFIL } from "@/lib/canais";

/**
 * 🔎 ANÁLISE DE SITE — a única fonte gratuita que ainda pode virar canal.
 *
 * POR QUE ELA IMPORTA MAIS QUE PARECE
 *
 * O gargalo medido desta base não é qualificação: 94% dos leads têm o perfil
 * certo e 12% têm canal. O mapa aberto está esgotado (1.426 estabelecimentos
 * na cidade, 111 com contato) e a Receita traz telefone mas não traz
 * Instagram. Sobra o site do próprio negócio, que é onde a empresa publica o
 * `wa.me` e o `@` dela por vontade própria.
 *
 * O QUE ESTA FUNÇÃO FAZ E NÃO FAZ
 *
 * Busca UMA página — a home — com um GET normal, User-Agent identificado e
 * timeout curto. Respeita `robots.txt`. Não segue links, não varre o site, não
 * tenta login, não contorna bloqueio. Se a página não responder, o resultado
 * diz isso em vez de inventar.
 *
 * SOBRE OS SINAIS
 *
 * Cada sinal é uma OBSERVAÇÃO sobre o HTML — "não há link de WhatsApp na
 * home" é verificável. A conclusão de que isso custa clientes é hipótese, e
 * ela não mora aqui: sai marcada como tal em `oportunidadesDoSite`.
 */

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;
const AGENTE = "RastroLeadBot/1.0 (+prospeccao B2B; contato pelo site do cliente)";

export type SinalSite = {
  id: string;
  /** O que foi OBSERVADO no HTML. Verificável, sem interpretação. */
  fato: string;
  presente: boolean;
};

export type AnaliseSite =
  | { ok: false; motivo: string; url: string }
  | {
      ok: true;
      url: string;
      host: string;
      /** Canais que a empresa publica na própria home. */
      whatsapp: string | null;
      instagram: string | null;
      telefones: string[];
      email: string | null;
      /** Outros perfis sociais encontrados. */
      redes: string[];
      /** Serviços/termos comerciais citados na página. */
      servicos: string[];
      sinais: SinalSite[];
      /** Tamanho do HTML — página muito curta costuma ser placeholder. */
      bytes: number;
    };

/* ───────────────────────── robots.txt ───────────────────────── */

/**
 * Respeitar `robots.txt` não é formalidade: é a diferença entre ler o que o
 * site publica e entrar onde ele pediu para não entrarem. Na dúvida (arquivo
 * ausente, erro de rede), seguimos — ausência de regra não é proibição.
 */
async function permitido(url: URL): Promise<boolean> {
  try {
    const r = await fetch(new URL("/robots.txt", url.origin), {
      headers: { "User-Agent": AGENTE },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return true;
    const txt = (await r.text()).slice(0, 20_000);

    /** Só nos interessa o bloco que se aplica a todo mundo. */
    const blocos = txt.split(/^user-agent:/im).slice(1);
    for (const b of blocos) {
      const alvo = b.split("\n")[0].trim().toLowerCase();
      if (alvo !== "*") continue;
      for (const linha of b.split("\n").slice(1)) {
        const m = linha.match(/^\s*disallow:\s*(\S*)/i);
        if (!m) continue;
        const caminho = m[1].trim();
        if (caminho === "/") return false;
        if (caminho && url.pathname.startsWith(caminho)) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/* ───────────────────────── extração ───────────────────────── */

/** `wa.me/5534...` ou `api.whatsapp.com/send?phone=...` — o link que a empresa publicou. */
function acharWhatsapp(html: string): string | null {
  const padroes = [
    /(?:wa\.me|api\.whatsapp\.com\/send\?phone=|web\.whatsapp\.com\/send\?phone=)\/?(\d{10,15})/i,
    /whatsapp[^"'<>]{0,40}?(\+?55\s?\d{2}\s?9?\d{4}[-\s]?\d{4})/i,
  ];
  for (const p of padroes) {
    const m = html.match(p);
    if (!m) continue;
    const v = validarTelefone(m[1]);
    if (v) return v.e164;
  }
  return null;
}

/**
 * O `@` da empresa. Rejeita post, reel e story pelo mesmo `NAO_E_PERFIL` que o
 * resto do CRM usa — duas listas de caminhos inválidos divergiriam, e a que
 * divergisse mandaria o vendedor abrir uma foto em vez de um perfil.
 */
function acharInstagram(html: string): string | null {
  const m = html.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)/gi);
  for (const x of m) {
    const user = x[1].toLowerCase();
    if (NAO_E_PERFIL.has(user)) continue;
    if (user.length < 2 || user.length > 30) continue;
    return `https://instagram.com/${x[1]}`;
  }
  return null;
}

function acharTelefones(html: string): string[] {
  const achados = new Set<string>();
  const texto = html.replace(/<[^>]+>/g, " ");
  for (const m of texto.matchAll(/\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}/g)) {
    const v = validarTelefone(m[0]);
    if (v) achados.add(v.e164);
  }
  return [...achados].slice(0, 5);
}

function acharEmail(html: string): string | null {
  const m = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!m) return null;
  /** E-mail de quem fez o site não é da empresa. */
  if (/(wix|wordpress|godaddy|example|sentry|noreply|no-reply)/i.test(m[0])) return null;
  return m[0].toLowerCase();
}

const REDES = ["facebook.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com"];

/** Termos comerciais que aparecem no texto. Fato, não interpretação. */
const TERMOS_SERVICO = [
  "orçamento", "orcamento", "agendamento", "agendar", "agenda", "delivery", "cardápio",
  "cardapio", "catálogo", "catalogo", "promoção", "promocao", "atendimento", "consulta",
  "avaliação", "avaliacao", "serviços", "servicos", "produtos", "horário", "horario",
];

export async function analisarSite(url: string): Promise<AnaliseSite> {
  let alvo: URL;
  try {
    alvo = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return { ok: false, motivo: "URL inválida", url };
  }

  if (ehPlataformaCompartilhada(alvo.href)) {
    return {
      ok: false,
      motivo: "Não é site próprio — é rede social ou agregador, que já é outro canal",
      url: alvo.href,
    };
  }

  if (!(await permitido(alvo))) {
    return { ok: false, motivo: "O robots.txt do site pede para não acessarmos", url: alvo.href };
  }

  let html: string;
  try {
    const r = await fetch(alvo.href, {
      headers: { "User-Agent": AGENTE, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!r.ok) return { ok: false, motivo: `Site respondeu ${r.status}`, url: alvo.href };
    const tipo = r.headers.get("content-type") ?? "";
    if (!tipo.includes("html")) {
      return { ok: false, motivo: `Conteúdo não é HTML (${tipo || "desconhecido"})`, url: alvo.href };
    }
    const bruto = await r.text();
    html = bruto.slice(0, MAX_BYTES);
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "Site não respondeu a tempo" : "Falha ao acessar o site";
    return { ok: false, motivo: msg, url: alvo.href };
  }

  const baixo = html.toLowerCase();
  const whatsapp = acharWhatsapp(html);
  const instagram = acharInstagram(html);
  const telefones = acharTelefones(html);
  const email = acharEmail(html);
  const redes = REDES.filter((r) => baixo.includes(r));
  const servicos = TERMOS_SERVICO.filter((t) => baixo.includes(t));

  /**
   * Os sinais são sobre O QUE ESTÁ NA PÁGINA, e cada um é conferível abrindo
   * o site. Nenhum deles diz que a empresa perde cliente — isso é conclusão, e
   * conclusão vive em `oportunidadesDoSite`, marcada como hipótese.
   */
  const sinais: SinalSite[] = [
    { id: "whatsapp", fato: "Link de WhatsApp na página inicial", presente: Boolean(whatsapp) },
    { id: "instagram", fato: "Link de Instagram na página inicial", presente: Boolean(instagram) },
    { id: "telefone", fato: "Telefone visível na página", presente: telefones.length > 0 },
    { id: "email", fato: "E-mail de contato na página", presente: Boolean(email) },
    { id: "formulario", fato: "Formulário de contato (<form>)", presente: /<form[\s>]/i.test(html) },
    { id: "orcamento", fato: "Menção a orçamento", presente: /or[çc]amento/i.test(baixo) },
    { id: "agendamento", fato: "Menção a agendamento", presente: /agend(a|ar|amento)/i.test(baixo) },
    { id: "catalogo", fato: "Catálogo ou cardápio", presente: /cat[áa]logo|card[áa]pio/i.test(baixo) },
    { id: "preco", fato: "Preço publicado", presente: /r\$\s?\d/i.test(baixo) },
    { id: "horario", fato: "Horário de funcionamento", presente: /hor[áa]rio|seg(unda)?[\s-]*a[\s-]*(sex|s[áa]b)/i.test(baixo) },
    { id: "endereco", fato: "Endereço na página", presente: /(rua|avenida|av\.|travessa)\s+[a-z]/i.test(baixo) },
    { id: "depoimentos", fato: "Depoimentos de clientes", presente: /depoimento|avalia[çc][õo]es|o que dizem/i.test(baixo) },
    { id: "responsivo", fato: "Declara viewport (feito para celular)", presente: /name=["']viewport["']/i.test(html) },
  ];

  return {
    ok: true,
    url: alvo.href,
    host: alvo.hostname.replace(/^www\./, ""),
    whatsapp,
    instagram,
    telefones,
    email,
    redes,
    servicos,
    sinais,
    bytes: html.length,
  };
}

/* ─────────────── da observação para a oportunidade ─────────────── */

export type OportunidadeDoSite = {
  titulo: string;
  /** O que foi observado. Verificável. */
  fato: string;
  /** O que isso PODE significar. Nunca afirmado. */
  hipotese: string;
  /** O que não sabemos e não vamos fingir que sabemos. */
  desconhecido: string;
};

/**
 * Traduz os sinais em conversa de venda — mantendo os três níveis separados.
 *
 * A regra do §13 em código: "o site não tem botão de WhatsApp" é fato; "isso
 * pode dificultar o contato" é hipótese; "quantos clientes chegam pelo site"
 * é desconhecido. Escrever "você está perdendo clientes" juntaria os três num
 * palpite com cara de diagnóstico.
 */
export function oportunidadesDoSite(a: AnaliseSite): OportunidadeDoSite[] {
  if (!a.ok) return [];
  const tem = (id: string) => a.sinais.find((s) => s.id === id)?.presente ?? false;
  const lista: OportunidadeDoSite[] = [];

  if (!tem("whatsapp")) {
    lista.push({
      titulo: "Atendimento por WhatsApp",
      fato: "A página inicial não traz link de WhatsApp.",
      hipotese: "Quem chega pelo site pode não ter um caminho rápido para falar com a empresa.",
      desconhecido: "Não sabemos quantas pessoas chegam pelo site nem como elas contatam hoje.",
    });
  }
  if (!tem("formulario") && !tem("whatsapp")) {
    lista.push({
      titulo: "Captura de contato",
      fato: "Não há formulário nem link de WhatsApp na página inicial.",
      hipotese: "Visitantes interessados podem sair sem deixar contato.",
      desconhecido: "Não sabemos se a empresa capta contato por outro caminho.",
    });
  }
  if (!tem("agendamento") && (tem("orcamento") || a.servicos.length >= 3)) {
    lista.push({
      titulo: "Agendamento",
      fato: "A página cita serviços, mas não menciona agendamento.",
      hipotese: "O agendamento pode estar acontecendo por telefone ou mensagem, à mão.",
      desconhecido: "Não sabemos o volume de agendamentos nem como são registrados.",
    });
  }
  if (!tem("orcamento") && a.servicos.length >= 2) {
    lista.push({
      titulo: "Orçamento",
      fato: "A página lista serviços, mas não fala em orçamento.",
      hipotese: "O orçamento pode ser feito caso a caso, sem registro centralizado.",
      desconhecido: "Não sabemos quantos orçamentos a empresa faz por semana.",
    });
  }
  if (!tem("catalogo") && a.servicos.some((s) => /produto|cardápio|cardapio/.test(s))) {
    lista.push({
      titulo: "Catálogo online",
      fato: "A página fala em produtos, mas não apresenta catálogo.",
      hipotese: "O cliente pode precisar perguntar item a item para saber o que existe.",
      desconhecido: "Não sabemos o tamanho do mix nem com que frequência ele muda.",
    });
  }
  if (!tem("responsivo")) {
    lista.push({
      titulo: "Site no celular",
      fato: "A página não declara viewport para telas pequenas.",
      hipotese: "A leitura no celular pode estar prejudicada.",
      desconhecido: "Não medimos como o site se comporta em cada aparelho.",
    });
  }

  return lista;
}
