// Teste do semáforo composto do painel — função pura, sem banco nem rede.
import { calcularStatusWorker } from "@/lib/fila";

function afirmar(nome: string, condicao: boolean) {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  console.log(`OK: ${nome}`);
}

function main() {
  const rodando = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: true,
    whatsappConectado: true,
    bloqueio: { pode: true },
  });
  afirmar("tudo ok: rodando (verde)", rodando.codigo === "rodando" && rodando.emoji === "🟢");

  const bridgeFora = calcularStatusWorker({
    bridgeAlcancavel: false,
    filaWorkerAtivo: null,
    whatsappConectado: null,
    bloqueio: { pode: true },
  });
  afirmar("bridge inacessível: erro (vermelho)", bridgeFora.codigo === "erro" && bridgeFora.emoji === "🔴");

  const pausado = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: false,
    whatsappConectado: true,
    bloqueio: { pode: true },
  });
  afirmar(
    "worker desligado: pausado manualmente (vermelho), mesmo com tudo mais ok",
    pausado.codigo === "pausado-manualmente" && pausado.emoji === "🔴",
  );

  const semWhats = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: true,
    whatsappConectado: false,
    bloqueio: { pode: true },
  });
  afirmar(
    "worker ligado mas WhatsApp caiu: amarelo, não vermelho",
    semWhats.codigo === "whatsapp-desconectado" && semWhats.emoji === "🟡",
  );

  const teto = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: true,
    whatsappConectado: true,
    bloqueio: { pode: false, motivo: "Teto diário atingido (30/30). Continua amanhã." },
  });
  afirmar("teto diário: laranja", teto.codigo === "limite-diario" && teto.emoji === "🟠");

  const aguardandoIntervalo = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: true,
    whatsappConectado: true,
    bloqueio: { pode: false, motivo: "Aguardando o intervalo entre envios.", esperarSegundos: 42 },
  });
  afirmar(
    "aguardando intervalo: amarelo, motivo passa direto",
    aguardandoIntervalo.codigo === "aguardando" && aguardandoIntervalo.label.includes("intervalo"),
  );

  const aguardandoHorario = calcularStatusWorker({
    bridgeAlcancavel: true,
    filaWorkerAtivo: true,
    whatsappConectado: true,
    bloqueio: { pode: false, motivo: "Fora do horário permitido (08:00–20:00).", esperarSegundos: 3600 },
  });
  afirmar(
    "fora do horário permitido: cai no bucket amarelo genérico, com o motivo certo",
    aguardandoHorario.codigo === "aguardando" && aguardandoHorario.label.includes("horário permitido"),
  );

  /**
   * Precedência: bridge inacessível > pausado manualmente > WhatsApp
   * desconectado > bloqueio de negócio > rodando. Confirma que um worker
   * ATIVO mas com a bridge fora do ar não aparece como "rodando" por engano.
   */
  const precedencia = calcularStatusWorker({
    bridgeAlcancavel: false,
    filaWorkerAtivo: true,
    whatsappConectado: true,
    bloqueio: { pode: true },
  });
  afirmar("bridge inacessível tem prioridade sobre worker ativo", precedencia.codigo === "erro");

  console.log("\nTodos os testes do semáforo de status passaram.");
}

main();
