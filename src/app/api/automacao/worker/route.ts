import { NextResponse } from "next/server";
import { z } from "zod";
import { lerConfigProvedor } from "@/lib/integracao";
import { controlarWorker } from "@/lib/bridge";

/**
 * Controle do worker da bridge, a partir do painel logado.
 *
 * Só repassa para `/worker/ligar` ou `/worker/desligar` na bridge, com o
 * mesmo token que `enviar()` já usa (`lerConfigProvedor().apiKey`) — o token
 * nunca sai daqui para o navegador. Protegido pela sessão do painel (mesmo
 * gate de `src/proxy.ts` que já cobre todo `/api/automacao/*` fora de
 * `/status`, que é o webhook público).
 */

const Body = z.object({
  acao: z.enum(["ligar", "desligar"]),
  limite: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  let body;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos." }, { status: 400 });
  }

  const cfgProv = await lerConfigProvedor();
  if (!cfgProv) {
    return NextResponse.json({ erro: "Provedor de WhatsApp não configurado." }, { status: 422 });
  }

  const r = await controlarWorker(cfgProv, body.acao, body.limite);
  if (!r.ok) {
    return NextResponse.json({ erro: r.erro }, { status: 502 });
  }

  return NextResponse.json(r);
}
