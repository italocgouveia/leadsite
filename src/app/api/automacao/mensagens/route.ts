import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, leads, mensagens, STATUS_MENSAGEM, type StatusMensagem } from "@/lib/db";
import { lerConfig, podeContatar } from "@/lib/fila";
import { montarProposta } from "@/lib/proposta";
import { resolverSaudacao, reinserirSaudacao } from "@/lib/saudacao";
import { montarPropostaSistema, avaliarSistema } from "@/lib/sistemas";
import { avaliar } from "@/lib/oportunidade";
import { regenerar } from "@/lib/gen/fila-geracao";

/**
 * Mensagens da automação: listar, criar rascunho, aprovar, editar, cancelar.
 *
 * Nada sai daqui direto para o WhatsApp. Criar mensagem só monta o texto e
 * deixa em `rascunho`; o envio é da fila, e só depois de você aprovar.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const linhas = await db
    .select({
      m: mensagens,
      lead: leads,
    })
    .from(mensagens)
    .innerJoin(leads, eq(mensagens.leadId, leads.id))
    .where(
      status && STATUS_MENSAGEM.includes(status as StatusMensagem)
        ? eq(mensagens.status, status as StatusMensagem)
        : undefined,
    )
    .orderBy(desc(mensagens.criadoEm))
    .limit(500);

  /**
   * A tela recebe a saudação já resolvida.
   *
   * No banco o texto guarda `{{saudacao}}` de propósito — a fila leva dias
   * para escoar e a troca acontece no envio. Mas mostrar o marcador cru na
   * lista faria você revisar uma mensagem que não é a que sai, e pior: quem
   * clicasse em "Editar" salvaria o marcador por cima, perdendo a saudação
   * dinâmica daquela mensagem para sempre.
   */
  return NextResponse.json({
    mensagens: linhas.map((l) => ({
      ...l,
      m: { ...l.m, texto: resolverSaudacao(l.m.texto) },
    })),
  });
}

const Criar = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(100),
  produto: z.enum(["site", "chatbot", "sistema"]).optional(),
});

/**
 * Monta rascunho para os leads pedidos.
 *
 * Usa os MOTORES QUE JÁ EXISTEM (proposta.ts e sistemas.ts), não a IA: eles
 * são instantâneos, não gastam cota e já personalizam por ramo, com gênero e
 * plural corretos. A IA entra como melhoria opcional, num segundo passo.
 */
export async function POST(request: Request) {
  let params;
  try {
    params = Criar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const cfg = await lerConfig();
  const alvos = await db.select().from(leads).where(inArray(leads.id, params.leadIds));

  const criadas: string[] = [];
  const pulados: { nome: string; motivo: string }[] = [];

  for (const lead of alvos) {
    const check = await podeContatar(lead, cfg);
    if (!check.pode) {
      pulados.push({ nome: lead.nome, motivo: check.motivo });
      continue;
    }

    // Sistema tem motor próprio; site e chatbot saem do motor de proposta.
    const querSistema =
      params.produto === "sistema" ||
      (!params.produto && avaliarSistema(lead).serve && avaliar(lead).produto === "site");

    const texto = querSistema
      ? montarPropostaSistema(lead)
      : montarProposta(lead).mensagem;

    if (!texto) {
      pulados.push({ nome: lead.nome, motivo: "Não consegui montar mensagem para este ramo." });
      continue;
    }

    const [nova] = await db
      .insert(mensagens)
      .values({
        leadId: lead.id,
        texto,
        produto: querSistema ? "sistema" : avaliar(lead).produto,
        origem: "modelo",
        status: "rascunho",
      })
      .returning({ id: mensagens.id });

    criadas.push(nova.id);
  }

  return NextResponse.json({ criadas: criadas.length, pulados });
}

/**
 * Ação em lote. Existe para aprovar e cancelar em volume — revisar uma a uma
 * e clicar uma a uma são coisas diferentes, e só a segunda é desperdício.
 *
 * Editar continua fora daqui de propósito: texto em lote é justamente o que
 * transforma abordagem personalizada em spam.
 */
const EmLote = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  acao: z.enum(["aprovar", "cancelar"]),
});

export async function PUT(request: Request) {
  let params;
  try {
    params = EmLote.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const agora = new Date();

  // Só rascunho vira aprovada: aprovar algo já enviado não significa nada.
  const alvo =
    params.acao === "aprovar"
      ? and(inArray(mensagens.id, params.ids), eq(mensagens.status, "rascunho"))
      : and(
          inArray(mensagens.id, params.ids),
          inArray(mensagens.status, ["rascunho", "aprovada", "na-fila", "erro"]),
        );

  const alteradas = await db
    .update(mensagens)
    .set(
      params.acao === "aprovar"
        ? { status: "aprovada", aprovadaEm: agora, erro: null, atualizadoEm: agora }
        : { status: "cancelada", atualizadoEm: agora },
    )
    .where(alvo)
    .returning({ id: mensagens.id });

  return NextResponse.json({ alteradas: alteradas.length });
}

const Atualizar = z.object({
  id: z.string().uuid(),
  acao: z.enum(["aprovar", "editar", "cancelar", "marcar-respondida", "regenerar"]),
  texto: z.string().min(10).max(4000).optional(),
});

export async function PATCH(request: Request) {
  let params;
  try {
    params = Atualizar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [msg] = await db.select().from(mensagens).where(eq(mensagens.id, params.id)).limit(1);
  if (!msg) return NextResponse.json({ erro: "Mensagem não encontrada" }, { status: 404 });

  /**
   * Regenerar NÃO gera aqui: devolve o lead para a fila de geração, que é a
   * única que conta cota e trata 429. Ver `regenerar` em lib/gen/fila-geracao.
   */
  if (params.acao === "regenerar") {
    const r = await regenerar(params.id);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 409 });
    return NextResponse.json({ ok: true, refazendo: true });
  }

  // Depois de enviada, editar o texto seria mentir sobre o que foi mandado.
  if (params.acao === "editar" && msg.status !== "rascunho") {
    return NextResponse.json(
      { erro: "Só dá para editar enquanto está em rascunho." },
      { status: 409 },
    );
  }

  const agora = new Date();
  const mudanca =
    params.acao === "aprovar"
      ? { status: "aprovada" as const, aprovadaEm: agora, erro: null }
      : params.acao === "editar"
        ? {
            /**
             * O texto volta com o marcador. A tela mostra "Bom dia" resolvido,
             * então salvar o que se vê chumbaria a saudação do momento da
             * EDIÇÃO numa mensagem que só sai dias depois.
             */
            texto: reinserirSaudacao(params.texto ?? msg.texto),
            /**
             * Marca de que este texto é SEU. É o que impede uma regeneração
             * posterior de apagar seu ajuste sem avisar.
             */
            origem: "manual" as const,
          }
        : params.acao === "cancelar"
          ? { status: "cancelada" as const }
          : { status: "respondida" as const, respondidaEm: agora };

  const [salva] = await db
    .update(mensagens)
    .set({ ...mudanca, atualizadoEm: agora })
    .where(eq(mensagens.id, params.id))
    .returning();

  /**
   * Respondeu: o lead sai da automação e o funil reflete isso sozinho. Deixar
   * para o usuário mover à mão é como se perde o retorno mais valioso do dia.
   */
  if (params.acao === "marcar-respondida") {
    await db
      .update(leads)
      .set({ etapa: "respondeu", noCrm: true, atualizadoEm: agora })
      .where(eq(leads.id, msg.leadId));

    await db
      .update(mensagens)
      .set({ status: "cancelada", erro: "Lead respondeu", atualizadoEm: agora })
      .where(
        and(eq(mensagens.leadId, msg.leadId), inArray(mensagens.status, ["rascunho", "aprovada", "na-fila"])),
      );
  }

  return NextResponse.json({ mensagem: salva });
}
