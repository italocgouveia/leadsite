import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, configuracoes } from "@/lib/db";

/**
 * Devolve a configuração do provedor aos valores reais da Bridge.
 *
 * POR QUE ISTO EXISTE
 *
 * `test:campanha` salva a config do provedor, troca por uma de teste e
 * restaura no fim. Se o processo morre no meio — foi o que aconteceu quando um
 * laço de testes estourou o tempo — a restauração não roda e a config fica
 * apontando para `provedor-de-teste.example.com`, com token de teste. A
 * automação estava desligada, então nada foi enviado para lugar nenhum; mas o
 * próximo INICIAR falharia.
 *
 * Os valores certos são reconstituídos das FONTES, não de memória:
 *   · a URL vem do cloudflared vivo (métricas em 127.0.0.1:20241);
 *   · o token vem do `servico.bat` da Bridge (TOKEN_BRIDGE_API);
 *   · o tipo é `custom` com endpoint `/send`, que é a rota que a Bridge expõe
 *     (ver servidor.js) — ela não fala o protocolo da Evolution.
 *
 * Escreve SÓ as cinco colunas de provedor. Não mexe em automação, limites,
 * horário nem em nada mais de `configuracoes`.
 *
 *   npx tsx src/scripts/restaurar-provedor.ts             (simulação)
 *   npx tsx src/scripts/restaurar-provedor.ts --executar
 */

const EXECUTAR = process.argv.includes("--executar");
const SERVICO_BAT =
  process.env.BRIDGE_SERVICO_BAT ||
  "C:/Users/Italo/Desktop/whatsapp-node-completo/whatsapp-node/servico.bat";

/** A URL pública atual do túnel, lida do próprio cloudflared. */
async function urlDoTunnel(): Promise<string | null> {
  try {
    const res = await fetch("http://127.0.0.1:20241/metrics", {
      signal: AbortSignal.timeout(8000),
    });
    const texto = await res.text();
    const m = texto.match(/userHostname="(https:\/\/[^"]+)"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** O token que a Bridge exige, lido do arquivo que a inicia. */
function tokenDaBridge(): string | null {
  try {
    const bat = readFileSync(SERVICO_BAT, "utf8");
    return bat.match(/TOKEN_BRIDGE_API=([^\s"]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const url = await urlDoTunnel();
  const token = tokenDaBridge();

  if (!url) {
    console.log("\nNão consegui ler a URL do túnel (cloudflared rodando?). Nada foi alterado.\n");
    process.exit(1);
  }
  if (!token) {
    console.log("\nNão achei TOKEN_BRIDGE_API no servico.bat. Nada foi alterado.\n");
    process.exit(1);
  }

  // Confirma que a Bridge responde ANTES de gravar — não adianta restaurar
  // para uma URL que não atende.
  const ok = await fetch(`${url}/status`, { signal: AbortSignal.timeout(12000) })
    .then((r) => r.json())
    .catch(() => null);

  console.log(`\nBridge em ${url}`);
  console.log(`  status: ${ok ? `${ok.estado} (número ${ok.numero ?? "—"})` : "não respondeu"}`);
  console.log(`  token lido do servico.bat: ${token.length} caracteres`);
  console.log("\nVai gravar em configuracoes:");
  console.log("  provedorTipo           custom");
  console.log(`  provedorBaseUrl        ${url}`);
  console.log("  provedorEndpointCustom /send");
  console.log("  provedorInstancia      (nulo)");
  console.log("  provedorToken          (o token da Bridge)");

  if (!ok?.conectado) {
    console.log("\n  ATENÇÃO: a Bridge não respondeu como conectada.");
  }

  if (!EXECUTAR) {
    console.log("\nSimulação. Nada foi alterado. Rode com --executar.\n");
    process.exit(0);
  }

  const [cfg] = await db.select().from(configuracoes);
  if (!cfg) {
    console.log("\nSem linha em configuracoes. Nada a fazer.\n");
    process.exit(1);
  }

  await db
    .update(configuracoes)
    .set({
      provedorTipo: "custom",
      provedorBaseUrl: url,
      provedorEndpointCustom: "/send",
      provedorInstancia: null,
      provedorToken: token,
      /** Zera o carimbo: quem valida é o pré-voo, não este script. */
      provedorTestadoEm: null,
      atualizadoEm: new Date(),
    })
    .where(eq(configuracoes.id, cfg.id));

  console.log("\nConfiguração do provedor restaurada. Rode o pré-voo antes de disparar.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
