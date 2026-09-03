import { NextResponse } from "next/server";
import { processarLote, estadoGeracao, recuperarPresos } from "@/lib/gen/fila-geracao";

/**
 * A fila de GERAÇÃO para quem não faz login — o serviço que roda sozinho na
 * máquina, e o cron da Vercel.
 *
 * POR QUE ISTO EXISTE
 *
 * Mesma história de `/api/externo/fila`, um andar antes: a geração por IA
 * vivia num laço dentro do navegador, pedindo lote atrás de lote com a aba
 * aberta. Fechou o notebook, parou de gerar. Como cada lead leva ~15–30s e
 * uma campanha tem dezenas, isso significava ficar olhando a tela por meia
 * hora — ou voltar depois e descobrir que parou no lead 7.
 *
 * Agora o trabalho está numa tabela e QUALQUER processo pode drená-la. Este
 * endpoint é a porta para os processos que não têm sessão.
 *
 * O QUE ESTA ROTA NÃO FAZ
 *
 * Não envia nada. Não fala com a bridge. Não aprova mensagem. O melhor
 * resultado possível de uma chamada aqui é uma linha nova em `mensagens` com
 * status `rascunho` — fora da fila de envio, esperando aprovação humana.
 * Gerar, aprovar e enviar continuam sendo três etapas separadas, e esta é a
 * primeira.
 *
 * Autentica por TOKEN (`?token=` ou `Authorization: Bearer`), igual ao
 * webhook e à fila de envio. Sem `API_TOKEN` no ambiente, a porta fica
 * fechada — nem para o cron.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const esperado = process.env.API_TOKEN;
  if (!esperado) return false; // sem token configurado, ninguém entra
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") === esperado ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") === esperado ||
    // Cron da Vercel: assinado pela própria plataforma com o CRON_SECRET.
    (Boolean(process.env.CRON_SECRET) &&
      request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`)
  );
}

/**
 * Sem `?drenar=1`: só olha quantos itens em cada estado — não gera, não gasta
 * cota. Com `?drenar=1`: processa um lote, igual ao POST.
 *
 * O GET que trabalha existe por um motivo chato e concreto: cron da Vercel só
 * dispara GET. Sem isto, o cron cairia no ramo "só olhar" e nunca faria nada —
 * uma rede de segurança que parece configurada e não segura nada.
 */
export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido" }, { status: 401 });
  }

  const url = new URL(request.url);
  const campanhaId = url.searchParams.get("campanhaId") ?? undefined;

  if (url.searchParams.get("drenar") === "1") return drenar(request, url, campanhaId);
  return NextResponse.json(await estadoGeracao(campanhaId));
}

/**
 * Drena um lote da fila.
 *
 * `max` fica pequeno de propósito: cada item é uma ida ao Gemini com respiro
 * entre elas, e a função tem teto de tempo. É melhor o chamador voltar mais
 * vezes do que um lote grande morrer pela metade — embora morrer pela metade
 * também seja seguro aqui, porque item preso é recuperado no lote seguinte.
 */
export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido" }, { status: 401 });
  }

  const url = new URL(request.url);
  return drenar(request, url, url.searchParams.get("campanhaId") ?? undefined);
}

async function drenar(request: Request, url: URL, campanhaId?: string) {
  const max = Math.min(Math.max(Number(url.searchParams.get("max") ?? 5), 1), 20);

  /**
   * Orçamento bem abaixo do `maxDuration`: a função precisa terminar de
   * escrever o estado do último item ANTES de ser cortada. Cortada no meio, o
   * item fica em `processando` e só volta 5 minutos depois — recuperável, mas
   * é tempo perdido à toa.
   */
  const resumo = await processarLote({ campanhaId, max, orcamentoMs: 80_000 });

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      modulo: "http",
      rota: "/api/externo/geracao",
      ip: request.headers.get("x-forwarded-for") ?? "desconhecido",
      ...resumo,
    }),
  );

  return NextResponse.json(resumo);
}

/**
 * Só recupera itens presos, sem gerar nada.
 *
 * Serve para depois de um deploy ou de uma queda: devolve para a fila o que
 * ficou reservado por um processo que morreu, sem gastar uma única chamada de
 * IA. Barato o bastante para rodar sempre que houver dúvida.
 */
export async function PATCH(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido" }, { status: 401 });
  }
  return NextResponse.json({ recuperados: await recuperarPresos() });
}
