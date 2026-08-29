import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarEGravar } from "@/lib/coletar";

export const maxDuration = 120;

const Body = z.object({
  nicho: z.string().min(2),
  cidade: z.string().min(2),
  estado: z.string().min(2),
  bairro: z.string().optional(),
  quantidade: z.number().int().min(1).max(60).default(20),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  let resultado;
  try {
    resultado = await buscarEGravar(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na busca";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  if (!resultado.salvos.length) {
    return NextResponse.json({
      leads: [],
      buscaPorNome: resultado.buscaPorNome,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
      aviso: resultado.totalEncontrado
        ? `Achei ${resultado.totalEncontrado} estabelecimento(s) desse nicho, mas nenhum tem telefone, Instagram ou e-mail no OpenStreetMap — não daria pra abordar. Tente outro nicho ou outra cidade.`
        : "Nenhum negócio mapeado no OpenStreetMap para esse nicho/cidade. Tente um nicho mais comum, a cidade inteira sem bairro, ou cadastre o lead manualmente.",
    });
  }

  return NextResponse.json({
    leads: resultado.salvos,
    buscaPorNome: resultado.buscaPorNome,
    totalEncontrado: resultado.totalEncontrado,
    totalContatavel: resultado.totalContatavel,
    // Explica o número: você pediu 20 e recebeu 4 porque só 4 dos 51 mapeados
    // têm contato. Sem isso, parece que a busca falhou.
    aviso: resultado.buscaPorNome
      ? "Esse nicho não tem categoria própria no OpenStreetMap, então busquei pelo nome do estabelecimento. O resultado costuma vir menor."
      : resultado.salvos.length < params.quantidade
        ? `${resultado.totalEncontrado} estabelecimento(s) desse nicho estão mapeados na cidade, mas só ${resultado.totalContatavel} têm telefone, Instagram ou e-mail. Mostro apenas os que dá pra abordar.`
        : null,
  });
}
