import { NextResponse } from "next/server";
import { todosMunicipios } from "@/lib/municipios";

/**
 * Lista completa do Brasil, para o autocomplete deduzir a UF sozinho.
 * Cache longo na borda: a lista de municípios praticamente não muda.
 */
export async function GET() {
  try {
    const municipios = await todosMunicipios();
    return NextResponse.json(
      { municipios },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=2592000" } },
    );
  } catch {
    return NextResponse.json({ erro: "IBGE indisponível" }, { status: 502 });
  }
}
