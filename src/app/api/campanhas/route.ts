import { NextResponse } from "next/server";
import { z } from "zod";
import {
  montarCampanha,
  listarComProgresso,
  iniciar,
  pausar,
  parar,
  progresso,
} from "@/lib/campanha";

/**
 * Campanhas: listar, montar, iniciar, pausar, encerrar.
 *
 * Montar NÃO envia. Iniciar NÃO envia. Quem envia é /api/automacao/fila, uma
 * mensagem por chamada, revalidando as travas do zero — separar assim é o que
 * garante que "iniciar campanha" nunca vire uma rajada.
 */

export const dynamic = "force-dynamic";
/**
 * 60s bastava quando montar campanha só gravava texto pronto. Com
 * `usarIA`, é uma chamada ao Gemini POR LEAD, sequencial — mesmo raciocínio
 * "low" e mensagem curta, um lote de leads pode passar de 60s. Mesmo teto
 * que /api/sites/generate já usa pelo mesmo motivo.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id) return NextResponse.json({ progresso: await progresso(id) });
  return NextResponse.json({ campanhas: await listarComProgresso() });
}

const Montar = z.object({
  nome: z.string().min(2).max(80),
  leadIds: z.array(z.string().uuid()).min(1).max(300),
  /** Texto literal e único para todos os leads — ver `montarCampanha`. */
  mensagem: z.string().min(10).max(4000).optional(),
  /** Uma mensagem por IA, diferente por lead — ver `montarCampanha`. */
  usarIA: z.boolean().optional(),
  produto: z.enum(["site", "chatbot", "sistema"]).optional(),
  filtro: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Montar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const r = await montarCampanha(params);
  return NextResponse.json({
    campanha: r.campanha,
    criadas: r.criadas,
    pulados: r.pulados,
  });
}

const Acao = z.object({
  id: z.string().uuid(),
  acao: z.enum(["iniciar", "pausar", "parar"]),
});

export async function PATCH(request: Request) {
  let params;
  try {
    params = Acao.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const r =
    params.acao === "iniciar"
      ? await iniciar(params.id)
      : params.acao === "pausar"
        ? await pausar(params.id)
        : await parar(params.id);

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 409 });
  return NextResponse.json({ ...r, progresso: await progresso(params.id) });
}
