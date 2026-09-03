import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { execSync } from "node:child_process";
import { inArray, sql } from "drizzle-orm";
import { db, configuracoes, mensagens } from "@/lib/db";
import { estadoGeracao } from "@/lib/gen/fila-geracao";
import { lerConfigProvedor } from "@/lib/integracao";
import { consultarBridge, type SaudeBridge } from "@/lib/bridge";

/**
 * Um comando que responde "está tudo de pé?" sem abrir cinco janelas.
 *
 * Existe porque o sistema tem três processos independentes na máquina
 * (bridge, tunnel, worker de IA) mais dois interruptores no banco
 * (automação e worker de envio), e antes disto conferir o estado exigia
 * olhar Task Scheduler, tasklist, três logs e o painel. Quando algo não
 * dispara, a primeira pergunta é sempre "quem está desligado?" — e ela
 * precisava de uma resposta de dez segundos.
 *
 * NÃO altera nada. Só lê. Nenhum segredo é impresso: URLs de banco, chave
 * do Gemini e token da bridge não passam por aqui.
 *
 *   npm run status
 */

const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const FIM = "\x1b[0m";

function linha(rotulo: string, ligado: boolean, detalhe = "") {
  const cor = ligado ? VERDE : VERMELHO;
  const estado = ligado ? "RUNNING" : "STOPPED";
  console.log(`  ${rotulo.padEnd(18)} ${cor}${estado}${FIM}${detalhe ? `  ${detalhe}` : ""}`);
}

async function responde(url: string, ms = 4000): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function processoVivo(nome: string): boolean {
  try {
    const saida = execSync(`tasklist /fi "imagename eq ${nome}" /fo csv /nh`, { encoding: "utf8" });
    return saida.toLowerCase().includes(nome.toLowerCase());
  } catch {
    return false;
  }
}

async function main() {
  const cfg = (await db.select().from(configuracoes).limit(1))[0];

  const bridgeLocal = await responde("http://localhost:8081/status", 4000);
  const workerIa = await responde(
    `http://127.0.0.1:${process.env.GERACAO_PORTA_STATUS ?? 8477}/`,
    4000,
  );
  const cloudflared = processoVivo("cloudflared.exe");

  // A URL pública é a que o painel na Vercel realmente usa.
  const baseUrl = cfg?.provedorBaseUrl ?? null;
  const publico = baseUrl ? await responde(`${baseUrl}/status`, 8000) : null;

  const provedor = await lerConfigProvedor();
  const bruto: SaudeBridge = provedor ? await consultarBridge(provedor) : { alcancavel: false };
  // `SaudeBridge` e uniao: quando inalcancavel nao tem os campos. Achata aqui
  // para o relatorio nao precisar repetir a checagem em cada linha.
  const saude = bruto.alcancavel
    ? bruto
    : { whatsappConectado: false, whatsappEstado: "bridge inalcancavel", filaWorkerAtivo: false };

  console.log("\n══════════ SERVIÇOS NA MÁQUINA ══════════");
  linha("BRIDGE", Boolean(bridgeLocal), bridgeLocal ? `WhatsApp: ${bridgeLocal.estado}` : "localhost:8081 não responde");
  linha("TUNNEL", cloudflared && Boolean(publico), publico ? "URL pública OK" : cloudflared ? "processo vivo, URL pública NÃO responde" : "cloudflared fora do ar");
  linha("WORKER IA", Boolean(workerIa), workerIa ? `ciclos: ${workerIa.ciclos}` : "porta de status fechada");

  console.log("\n══════════ INTERRUPTORES DE ENVIO ══════════");
  linha("WORKER WHATSAPP", saude.filaWorkerAtivo === true, saude.filaWorkerAtivo ? "" : "(esperado: desligado até você iniciar)");
  const auto = cfg?.automacaoAtiva === true;
  console.log(
    `  ${"AUTOMACAO".padEnd(18)} ${auto ? VERDE : VERMELHO}${auto}${FIM}` +
      (auto ? "" : "  (esperado: false até você iniciar)"),
  );
  console.log(`  ${"WHATSAPP".padEnd(18)} ${saude.whatsappConectado ? VERDE + "conectado" : AMARELO + (saude.whatsappEstado ?? "desconhecido")}${FIM}`);

  const ger = await estadoGeracao();
  console.log("\n══════════ FILA DE GERAÇÃO (IA) ══════════");
  console.log(
    `  pendente ${ger.pendente} · processando ${ger.processando} · pronto ${ger.pronta} · ` +
      `pulado ${ger.pulada} · erro ${ger.erro}` +
      (ger.proximaTentativaEm
        ? ` · retry às ${new Date(ger.proximaTentativaEm).toLocaleTimeString("pt-BR")}`
        : ""),
  );

  const envio = await db
    .select({ status: mensagens.status, n: sql<number>`count(*)::int` })
    .from(mensagens)
    .where(inArray(mensagens.status, ["rascunho", "aprovada", "na-fila", "enviada", "erro", "cancelada"]))
    .groupBy(mensagens.status);
  const conta = (s: string) => envio.find((e) => e.status === s)?.n ?? 0;
  console.log("\n══════════ FILA DE ENVIO ══════════");
  console.log(
    `  rascunho ${conta("rascunho")} · aprovada ${conta("aprovada")} · na-fila ${conta("na-fila")} · ` +
      `enviada ${conta("enviada")} · erro ${conta("erro")} · cancelada ${conta("cancelada")}`,
  );
  console.log(
    `\n  limite diário ${cfg?.limiteDiario}/dia · intervalo ${cfg?.intervaloSegundos}s · ` +
      `recontato ${cfg?.janelaRecontatoDias} dias\n`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
