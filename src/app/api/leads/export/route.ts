import { desc, inArray } from "drizzle-orm";
import { db, leads } from "@/lib/db";

const COLUNAS = [
  "Nome",
  "Categoria",
  "Status do site",
  "Score",
  "Temperatura",
  "Etapa",
  "Telefone",
  "WhatsApp",
  "Site atual",
  "Nota Google",
  "Avaliações",
  "Endereço",
  "Bairro",
  "Cidade",
  "UF",
  "Google Maps",
  "Notas",
] as const;

/**
 * CSV com BOM e separador ";".
 * Sem o BOM, o Excel brasileiro abre "São Paulo" como "SÃ£o Paulo".
 * Com separador vírgula, ele joga tudo numa coluna só. Os dois detalhes
 * importam mais que o resto do arquivo.
 */
function celula(valor: unknown): string {
  if (valor == null) return "";
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function POST(request: Request) {
  let ids: string[] | undefined;
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids) && body.ids.length) ids = body.ids;
  } catch {
    // Sem corpo = exporta tudo.
  }

  const linhas = ids
    ? await db.select().from(leads).where(inArray(leads.id, ids))
    : await db.select().from(leads).orderBy(desc(leads.score));

  const csv = [
    COLUNAS.join(";"),
    ...linhas.map((l) =>
      [
        l.nome,
        l.categoria,
        l.statusSite,
        l.score,
        l.temperatura,
        l.etapa,
        l.telefone,
        l.whatsapp,
        l.website,
        l.nota,
        l.avaliacoes,
        l.endereco,
        l.bairro,
        l.cidade,
        l.estado,
        l.mapsUrl,
        l.notas,
      ]
        .map(celula)
        .join(";"),
    ),
  ].join("\r\n");

  const BOM = "﻿"; // Excel pt-BR precisa disso pra ler acento
  const data = new Date().toISOString().slice(0, 10);

  return new Response(BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${data}.csv"`,
    },
  });
}
