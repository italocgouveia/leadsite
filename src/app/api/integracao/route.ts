import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";
import { CONFIG_ID } from "@/lib/config";
import { estadoIntegracao, lerConfigProvedor, migrarConfigAntiga, urlDoWebhook, validarWebhook } from "@/lib/integracao";
import { provedorDe, mascarar } from "@/lib/providers";
import { decifrar } from "@/lib/segredo";
import { registrar } from "@/lib/campanha";
import { prepararNumero } from "@/lib/telefone";

/**
 * Integração de WhatsApp: estado, teste de conexão, teste de envio e
 * registro automático do webhook.
 *
 * O teste de envio usa a MESMA função do worker (`provedor.enviar`). Um
 * caminho de teste separado provaria que o teste funciona, não que o disparo
 * funciona — que é o que interessa.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const estado = await estadoIntegracao();
  const origem = new URL(request.url).origin;
  const webhook = urlDoWebhook(origem);

  const [c] = await db.select().from(configuracoes).limit(1);

  return NextResponse.json({
    ...estado,
    // Nunca o token: só a máscara.
    tokenMascarado: mascarar(decifrar(c?.provedorToken ?? null)),
    webhook: {
      url: webhook,
      publico: validarWebhook(origem).ok,
      aviso: validarWebhook(origem).aviso ?? null,
      recebendo: Boolean(estado.webhookUltimoEm),
      ultimoEm: estado.webhookUltimoEm,
    },
  });
}

const Acao = z.object({
  acao: z.enum(["testar-conexao", "testar-envio", "registrar-webhook", "migrar"]),
  numero: z.string().max(30).optional(),
  texto: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Acao.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  if (params.acao === "migrar") {
    return NextResponse.json(await migrarConfigAntiga());
  }

  const cfg = await lerConfigProvedor();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, erro: "Configure a URL da API antes de testar." },
      { status: 422 },
    );
  }

  const p = provedorDe(cfg.tipo);

  // ---------------------------------------------------- conexão
  if (params.acao === "testar-conexao") {
    const r = await p.testarConexao(cfg);

    // Guarda o resultado: é ele que destrava "Teste de conexão" no checklist.
    await db
      .update(configuracoes)
      .set({
        provedorTestadoEm: r.ok ? new Date() : null,
        provedorEstado: r.ok ? r.detalhes.estado : null,
        atualizadoEm: new Date(),
      })
      .where(eq(configuracoes.id, CONFIG_ID));

    await registrar(
      r.ok ? "INTEGRATION_CONNECTED" : "INTEGRATION_FAILED",
      r.ok ? `${p.nome} conectado (${r.detalhes.estado})` : `Falha: ${r.erro}`,
    );

    return NextResponse.json(r);
  }

  // ---------------------------------------------------- webhook
  if (params.acao === "registrar-webhook") {
    const origem = new URL(request.url).origin;
    const url = urlDoWebhook(origem);
    const publico = validarWebhook(origem);

    if (!publico.ok) {
      return NextResponse.json(
        { ok: false, erro: publico.aviso, comoResolver: ["Publique o painel ou use um túnel"] },
        { status: 422 },
      );
    }
    if (!p.registrarWebhook) {
      return NextResponse.json({
        ok: false,
        erro: `${p.nome} não permite registrar webhook por API.`,
        comoResolver: [`Cole este endereço no painel do provedor: ${url}`],
      });
    }
    return NextResponse.json(await p.registrarWebhook(cfg, url));
  }

  // ---------------------------------------------------- envio de teste
  const bruto = params.numero?.trim();
  if (!bruto) {
    return NextResponse.json({ ok: false, erro: "Informe o número." }, { status: 400 });
  }

  /**
   * Confere o DDI ANTES de mandar. Sem isso o provedor aceita `34998742209`,
   * devolve sucesso, e a mensagem vai para um número espanhol inexistente —
   * exatamente o que aconteceu no primeiro teste.
   */
  const check = prepararNumero(bruto);
  if (!check.ok) {
    return NextResponse.json(
      {
        ok: false,
        erro: check.erro,
        ...(check.sugestao ? { sugestao: check.sugestao } : {}),
        comoResolver: check.sugestao
          ? [`Use ${check.sugestao}`, "O 55 na frente é o código do Brasil"]
          : ["Confira o número"],
      },
      { status: 422 },
    );
  }

  const numero = check.numero;
  const r = await p.enviar(cfg, numero, params.texto || "Teste enviado pelo sistema.");

  await registrar(
    r.ok ? "TEST_MESSAGE_SENT" : "TEST_MESSAGE_FAILED",
    r.ok ? `Teste enviado para ${numero}` : `Teste falhou: ${r.erro}`,
  );

  return NextResponse.json(r);
}
