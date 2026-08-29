import { db, leads, type Lead } from "@/lib/db";
import { categoriaSingular } from "@/lib/categoria-nome";
import { pontuar, contactabilidade } from "@/lib/pontuacao";

/**
 * Facetas: o que EXISTE na base, antes de perguntar o que você quer filtrar.
 *
 * A tela anterior pedia cidade, nota e quantidade num formulário vazio, e só
 * depois dizia "nenhum lead atende ao filtro". Tentativa e erro. Aqui a
 * pergunta se inverte: o sistema mostra primeiro o que tem, com número ao lado
 * de cada opção, e você escolhe entre coisas que existem.
 *
 * Cada opção mostra quantos leads tem. Filtro que devolveria zero aparece com
 * zero ao lado, antes de você clicar — nunca mais "nenhum lead atende" depois
 * de preencher três campos.
 */

export type Faixa = "todos" | "qualificados" | "quentes" | "melhores";

/** Nota mínima de cada faixa. */
/**
 * Alinhado com LIMIAR em pontuacao.ts, calibrado sobre os 282 leads reais.
 * Se mudar lá, mude aqui — são a mesma régua vista de dois lugares.
 */
export const NOTA_DA_FAIXA: Record<Faixa, number> = {
  todos: 0,
  qualificados: 42,
  quentes: 66,
  melhores: 80,
};

export const ROTULO_FAIXA: Record<Faixa, string> = {
  todos: "Todos os leads",
  qualificados: "Apenas qualificados",
  quentes: "Quentes e muito quentes",
  melhores: "Somente melhores oportunidades",
};

export type Opcao = {
  valor: string;
  rotulo: string;
  leads: number;
  comWhatsapp: number;
  quentes: number;
};

export type Filtro = {
  segmento?: string;
  cidade?: string;
  faixa?: Faixa;
  notaMinima?: number;
  soComWhatsapp?: boolean;
  /**
   * Contactabilidade é eixo SEPARADO da oportunidade. "Alta oportunidade +
   * qualquer contato" e "qualquer oportunidade + excelente contato" são
   * perguntas diferentes, e antes não dava para fazer nenhuma das duas.
   */
  contatoMinimo?: number;
};

/**
 * Lead "disponível" = nunca contatado, sem opt-out.
 *
 * Quem já está no meio de uma conversa não entra em campanha nova — essa é a
 * mesma regra da fila, aplicada aqui para o número da tela bater com o que
 * realmente vai ser criado.
 */
export function disponivel(l: Lead): boolean {
  return !l.naoContatar && l.etapa === "novo";
}

function agrupar(lista: Lead[], chave: (l: Lead) => string): Opcao[] {
  const mapa = new Map<string, Opcao>();

  for (const l of lista) {
    const k = chave(l);
    if (!k) continue;
    const atual =
      mapa.get(k) ?? { valor: k, rotulo: k, leads: 0, comWhatsapp: 0, quentes: 0 };
    atual.leads++;
    if (l.whatsapp) atual.comWhatsapp++;
    if (pontuar(l).total >= 66) atual.quentes++;
    mapa.set(k, atual);
  }

  return [...mapa.values()].sort((a, b) => b.leads - a.leads);
}

export function aplicar(lista: Lead[], f: Filtro): Lead[] {
  const minima = f.notaMinima ?? NOTA_DA_FAIXA[f.faixa ?? "todos"];

  return lista
    .filter((l) => (f.segmento ? categoriaSingular(l.categoria) === f.segmento : true))
    .filter((l) => (f.cidade ? l.cidade === f.cidade : true))
    .filter((l) => (f.soComWhatsapp ? Boolean(l.whatsapp) : true))
    .filter((l) =>
      f.contatoMinimo ? contactabilidade(l).score >= f.contatoMinimo : true,
    )
    .filter((l) => pontuar(l).total >= minima);
}

/**
 * Ordena como você trabalharia: nota primeiro, mas quem tem WhatsApp sobe.
 * Lead ótimo sem canal de contato é lead que você não consegue abordar hoje.
 */
export function ordenar(lista: Lead[]): Lead[] {
  return [...lista].sort((a, b) => {
    const zap = Number(Boolean(b.whatsapp)) - Number(Boolean(a.whatsapp));
    if (zap !== 0) return zap;
    return pontuar(b).total - pontuar(a).total;
  });
}

export async function calcularFacetas(filtro: Filtro) {
  const base = await db.select().from(leads);
  const disponiveis = base.filter(disponivel);

  /**
   * Segmentos e cidades são contados sobre o universo DISPONÍVEL, mas
   * ignorando o próprio eixo: ao escolher "Uberlândia", a lista de segmentos
   * mostra o que existe em Uberlândia — não o total geral, que seria mentira.
   */
  const paraSegmentos = disponiveis.filter((l) =>
    filtro.cidade ? l.cidade === filtro.cidade : true,
  );
  const paraCidades = disponiveis.filter((l) =>
    filtro.segmento ? categoriaSingular(l.categoria) === filtro.segmento : true,
  );

  const segmentos = agrupar(paraSegmentos, (l) => categoriaSingular(l.categoria));
  const cidades = agrupar(paraCidades, (l) => l.cidade ?? "");

  // Contagem por faixa, já com segmento/cidade aplicados.
  const semFaixa = aplicar(disponiveis, { segmento: filtro.segmento, cidade: filtro.cidade });
  const porFaixa = (Object.keys(NOTA_DA_FAIXA) as Faixa[]).map((f) => ({
    faixa: f,
    rotulo: ROTULO_FAIXA[f],
    nota: NOTA_DA_FAIXA[f],
    leads: semFaixa.filter((l) => pontuar(l).total >= NOTA_DA_FAIXA[f]).length,
  }));

  const compativeis = ordenar(aplicar(disponiveis, filtro));

  /**
   * Se o filtro atual não devolve nada, procura a faixa mais próxima que
   * devolveria. É o que transforma "nenhum lead atende" em "existem 8 entre
   * 70 e 79, quer usar?".
   */
  const alternativas =
    compativeis.length === 0
      ? porFaixa
          .filter((f) => f.leads > 0)
          .sort((a, b) => b.nota - a.nota)
          .slice(0, 3)
      : [];

  const notas = compativeis.map((l) => pontuar(l).total);

  return {
    visaoGeral: {
      total: base.length,
      disponiveis: disponiveis.length,
      prontosParaContato: disponiveis.filter((l) => l.whatsapp).length,
      quentes: disponiveis.filter((l) => pontuar(l).total >= 66).length,
      jaContatados: base.length - disponiveis.length,
    },
    segmentos,
    cidades,
    porFaixa,
    alternativas,
    compativeis: compativeis.slice(0, 200).map((l) => ({
      id: l.id,
      nome: l.nome,
      segmento: categoriaSingular(l.categoria),
      cidade: l.cidade,
      bairro: l.bairro,
      nota: pontuar(l).total,
      emoji: pontuar(l).emoji,
      temWhatsapp: Boolean(l.whatsapp),
      temInstagram: Boolean(l.instagram),
    })),
    resumo: {
      compativeis: compativeis.length,
      comWhatsapp: compativeis.filter((l) => l.whatsapp).length,
      quentes: compativeis.filter((l) => pontuar(l).total >= 66).length,
      maiorNota: notas.length ? Math.max(...notas) : 0,
      menorNota: notas.length ? Math.min(...notas) : 0,
    },
  };
}

export type Facetas = Awaited<ReturnType<typeof calcularFacetas>>;

/**
 * Quanto tempo o disparo vai levar, com o intervalo e o teto configurados.
 * Devolve também quantos dias, porque 50 leads a 90s não cabem num teto de 30.
 */
export function estimarDuracao(
  quantidade: number,
  intervaloSegundos: number,
  limiteDiario: number,
) {
  const noDia = Math.min(quantidade, limiteDiario);
  const segundos = Math.max(0, noDia - 1) * intervaloSegundos;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  const dias = Math.ceil(quantidade / Math.max(1, limiteDiario));

  return {
    horas,
    minutos,
    dias,
    legivel:
      horas > 0 ? `${horas}h ${minutos}min` : minutos > 0 ? `${minutos}min` : "instantâneo",
    passaDoDia: quantidade > limiteDiario,
  };
}

/** Nome sugerido: "Oficinas — Uberlândia — 24 ago". */
export function nomeSugerido(segmento?: string, cidade?: string): string {
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const partes = [segmento, cidade].filter(Boolean);
  return partes.length ? `${partes.join(" — ")} — ${data}` : `Campanha — ${data}`;
}
