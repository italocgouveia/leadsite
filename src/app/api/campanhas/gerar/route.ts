import { NextResponse } from "next/server";
import { z } from "zod";
import { criarCampanhaParaGerar, gerarPendentes } from "@/lib/campanha";
import { estadoGeracao } from "@/lib/gen/fila-geracao";

/**
 * Geração por IA, do lado de quem está logado no painel.
 *
 * POST  → cria a campanha e ENFILEIRA os leads. Responde na hora.
 * GET   → estado da fila daquela campanha (só olha, não gera).
 * PATCH → empurra um lote agora, para acelerar enquanto a tela está aberta.
 *
 * O PATCH é OPCIONAL, e essa é a mudança que importa: a fila é uma tabela e
 * anda por conta própria, drenada pelo serviço local e pelo cron. Fechar a
 * aba não para mais nada — antes parava tudo, porque o laço vivia no
 * navegador.
 *
 * NÃO envia nada, em verbo nenhum: as mensagens nascem em `rascunho`. Quem
 * envia continua sendo só o worker da bridge, e só depois de aprovação.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Criar = z.object({
  nome: z.string().min(2).max(80),
  leadIds: z.array(z.string().uuid()).min(1).max(300),
  produto: z.enum(["site", "chatbot", "sistema"]).optional(),
  filtro: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Criar.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const r = await criarCampanhaParaGerar(params);
  return NextResponse.json({ campanha: r.campanha, total: r.total });
}

const Lote = z.object({
  id: z.string().uuid(),
  /** Poucos por chamada: cada lead é uma ida ao Gemini. */
  tamanhoLote: z.number().int().min(1).max(5).default(3),
});

export async function PATCH(request: Request) {
  let params;
  try {
    params = Lote.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  const r = await gerarPendentes(params.id, params.tamanhoLote);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 404 });

  return NextResponse.json({
    restantes: r.restantes,
    geradas: r.geradas,
    pulados: r.pulados,
    pausadoPorCota: r.pausadoPorCota,
    estado: r.estado,
  });
}

/** Estado da fila, para a tela acompanhar sem participar do trabalho. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Falta o id da campanha" }, { status: 400 });
  return NextResponse.json(await estadoGeracao(id));
}
