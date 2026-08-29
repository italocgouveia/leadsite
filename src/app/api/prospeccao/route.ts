import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, leads, eventos } from "@/lib/db";
import { simplificar, etapaCanonica, VALORES_STATUS, type StatusSimples } from "@/lib/etapa-simples";
import { servicoDoLead, VALORES_SERVICO } from "@/lib/servicos";
import { categoriaSingular, siglaDoEstado } from "@/lib/categoria-nome";
import { linkWhatsapp, formatarTelefone } from "@/lib/telefone";
import { pontuar, contactabilidade } from "@/lib/pontuacao";

/**
 * A página de prospecção inteira, numa chamada.
 *
 * GET devolve leads + contagens; PATCH salva a edição de um lead; POST cria
 * um lead à mão. Uma rota só porque é uma tela só — espalhar isso em três
 * endpoints obrigaria a tela a orquestrar três estados de carregamento para
 * mostrar uma lista.
 */

export const dynamic = "force-dynamic";

/** Só o que a tela usa. Mandar o lead inteiro dobra o tamanho da resposta. */
function paraTela(l: typeof leads.$inferSelect) {
  const servico = servicoDoLead(l);
  const socio = (l.socios ?? []).find((s) => s.decide) ?? (l.socios ?? [])[0];
  const p = pontuar(l);
  const c = contactabilidade(l);

  return {
    id: l.id,
    empresa: l.nome,
    // O responsável vem do QSA da Receita quando existe — é o que separa
    // falar com o dono de falar com quem atende o telefone.
    responsavel: socio?.nome ?? null,
    segmento: categoriaSingular(l.categoria),
    cidade: l.cidade,
    estado: l.estado,
    telefone: l.telefone,
    whatsapp: l.whatsapp,
    instagram: l.instagram,
    email: l.email,
    site: l.website,
    maps: l.mapsUrl,
    servico: servico.valor,
    servicoSugerido: servico.sugerido,
    status: simplificar(l.etapa),
    etapaReal: l.etapa,
    valor: l.valorPotencial,
    notas: l.notas,
    proximoContato: l.proximoContato,
    ultimoContato: l.ultimaInteracao ?? l.atualizadoEm,
    criadoEm: l.criadoEm,

    /**
     * Duas notas, não uma média.
     *
     * `pontos` mede a OPORTUNIDADE (o quanto ele precisa do que você vende) e
     * `contato` mede se dá para falar com ele hoje. Somar as duas numa nota só
     * esconderia os dois casos que mais importam: a empresa que precisa muito
     * mas não tem canal, e a que atende na hora mas não precisa de nada.
     */
    pontos: p.total,
    faixa: p.classificacao,
    emoji: p.emoji,
    rotuloPontos: p.rotulo,
    contato: c.score,
    rotuloContato: c.rotulo,
  };
}

export async function GET() {
  const base = await db.select().from(leads).orderBy(desc(leads.atualizadoEm));

  /**
   * Mais quente primeiro, e o desempate é por contactabilidade.
   *
   * Ordenar por data respondia "o que mexi por último?", que não é a pergunta
   * de quem abre a tela para trabalhar. A pergunta é "quem eu procuro agora?"
   * — e a resposta é quem mais precisa do que você vende, entre os que você
   * consegue alcançar.
   */
  const lista = base
    .map(paraTela)
    .sort((a, b) => b.pontos - a.pontos || b.contato - a.contato);

  const conta = (s: StatusSimples) => lista.filter((l) => l.status === s).length;

  return NextResponse.json({
    leads: lista,
    resumo: {
      total: lista.length,
      novo: conta("novo"),
      conversa: conta("conversa") + conta("contatado"),
      proposta: conta("proposta") + conta("negociacao"),
      fechado: conta("fechado"),
      perdido: conta("perdido"),
    },
  });
}

const Editar = z.object({
  id: z.string().uuid(),
  status: z.enum(VALORES_STATUS as unknown as [string, ...string[]]).optional(),
  servico: z.enum(VALORES_SERVICO as unknown as [string, ...string[]]).optional(),
  valor: z.number().int().min(0).max(10_000_000).nullable().optional(),
  notas: z.string().max(5000).optional(),
  proximoContato: z.string().nullable().optional(),
  /** Você abriu o WhatsApp deste lead. Ver o tratamento no PATCH. */
  registrarContato: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  let p;
  try {
    p = Editar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const [antes] = await db.select().from(leads).where(eq(leads.id, p.id)).limit(1);
  if (!antes) return NextResponse.json({ erro: "Lead não encontrado" }, { status: 404 });

  /**
   * Reabrir um opt-out é recusado aqui, não só escondido na tela.
   *
   * Quem está em `opt-out` pediu explicitamente para não receber mais nada.
   * Mudar o status devolveria esse lead para a fila de disparo. A trava mora
   * no servidor porque tela é sugestão e servidor é regra.
   */
  if (antes.etapa === "opt-out" && p.status && p.status !== "perdido") {
    return NextResponse.json(
      {
        erro:
          "Este lead pediu para não ser mais contatado. Reabrir faria o sistema " +
          "mandar mensagem para quem pediu para parar.",
      },
      { status: 409 },
    );
  }

  const agora = new Date();

  /**
   * Abrir o WhatsApp marca "Contatado" — mas SÓ SOBE, nunca desce.
   *
   * A regra ingênua ("clicou, vira contatado") tem um efeito ruim: você está
   * negociando com alguém em "Proposta enviada", abre o WhatsApp para
   * responder uma dúvida, e o lead volta para "Contatado". O trabalho de
   * semanas some do funil por causa de um clique.
   *
   * Então o avanço só acontece a partir de "Novo". Em qualquer outra etapa a
   * data de último contato é atualizada e o status fica onde está — inclusive
   * em `opt-out`, que nunca é reaberto por clique.
   */
  const avancarPorContato =
    p.registrarContato && simplificar(antes.etapa) === "novo"
      ? { etapa: etapaCanonica("contatado") }
      : {};

  await db
    .update(leads)
    .set({
      ...avancarPorContato,
      ...(p.registrarContato ? { ultimaInteracao: agora } : {}),
      ...(p.status ? { etapa: etapaCanonica(p.status as StatusSimples) } : {}),
      ...(p.servico ? { servico: p.servico } : {}),
      ...(p.valor !== undefined ? { valorPotencial: p.valor } : {}),
      ...(p.notas !== undefined ? { notas: p.notas } : {}),
      ...(p.proximoContato !== undefined
        ? { proximoContato: p.proximoContato ? new Date(p.proximoContato) : null }
        : {}),
      // Entrou no funil por escolha sua no momento em que você editou.
      noCrm: true,
      visto: true,
      atualizadoEm: agora,
    })
    .where(eq(leads.id, p.id));

  // Só registra mudança de status: anotar cada tecla digitada polui o histórico.
  if (p.status && simplificar(antes.etapa) !== p.status) {
    await db.insert(eventos).values({
      tipo: "lead.status",
      descricao: `${antes.nome}: ${simplificar(antes.etapa)} → ${p.status}`,
      leadId: p.id,
    });
  }

  if (p.registrarContato) {
    await db.insert(eventos).values({
      tipo: "lead.whatsapp",
      descricao: `${antes.nome}: WhatsApp aberto${
        Object.keys(avancarPorContato).length ? " — movido para Contatado" : ""
      }`,
      leadId: p.id,
    });
  }

  const [depois] = await db.select().from(leads).where(eq(leads.id, p.id)).limit(1);
  return NextResponse.json({ lead: paraTela(depois) });
}

const Criar = z.object({
  empresa: z.string().min(2).max(200),
  responsavel: z.string().max(200).optional(),
  telefone: z.string().max(40).optional(),
  segmento: z.string().max(100).optional(),
  servico: z.enum(VALORES_SERVICO as unknown as [string, ...string[]]).optional(),
  instagram: z.string().max(300).optional(),
  maps: z.string().max(500).optional(),
  site: z.string().max(500).optional(),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(40).optional(),
  notas: z.string().max(5000).optional(),
});

export async function POST(request: Request) {
  let p;
  try {
    p = Criar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const telefone = formatarTelefone(p.telefone);

  const [novo] = await db
    .insert(leads)
    .values({
      /**
       * `placeId` é a chave que evita duplicata entre buscas. Lead digitado à
       * mão não tem id do mapa, então recebe um prefixo próprio — sem isso
       * dois cadastros manuais colidiriam no índice único.
       */
      placeId: `manual:${crypto.randomUUID()}`,
      nome: p.empresa.trim(),
      categoria: p.segmento?.trim() || null,
      cidade: p.cidade?.trim() || null,
      estado: siglaDoEstado(p.estado),
      telefone,
      whatsapp: linkWhatsapp(telefone),
      instagram: p.instagram?.trim() || null,
      website: p.site?.trim() || null,
      mapsUrl: p.maps?.trim() || null,
      notas: p.notas?.trim() || null,
      servico: p.servico ?? null,
      // Sem auditoria de site, o status honesto é "não verificado".
      statusSite: p.site?.trim() ? "tem-site" : "nao-verificado",
      score: 0,
      temperatura: "frio",
      etapa: "novo",
      noCrm: true,
      visto: true,
      ...(p.responsavel?.trim()
        ? { socios: [{ nome: p.responsavel.trim(), qualificacao: "Informado por você", decide: true }] }
        : {}),
    })
    .returning();

  await db.insert(eventos).values({
    tipo: "lead.criado",
    descricao: `${novo.nome} adicionado à mão`,
    leadId: novo.id,
  });

  return NextResponse.json({ lead: paraTela(novo) });
}
