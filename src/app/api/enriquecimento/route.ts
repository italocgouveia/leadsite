import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enfileirar,
  processarLote,
  recuperarPresos,
  limparResolvidos,
  estadoDaFila,
  listarFila,
} from "@/lib/enriquecimento-fila";

/**
 * A fila de enriquecimento: achar telefone dos melhores leads que não têm.
 *
 * GET  → estado da fila e os itens, para a tela.
 * POST → enfileira os candidatos e/ou processa um lote.
 *
 * NÃO ENVIA MENSAGEM. Nenhum verbo daqui toca em `mensagens`, na fila de envio
 * ou na Bridge — o único efeito possível é gravar telefone num lead. A
 * separação é o ponto do recurso: quem procura contato não conversa com
 * ninguém.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [resumo, itens] = await Promise.all([estadoDaFila(), listarFila(100)]);
  return NextResponse.json({ resumo, itens });
}

const Acao = z.object({
  acao: z.enum(["enfileirar", "processar", "ambos"]).default("ambos"),
  /**
   * Teto por chamada. Baixo de propósito: cada item pode bater num site
   * externo, e uma requisição HTTP que demora 8s vezes 200 itens estoura
   * qualquer tempo limite de rota.
   */
  max: z.number().int().min(1).max(50).default(10),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Acao.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  // Item preso de uma execução que morreu no meio volta para a fila sozinho.
  const recuperados = await recuperarPresos();
  // Lead que ganhou telefone por outro caminho sai da fila antes de gastar consulta.
  const resolvidos = await limparResolvidos();

  const fila =
    params.acao === "processar" ? { novos: 0, jaNaFila: 0 } : await enfileirar();

  const lote =
    params.acao === "enfileirar"
      ? { processados: [], encontrados: 0 }
      : await processarLote({ max: params.max });

  return NextResponse.json({
    recuperados,
    resolvidos,
    enfileirados: fila.novos,
    jaNaFila: fila.jaNaFila,
    processados: lote.processados.length,
    encontrados: lote.encontrados,
    detalhes: lote.processados,
    resumo: await estadoDaFila(),
  });
}
