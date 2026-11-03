import { NextResponse } from "next/server";
import { z } from "zod";
import { buscarEGravar } from "@/lib/coletar";
import { buscarEmpresasCnpj } from "@/lib/cnpj/buscar-empresas";

export const maxDuration = 120;

const Body = z.object({
  nicho: z.string().min(2),
  cidade: z.string().min(2),
  estado: z.string().min(2),
  bairro: z.string().optional(),
  incluirSites: z.boolean().default(false),
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
    resultado = await buscarEGravar(params, buscarEmpresasCnpj);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na busca";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  const sitesParaColetar = resultado.salvos.filter(l => l.website && !l.telefone && !l.instagram && !l.email).length;
  if (!resultado.salvos.length) {
    return NextResponse.json({
      leads: [],
      fonte: "cnpj",
      buscaPorNome: resultado.buscaPorNome,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
      aviso: resultado.totalEncontrado
        ? "Encontrei cadastros ativos, mas não havia telefone ou e-mail disponível para contato. Tente outro segmento ou cidade."
        : "Não encontrei empresas ativas para esse segmento nessa cidade. Confira o nome do segmento e tente uma cidade maior.",
    });
  }

  return NextResponse.json({
    leads: resultado.salvos,
    fonte: "cnpj",
    buscaPorNome: resultado.buscaPorNome,
    totalEncontrado: resultado.totalEncontrado,
    totalContatavel: resultado.totalContatavel,
    // Explica o número: você pediu 20 e recebeu 4 porque só 4 dos 51 mapeados
    // têm contato. Sem isso, parece que a busca falhou.
    aviso: sitesParaColetar > 0
      ? `${sitesParaColetar} empresa(s) têm site, mas ainda não têm contato direto. Use o scraper para completar esses cadastros.`
      : resultado.salvos.length < params.quantidade
        ? `O cadastro público trouxe ${resultado.totalEncontrado} estabelecimento(s); ${resultado.totalContatavel} têm telefone ou e-mail. Os dados podem estar desatualizados.`
        : "Fonte: dados abertos de CNPJ da Receita Federal. Telefones podem estar desatualizados; confira antes de abordar.",
  });
}
