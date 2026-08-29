import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarEGravar } from "@/lib/coletar";
import { buscarPertoDeCachoeira } from "@/lib/osm/cachoeira";

/**
 * Busca hospedagem perto de cachoeira, num estado inteiro.
 *
 * É pesada por natureza — cruza todas as cachoeiras mapeadas do estado com
 * um raio de busca. Levou 40s em Minas Gerais, então o limite de execução
 * fica no teto que a Vercel permite no plano atual.
 */

export const maxDuration = 300;

const Body = z.object({
  estado: z.string().min(2),
  raioKm: z.number().int().min(1).max(50).default(15),
  quantidade: z.number().int().min(1).max(200).default(60),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  try {
    const resultado = await buscarEGravar(
      {
        nicho: "chalé",
        // Sem município definido: cada lead traz o seu de `addr:city`, e este
        // valor só entra como reserva para quem não tiver a tag preenchida.
        cidade: params.estado,
        estado: params.estado,
        quantidade: params.quantidade,
      },
      () =>
        buscarPertoDeCachoeira({
          estado: params.estado,
          raioKm: params.raioKm,
          quantidade: params.quantidade,
        }),
    );

    return NextResponse.json({
      leads: resultado.salvos,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
      aviso: resultado.salvos.length
        ? null
        : `Nenhuma hospedagem com contato num raio de ${params.raioKm}km de cachoeira em ${params.estado}. Tente aumentar o raio.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na busca";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
