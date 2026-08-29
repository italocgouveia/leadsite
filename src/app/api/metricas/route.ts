import { NextResponse } from "next/server";
import { calcular, type Periodo } from "@/lib/metricas";

/** Métricas do dashboard. Sempre do banco, nunca cacheadas. */
export const dynamic = "force-dynamic";

const PERIODOS: Periodo[] = ["hoje", "7d", "30d", "tudo"];

export async function GET(request: Request) {
  const u = new URL(request.url);
  const bruto = u.searchParams.get("periodo") ?? "30d";

  return NextResponse.json(
    await calcular({
      periodo: PERIODOS.includes(bruto as Periodo) ? (bruto as Periodo) : "30d",
      campanhaId: u.searchParams.get("campanha") ?? undefined,
      segmento: u.searchParams.get("segmento") ?? undefined,
      cidade: u.searchParams.get("cidade") ?? undefined,
    }),
  );
}
