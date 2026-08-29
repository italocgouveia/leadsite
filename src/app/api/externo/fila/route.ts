import { NextResponse } from "next/server";
import { enviarProxima, lerConfig, podeEnviarAgora, enviadasHoje } from "@/lib/fila";

/**
 * A fila, para quem não faz login: um serviço rodando sozinho na máquina.
 *
 * POR QUE ISTO EXISTE
 *
 * O laço de envio vivia só no navegador, com a aba aberta. A escolha era
 * deliberada — você via o ritmo acontecendo e fechar a página parava tudo.
 * Só que na prática significava que fechar o notebook parava a prospecção, e
 * automação que só funciona enquanto você olha não é automação.
 *
 * O QUE MUDA E O QUE NÃO MUDA
 *
 * Muda quem chama. NÃO muda o que acontece a cada chamada: é a mesma
 * `enviarProxima`, com as mesmas travas revalidadas do zero — automação
 * pausada, teto diário, intervalo entre envios, opt-out, lead que respondeu,
 * campanha pausada. Nenhuma delas é relaxada por isto rodar sem ninguém
 * olhando; se alguma coisa, elas ficam MAIS importantes.
 *
 * O teto diário é o que segura o estrago quando algo dá errado de madrugada.
 * Ele é o único freio que sobra quando não há ninguém para fechar a aba.
 *
 * Autentica por TOKEN (`?token=` ou `Authorization: Bearer`), igual ao
 * webhook. Sem `API_TOKEN` no ambiente, a porta fica fechada.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: Request): boolean {
  const esperado = process.env.API_TOKEN;
  if (!esperado) return false; // sem token configurado, ninguém entra
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") === esperado ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") === esperado
  );
}

/**
 * Origem de quem bateu na porta — para responder "quem está chamando a fila
 * real?" olhando o log, em vez de capturar conexão de rede ao vivo (como foi
 * preciso da vez que a bridge apareceu chamando isto sem ninguém lembrar).
 */
function logRequisicao(request: Request, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      modulo: "http",
      rota: "/api/externo/fila",
      metodo: request.method,
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "desconhecido",
      userAgent: request.headers.get("user-agent") ?? "desconhecido",
      ...extra,
    }),
  );
}

/** Diagnóstico: o que a fila faria agora, sem fazer. */
export async function GET(request: Request) {
  logRequisicao(request, { acao: "diagnostico" });
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido ou ausente." }, { status: 401 });
  }

  const cfg = await lerConfig();
  const [bloqueio, hoje] = await Promise.all([podeEnviarAgora(cfg), enviadasHoje()]);

  return NextResponse.json({
    ativa: cfg.automacaoAtiva,
    enviadasHoje: hoje,
    limiteDiario: cfg.limiteDiario,
    intervaloSegundos: cfg.intervaloSegundos,
    pode: bloqueio.pode,
    motivo: bloqueio.pode ? null : bloqueio.motivo,
    esperarSegundos: bloqueio.pode ? 0 : (bloqueio.esperarSegundos ?? 0),
  });
}

/** Manda a próxima, se puder. Uma por chamada. */
export async function POST(request: Request) {
  logRequisicao(request, { acao: "enviar" });
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "Token inválido ou ausente." }, { status: 401 });
  }
  return NextResponse.json(await enviarProxima(undefined, { origem: "externo/fila" }));
}
