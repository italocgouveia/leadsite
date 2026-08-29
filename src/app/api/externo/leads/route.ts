import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, type SQL } from "drizzle-orm";
import { db, leads, ETAPAS, type Etapa } from "@/lib/db";
import { avaliar, ehOportunidade } from "@/lib/oportunidade";
import { categoriaSingular } from "@/lib/categoria-nome";
import { SEM_SITE } from "@/lib/places/audit";

/**
 * Saída de leads para ferramentas externas (n8n, Make, Zapier, planilha).
 *
 * Autentica por TOKEN, não por sessão: ferramenta de automação não consegue
 * fazer login com Google. O token vai no cabeçalho `Authorization: Bearer` ou
 * em `?token=`, porque nem toda ferramenta deixa customizar cabeçalho.
 *
 * Só leitura. Nenhum parâmetro daqui altera dado — automação com permissão de
 * escrita é outra conversa e exigiria muito mais cuidado.
 */

export const dynamic = "force-dynamic";

// Vem de ETAPAS para não desatualizar quando o funil mudar de novo.
const ETAPAS_VALIDAS: Etapa[] = ETAPAS.map((e) => e.valor);

function autorizado(request: Request): boolean {
  const esperado = process.env.API_TOKEN;
  if (!esperado) return false; // sem token configurado, a porta fica fechada

  const url = new URL(request.url);
  const daQuery = url.searchParams.get("token");
  const doHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return daQuery === esperado || doHeader === esperado;
}

function paraCsv(linhas: Record<string, unknown>[]): string {
  if (linhas.length === 0) return "";
  const colunas = Object.keys(linhas[0]);

  const celula = (v: unknown) => {
    if (v == null) return "";
    const t = String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  return [
    colunas.join(";"),
    ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(";")),
  ].join("\r\n");
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json(
      { erro: "Token inválido ou ausente. Use ?token= ou Authorization: Bearer." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato") === "csv" ? "csv" : "json";
  const etapa = url.searchParams.get("etapa");
  const cidade = url.searchParams.get("cidade");
  const desde = url.searchParams.get("desde"); // AAAA-MM-DD
  const soOportunidades = url.searchParams.get("oportunidades") === "1";
  const soContato = url.searchParams.get("contato") === "1";
  const limite = Math.min(Number(url.searchParams.get("limite") ?? 500), 2000);

  const condicoes: SQL[] = [];
  if (etapa && ETAPAS_VALIDAS.includes(etapa as Etapa)) {
    condicoes.push(eq(leads.etapa, etapa as Etapa));
  }
  if (cidade) condicoes.push(eq(leads.cidade, cidade));
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    condicoes.push(gte(leads.criadoEm, new Date(desde)));
  }
  if (url.searchParams.get("semSite") === "1") {
    condicoes.push(inArray(leads.statusSite, SEM_SITE));
  }

  const brutos = await db
    .select()
    .from(leads)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(leads.score))
    .limit(limite);

  const filtrados = brutos
    .filter((l) => (soOportunidades ? ehOportunidade(l) : true))
    .filter((l) => (soContato ? Boolean(l.telefone || l.instagram) : true));

  /**
   * Formato achatado e em português: quem consome isso é uma planilha ou um
   * fluxo do n8n, não outro programa nosso. Nada de objeto aninhado.
   */
  const saida = filtrados.map((l) => {
    const o = avaliar(l);
    return {
      nome: l.nome,
      ramo: categoriaSingular(l.categoria),
      cidade: l.cidade ?? "",
      estado: l.estado ?? "",
      bairro: l.bairro ?? "",
      endereco: l.endereco ?? "",
      telefone: l.telefone ?? "",
      whatsapp: l.whatsapp ?? "",
      instagram: l.instagram ?? "",
      email: l.email ?? "",
      site: l.website ?? "",
      status_site: l.statusSite,
      oportunidade: o.nivel,
      motivo: o.resumo,
      servico_sugerido: o.servico,
      nota_google: l.nota ?? "",
      avaliacoes: l.avaliacoes ?? "",
      etapa: l.etapa,
      maps: l.mapsUrl ?? "",
      criado_em: l.criadoEm.toISOString(),
    };
  });

  if (formato === "csv") {
    const data = new Date().toISOString().slice(0, 10);
    // BOM: sem ele o Excel brasileiro abre "São Paulo" como "SÃ£o Paulo".
    return new Response("﻿" + paraCsv(saida), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${data}.csv"`,
      },
    });
  }

  return NextResponse.json({ total: saida.length, leads: saida });
}
