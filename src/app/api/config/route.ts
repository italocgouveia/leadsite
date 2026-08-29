import { NextResponse } from "next/server";
import { z } from "zod";
import { db, configuracoes } from "@/lib/db";
import { carregarConfig, CONFIG_ID as ID } from "@/lib/config";
import { validarBaseUrl } from "@/lib/integracao";
import { cifrar, decifrar, temCriptografia } from "@/lib/segredo";
import { mascarar } from "@/lib/providers";

export async function GET() {
  const config = await carregarConfig();
  const { provedorToken, ...semSegredo } = config as Record<string, unknown> & {
    provedorToken?: string | null;
  };

  /**
   * O token NUNCA sai daqui. A tela recebe só a máscara e um booleano —
   * assim ele não aparece no HTML, no devtools nem em cache de navegador.
   */
  return NextResponse.json({
    config: { ...semSegredo, provedorToken: null },
    tokenMascarado: mascarar(decifrar(provedorToken ?? null)),
    temToken: Boolean(provedorToken),
    criptografiaAtiva: temCriptografia(),
  });
}

const Body = z.object({
  marcaDaguaAtiva: z.boolean().optional(),
  marcaDaguaTexto: z.string().max(80).nullable().optional(),
  marcaDaguaUrl: z.string().url().nullable().optional().or(z.literal("")),
  pixelFacebook: z.string().max(40).nullable().optional(),
  googleAnalytics: z.string().max(40).nullable().optional(),
  googleAds: z.string().max(40).nullable().optional(),

  /**
   * Automação. Os limites são validados AQUI, não só na tela: intervalo curto
   * demais e teto alto demais são o que faz a Meta banir o número, e isso não
   * pode depender de o formulário estar correto.
   */
  automacaoAtiva: z.boolean().optional(),
  respostaAutomaticaAtiva: z.boolean().optional(),
  provedorTipo: z.enum(["evolution", "waha", "custom"]).optional(),
  provedorBaseUrl: z.string().nullable().optional().or(z.literal("")),
  provedorInstancia: z.string().max(120).nullable().optional(),
  provedorEndpointCustom: z.string().max(300).nullable().optional(),
  /** Token chega em texto e é CIFRADO antes de gravar. Nunca volta na API. */
  provedorToken: z.string().max(300).nullable().optional(),
  intervaloSegundos: z.coerce.number().int().min(30).max(3600).optional(),
  limiteDiario: z.coerce.number().int().min(1).max(200).optional(),
  janelaRecontatoDias: z.coerce.number().int().min(1).max(365).optional(),

  /** Janela de horário permitido para envio automático (America/Sao_Paulo). */
  horarioEnvioAtivo: z.boolean().optional(),
  horarioInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.").optional(),
  horarioFim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.").optional(),
  variacaoAleatoriaAtiva: z.boolean().optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  /**
   * Valida a URL do provedor ANTES de gravar. Guardar valor inválido só adia
   * o erro para a hora do disparo, quando ele custa mais caro.
   */
  if (params.provedorBaseUrl) {
    const diag = validarBaseUrl(params.provedorBaseUrl);
    if (!diag.ok) {
      return NextResponse.json(
        { erro: diag.erro, comoCorrigir: diag.comoCorrigir },
        { status: 422 },
      );
    }
  }

  /**
   * Token é cifrado aqui, no servidor. Nunca é devolvido pela API — o GET
   * abaixo remove o campo antes de responder.
   */
  const valores = {
    ...params,
    ...(params.provedorToken !== undefined
      ? { provedorToken: cifrar(params.provedorToken) }
      : {}),
    id: ID,
    atualizadoEm: new Date(),
  };

  const [config] = await db
    .insert(configuracoes)
    .values(valores)
    .onConflictDoUpdate({ target: configuracoes.id, set: valores })
    .returning();

  return NextResponse.json({ config });
}
