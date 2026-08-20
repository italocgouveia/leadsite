import { NextResponse } from "next/server";
import { municipiosDaUf } from "@/lib/municipios";

export async function GET(request: Request) {
  const uf = new URL(request.url).searchParams.get("uf");
  if (!uf || !/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json({ erro: "UF inválida" }, { status: 400 });
  }

  try {
    return NextResponse.json({ municipios: await municipiosDaUf(uf) });
  } catch {
    return NextResponse.json({ erro: "IBGE indisponível" }, { status: 502 });
  }
}
