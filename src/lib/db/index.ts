import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Banco = NeonHttpDatabase<typeof schema>;

let instancia: Banco | null = null;

function conectar(): Banco {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Na Vercel: Storage > Create Database > Neon, " +
        "ou cadastre a variável em Settings > Environment Variables.",
    );
  }
  instancia ??= drizzle(neon(url), { schema });
  return instancia;
}

/**
 * Conexão preguiçosa, de propósito.
 *
 * A versão anterior validava DATABASE_URL no topo do módulo e o `next build`
 * quebrava inteiro na etapa de "Collecting page data" — porque o Next avalia
 * cada route handler em build, sem nenhuma requisição acontecendo e sem as
 * variáveis de runtime necessariamente presentes.
 *
 * Com o Proxy, nada acontece até alguém realmente usar o banco: o build passa,
 * e quem falha é só a requisição que precisa de dados — com mensagem útil.
 */
export const db = new Proxy({} as Banco, {
  get(_alvo, propriedade, receptor) {
    const real = conectar() as unknown as Record<string | symbol, unknown>;
    const valor = Reflect.get(real, propriedade, receptor);
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
});

export * from "./schema";
