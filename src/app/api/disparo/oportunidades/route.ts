import { NextResponse } from "next/server";
import { oportunidades, type FiltroOportunidade } from "@/lib/oportunidades";

/**
 * O painel de oportunidades: quem abordar, por quê, e quem ficou de fora.
 *
 * Só leitura — não gera, não aprova, não envia, não escreve nada. Por isso
 * pode ser chamada a cada mudança de filtro sem pensar duas vezes.
 *
 * A resposta traz de propósito os TRÊS números juntos (encontrados, elegíveis,
 * excluídos) mais o detalhamento das recusas. Mostrar só o total é o que fazia
 * a tela prometer um lote que a fila depois recusava.
 */
export const dynamic = "force-dynamic";

function bool(v: string | null): boolean | undefined {
  if (v === null) return undefined;
  return v === "1" || v === "true";
}

function num(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;

  const site = q.get("site");
  const prioridade = q.get("prioridade");
  const nivel = q.get("nivel");
  const aba = q.get("aba");
  const fila = q.get("fila");
  const decisao = q.get("decisao");

  const filtro: FiltroOportunidade = {
    segmento: q.get("segmento") || undefined,
    somenteWhatsapp: bool(q.get("somenteWhatsapp")),
    incluirContatados: bool(q.get("incluirContatados")),
    comInstagram: bool(q.get("comInstagram")),
    site: site === "com" || site === "sem" ? site : "qualquer",
    notaMinima: num(q.get("notaMinima")),
    avaliacoesMinimas: num(q.get("avaliacoesMinimas")),
    prioridade:
      prioridade === "alta" || prioridade === "media" ? prioridade : "todas",

    // Filtros de prospecção local. Todos combináveis entre si — a combinação
    // pequeno + sem site + WhatsApp + potencial é o público mais valioso.
    somentePequenos: bool(q.get("somentePequenos")),
    comPotencialSistema: bool(q.get("comPotencialSistema")),
    semSiteConfirmado: bool(q.get("semSiteConfirmado")),
    nivel:
      nivel === "A" || nivel === "B" || nivel === "C" || nivel === "D" ? nivel : undefined,
    prontosParaProspeccao: bool(q.get("prontosParaProspeccao")),
    potencialForte: bool(q.get("potencialForte")),
    naoContatado: bool(q.get("naoContatado")),
    somenteNaPraca: bool(q.get("somenteNaPraca")),

    /**
     * A ABA do Modo Caça, e o motivo de ela existir aqui.
     *
     * A tela já mandava `fila` nesta rota — e a rota nunca leu o parâmetro.
     * As abas trocavam o rótulo e devolviam sempre a mesma lista, o que dava
     * a impressão de que a fila do Instagram estava vazia. Um filtro que a
     * tela oferece e o servidor ignora é pior que filtro nenhum: ele mente
     * com aparência de resposta.
     */
    aba:
      aba === "melhores" || aba === "whatsapp" || aba === "instagram" || aba === "enriquecer"
        ? aba
        : undefined,
    fila:
      fila === "whatsapp" || fila === "instagram" || fila === "ambos" || fila === "acionaveis"
        ? fila
        : undefined,
    decisao:
      decisao === "quero-vender" || decisao === "vale-abordar" || decisao === "nao-prioritario"
        ? decisao
        : undefined,
    esconderDescartados: bool(q.get("esconderDescartados")),
  };

  const quantidade = Math.min(Math.max(num(q.get("quantidade")) ?? 50, 1), 200);

  return NextResponse.json(await oportunidades(filtro, quantidade));
}
