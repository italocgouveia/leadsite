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
  };

  const quantidade = Math.min(Math.max(num(q.get("quantidade")) ?? 50, 1), 200);

  return NextResponse.json(await oportunidades(filtro, quantidade));
}
