import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Porta local que serve de TRAVA DE INSTÂNCIA ÚNICA e de status ao mesmo tempo.
 *
 * Escutar uma porta é a trava mais confiável que existe no Windows para isto:
 * o sistema operacional a solta sozinho quando o processo morre, de qualquer
 * jeito que ele morra. Arquivo de lock com PID não tem essa garantia — depois
 * de um desligamento forçado ele fica lá, mentindo que há um worker de pé.
 *
 * Duas instâncias não corromperiam a fila (a reserva é atômica no banco), mas
 * gastariam cota do Gemini em dobro, que é o recurso escasso aqui.
 */
const PORTA_STATUS = Number(process.env.GERACAO_PORTA_STATUS ?? 8477);

/**
 * Enquanto este arquivo existir, o worker fica de pé mas não processa nada.
 *
 * É a diferença entre "pausar" e "matar". Matar o serviço para conseguir
 * exclusividade sobre a fila é frágil: a cadeia wscript → cmd → node leva
 * segundos para nascer, e um kill no meio dela não encontra nada para matar —
 * o worker aparece logo depois e volta a disputar. Foi assim que a suíte de
 * testes ficou intermitente, sempre do mesmo jeito: o worker de produção
 * gerava o lead antes do teste, e o teste via "geradas=0".
 *
 * Um arquivo não tem corrida: ou ele está lá quando o ciclo começa, ou não.
 * Serve tanto para os testes quanto para uso normal — dá para segurar a
 * geração por um tempo sem derrubar o serviço nem perder a fila.
 */
const ARQUIVO_PAUSA = join(process.cwd(), "geracao.pausado");

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Só campos que este arquivo monta. Nada de `process.env` no log: o worker
 * carrega GEMINI_API_KEY e DATABASE_URL, e log de serviço vai para arquivo que
 * fica no disco para sempre.
 */
function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), modulo: "worker-geracao", msg, ...extra }),
  );
}

type Situacao = { desde: string; ultimoLote: unknown; ciclos: number; pausado: boolean };

/**
 * Sobe o servidor de status. Resolve `false` se a porta já estiver ocupada —
 * isto é, se já existe outro worker vivo.
 */
function abrirStatus(situacao: Situacao): Promise<boolean> {
  return new Promise((resolve) => {
    const servidor = createServer((_req, res) => {
      void (async () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            estado: situacao.pausado ? "pausado" : "rodando",
            /**
             * Handshake da pausa: vira true só quando o laço REALMENTE parou
             * de processar. Criar o arquivo não basta como sinal — um lote em
             * andamento leva minutos (4s entre leads mais a ida ao Gemini) e
             * segue reservando itens nesse meio-tempo. Quem precisa de
             * exclusividade sobre a fila espera este campo, não o arquivo.
             */
            pausado: situacao.pausado,
            desde: situacao.desde,
            ciclos: situacao.ciclos,
            ultimoLote: situacao.ultimoLote,
            fila: await estadoGeracao(),
          }),
        );
      })();
    });

    servidor.once("error", (e: NodeJS.ErrnoException) => {
      resolve(e.code !== "EADDRINUSE" ? true : false);
    });
    servidor.once("listening", () => {
      servidor.unref(); // não segura o processo de pé sozinho
      resolve(true);
    });
    servidor.listen(PORTA_STATUS, "127.0.0.1");
  });
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
  const situacao: Situacao = {
    desde: new Date().toISOString(),
    ultimoLote: null,
    ciclos: 0,
    pausado: false,
  };

  /**
   * A trava vale só para o worker que fica de pé. `--uma-vez` é usado pelos
   * testes e por chamadas manuais, e precisa poder rodar mesmo com o serviço
   * ativo — são operações curtas, e a reserva atômica cuida da concorrência.
   */
  if (!umaVez && !(await abrirStatus(situacao))) {
    log("já existe um worker de geração rodando — saindo", { porta: PORTA_STATUS });
    process.exit(0);
  }

  const estado = await estadoGeracao();
  log("worker de geração no ar", { lote: LOTE, porta: umaVez ? null : PORTA_STATUS, fila: estado });

  let avisouPausa = false;
  while (!parando) {
    if (existsSync(ARQUIVO_PAUSA)) {
      situacao.pausado = true;
      if (!avisouPausa) {
        log("pausado por geracao.pausado — nada será processado até o arquivo sumir");
        avisouPausa = true;
      }
      if (umaVez) break;
      await dormir(2000);
      continue;
    }
    situacao.pausado = false;
    if (avisouPausa) {
      log("pausa liberada — voltando a processar");
      avisouPausa = false;
    }

    /**
     * Um lote que falha NÃO pode derrubar o worker.
     *
     * O banco é HTTP, e HTTP falha: uma consulta que caiu no meio do caminho
     * subia até aqui e matava o processo. O supervisor reerguia 60s depois,
     * e o ciclo se repetia — o worker passava mais tempo reiniciando do que
     * gerando. Na prática ficou visível quando uma campanha de 300 leads
     * produziu 1 mensagem em 5 minutos.
     *
     * A fila aguenta a queda sem ajuda: item reservado que não terminou volta
     * sozinho pelo `recuperarPresos`. O que faltava era só não morrer.
     */
    let r;
    try {
      r = await processarLote({ max: LOTE, orcamentoMs: 5 * 60 * 1000 });
    } catch (e) {
      log("lote falhou — seguindo para o próximo ciclo", {
        erro: e instanceof Error ? e.message.split("\n")[0] : String(e),
      });
      await dormir(10_000);
      continue;
    }

    situacao.ciclos++;
    situacao.ultimoLote = { em: new Date().toISOString(), ...r };

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
