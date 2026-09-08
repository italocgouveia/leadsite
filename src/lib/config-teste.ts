import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";

/**
 * Trocar a configuração compartilhada num teste SEM conseguir deixá-la torta.
 *
 * O ACIDENTE QUE ISTO IMPEDE
 *
 * `test:campanha` fazia snapshot, trocava o provedor e restaurava no fim do
 * `main`. Um laço de testes estourou o tempo e matou o processo no meio — a
 * restauração nunca rodou, e a configuração de produção ficou apontando para
 * `provedor-de-teste.example.com` com token de teste.
 *
 * TRÊS REDES, E O QUE CADA UMA REALMENTE COBRE
 *
 *   1. `finally`      — caminho normal e exceção. Confiável.
 *   2. sinais         — SIGINT/SIGTERM. Confiável no Linux; **no Windows não**.
 *                       Medido neste projeto: matar o próprio processo com
 *                       SIGINT no Windows encerra sem rodar handler nenhum, e
 *                       a configuração ficou suja. Continua registrado porque
 *                       ajuda onde funciona, mas NÃO é garantia.
 *   3. o detector     — `lib/config-producao.ts`. É esta que de fato protege:
 *                       mesmo com a configuração suja, o worker se recusa a
 *                       ligar e o pré-voo mostra o motivo.
 *
 * Como (2) não vale no Windows, o valor de teste aponta para `127.0.0.1` de
 * propósito (ver `provedorDeTeste`): se vazar, vaza numa forma que o detector
 * reconhece na hora, em vez de um endereço plausível que passa batido.
 *
 * REGRA MAIOR, e ela vem antes desta função: teste que pode usar mock local
 * não deve tocar na configuração compartilhada. Isto existe para o caso em que
 * não dá — o teste exercita justamente o caminho que lê `configuracoes`.
 */

type Config = typeof configuracoes.$inferSelect;
type Remendo = Partial<typeof configuracoes.$inferInsert>;

/** As colunas que os testes mexem. Restaurar só o que se trocou. */
const CAMPOS_RESTAURAVEIS = [
  "provedorUrl",
  "provedorTipo",
  "provedorBaseUrl",
  "provedorInstancia",
  "provedorEndpointCustom",
  "provedorToken",
  "provedorTestadoEm",
  "automacaoAtiva",
  "limiteDiario",
] as const;

/**
 * Roda `fn` com a configuração remendada e devolve a original DE QUALQUER
 * JEITO que a execução termine.
 *
 * Uso:
 *   await comConfigDeTeste({ provedorBaseUrl: "http://127.0.0.1:8098" }, async () => {
 *     ...  // aqui a config está trocada
 *   });                                  // aqui já voltou ao que era
 */
export async function comConfigDeTeste<T>(
  remendo: Remendo,
  fn: (original: Config) => Promise<T>,
): Promise<T> {
  const [original] = await db.select().from(configuracoes);
  if (!original) throw new Error("Sem linha em `configuracoes` para remendar.");

  /** Só os campos que o remendo toca — restaurar o resto seria escrever à toa. */
  const paraVoltar: Remendo = {};
  for (const campo of CAMPOS_RESTAURAVEIS) {
    if (campo in remendo) {
      (paraVoltar as Record<string, unknown>)[campo] = (original as Record<string, unknown>)[campo];
    }
  }

  let restaurado = false;
  const restaurar = async () => {
    if (restaurado) return;
    restaurado = true;
    await db
      .update(configuracoes)
      .set({ ...paraVoltar, atualizadoEm: new Date() })
      .where(eq(configuracoes.id, original.id));
  };

  /**
   * A versão síncrona para os handlers de sinal: `process.on("exit")` não
   * espera promessa. Não dá para garantir a escrita ali, então o que se faz é
   * AVISAR alto — e os handlers de SIGINT/SIGTERM abaixo, que ainda podem
   * esperar, fazem a restauração de verdade.
   */
  const avisar = () => {
    if (restaurado) return;
    console.error(
      "\n🚨 A configuração de produção pode ter ficado com valores de teste.\n" +
        "   Rode: npx tsx src/scripts/restaurar-provedor.ts --executar\n",
    );
  };

  const aoSinal = (sinal: NodeJS.Signals) => {
    void restaurar().finally(() => process.exit(sinal === "SIGINT" ? 130 : 143));
  };
  const aoErro = (e: unknown) => {
    void restaurar().finally(() => {
      console.error(e);
      process.exit(1);
    });
  };

  process.once("SIGINT", aoSinal);
  process.once("SIGTERM", aoSinal);
  process.once("SIGBREAK", aoSinal);
  process.once("uncaughtException", aoErro);
  process.once("unhandledRejection", aoErro);
  process.once("exit", avisar);

  try {
    await db
      .update(configuracoes)
      .set({ ...remendo, atualizadoEm: new Date() })
      .where(eq(configuracoes.id, original.id));

    return await fn(original);
  } finally {
    await restaurar();
    process.off("SIGINT", aoSinal);
    process.off("SIGTERM", aoSinal);
    process.off("SIGBREAK", aoSinal);
    process.off("uncaughtException", aoErro);
    process.off("unhandledRejection", aoErro);
    process.off("exit", avisar);
  }
}

/**
 * Para o teste que precisa trocar a configuração MAIS DE UMA VEZ.
 *
 * `comConfigDeTeste` cobre o caso comum (um remendo, um bloco). Alguns testes
 * exercitam a validação em dois estados — provedor inválido, depois válido — e
 * aí o que se quer é a rede de segurança sem amarrar o formato do teste.
 *
 * Devolve `restaurar`, que também fica registrado nos sinais e nas exceções:
 * mesmo que o teste esqueça o `finally`, um Ctrl+C não deixa a produção torta.
 */
export async function protegerConfig(): Promise<{
  original: Config;
  restaurar: () => Promise<void>;
}> {
  const [original] = await db.select().from(configuracoes);
  if (!original) throw new Error("Sem linha em `configuracoes` para proteger.");

  const instantaneo: Remendo = {};
  for (const campo of CAMPOS_RESTAURAVEIS) {
    (instantaneo as Record<string, unknown>)[campo] = (original as Record<string, unknown>)[campo];
  }

  let feito = false;
  const restaurar = async () => {
    if (feito) return;
    feito = true;
    await db
      .update(configuracoes)
      .set({ ...instantaneo, atualizadoEm: new Date() })
      .where(eq(configuracoes.id, original.id));
  };

  const aoSinal = () => {
    void restaurar().finally(() => process.exit(130));
  };
  const aoErro = (e: unknown) => {
    void restaurar().finally(() => {
      console.error(e);
      process.exit(1);
    });
  };
  process.once("SIGINT", aoSinal);
  process.once("SIGTERM", aoSinal);
  process.once("SIGBREAK", aoSinal);
  process.once("uncaughtException", aoErro);
  process.once("unhandledRejection", aoErro);

  return { original, restaurar };
}

/**
 * Um provedor falso que aponta para um mock LOCAL.
 *
 * Preferir isto a qualquer valor que pareça real: se a restauração falhar
 * mesmo assim, o que sobra na base é `127.0.0.1`, que o detector de
 * `lib/config-producao` reconhece e BLOQUEIA — em vez de um endereço que
 * parece plausível e passa despercebido.
 */
export function provedorDeTeste(porta: number): Remendo {
  return {
    provedorTipo: "custom",
    provedorBaseUrl: `http://127.0.0.1:${porta}`,
    provedorInstancia: null,
    provedorEndpointCustom: "/send",
    provedorToken: "token-de-teste",
    provedorTestadoEm: new Date(),
  };
}
