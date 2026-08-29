import { evolution } from "./evolution";
import { waha } from "./waha";
import { custom } from "./custom";
import type { Provedor, TipoProvedor } from "./tipos";

export * from "./tipos";

const MAPA: Record<TipoProvedor, Provedor> = { evolution, waha, custom };

/** O único ponto do sistema que decide qual adaptador usar. */
export function provedorDe(tipo: TipoProvedor | string | null | undefined): Provedor {
  return MAPA[(tipo ?? "evolution") as TipoProvedor] ?? evolution;
}

export const PROVEDORES: { valor: TipoProvedor; nome: string; dica: string }[] = [
  {
    valor: "evolution",
    nome: "Evolution API",
    dica: "Instância no caminho da URL, header apikey",
  },
  { valor: "waha", nome: "WAHA", dica: "Sessão no corpo, header X-Api-Key" },
  { valor: "custom", nome: "API personalizada", dica: "Você informa o endpoint completo" },
];
