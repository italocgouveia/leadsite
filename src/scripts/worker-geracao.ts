import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { processarLote, estadoGeracao } from "@/lib/gen/fila-geracao";

/**
 * O worker de GERAÇÃO — o processo que faz a fila andar sem ninguém olhando.
 *
 * POR QUE ELE EXISTE, E POR QUE RODA AQUI E NÃO NA VERCEL
 *
 * A geração precisava parar de depender da aba aberta. O caminho óbvio seria
 * um cron na Vercel, mas o plano Hobby desta conta permite cron UMA VEZ POR
 * DIA — inútil para drenar uma fila de dezenas de leads. O cron continua
 * configurado como rede de segurança (pega item preso, recomeça fila parada),
 * mas quem dita o ritmo é este processo, na mesma máquina que já roda a
 * bridge 24/7. Não custa nada e não depende de plano.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não envia mensagem. Não fala com o WhatsApp. Não aprova nada. Ele produz
 * `rascunho` no banco e para por aí — aprovar continua sendo um clique seu, e
 * enviar continua sendo só do worker da bridge. Se este processo enlouquecer,
 * o pior que acontece é rascunho demais.
 *
 * COMO RODAR
 *
 *   npm run geracao          (fica de pé, drenando a fila)
 *   npm run geracao -- --uma-vez   (um lote só e sai — bom para testar)
 *
 * Ele é seguro para rodar em duas janelas ao mesmo tempo: a reserva de item é
 * atômica no banco, então dois workers nunca pegam o mesmo lead.
 */

const INTERVALO_OCIOSO_MS = 30_000;
const INTERVALO_COTA_MS = 5 * 60 * 1000;
const LOTE = Number(process.env.GERACAO_LOTE ?? 5);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), modulo: "worker-geracao", msg, ...extra }),
  );
}

let parando = false;
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    /**
     * Sai depois do item atual, não no meio dele. Matar no meio deixaria o
     * item em `processando` — recuperável, mas só depois de 5 minutos de
     * espera à toa.
     */
    log("encerrando após o item atual");
    parando = true;
  });
}

async function main() {
  const umaVez = process.argv.includes("--uma-vez");
  const estado = await estadoGeracao();
  log("worker de geração no ar", { lote: LOTE, fila: estado });

  while (!parando) {
    const r = await processarLote({ max: LOTE, orcamentoMs: 5 * 60 * 1000 });

    if (r.geradas || r.erros || r.puladas || r.recuperados) {
      log("lote processado", r);
    }

    if (umaVez) break;
    if (parando) break;

    /**
     * Três ritmos diferentes, porque as três situações são diferentes:
     * cota estourada pede minutos (o limite é por minuto/dia), fila vazia
     * pede meio minuto (nada a fazer), e fila com trabalho segue direto —
     * o respiro entre chamadas de IA já está dentro de `processarLote`.
     */
    if (r.pausadoPorCota) {
      log("cota do Gemini atingida — pausando", { voltaEm: `${INTERVALO_COTA_MS / 60000}min` });
      await dormir(INTERVALO_COTA_MS);
    } else if (r.restantes === 0) {
      await dormir(INTERVALO_OCIOSO_MS);
    }
  }

  log("worker encerrado", { fila: await estadoGeracao() });
  process.exit(0);
}

main().catch((e) => {
  log("falhou", { erro: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
