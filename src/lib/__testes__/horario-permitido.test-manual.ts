// Teste da janela de horário permitido — função pura, sem banco. Aceita uma
// data explícita (mesmo padrão de resolverSaudacao) para não depender do
// relógio real da máquina que roda o teste.
import { horarioPermitidoAgora, type Config } from "@/lib/fila";

function afirmar(nome: string, condicao: boolean) {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  console.log(`OK: ${nome}`);
}

// Datas em UTC escolhidas para caírem em horários exatos de São Paulo
// (UTC-3, sem horário de verão no Brasil desde 2019).
const dataSP = (hora: number, minuto = 0) => new Date(Date.UTC(2026, 0, 15, hora + 3, minuto));

const cfgBase: Config = {
  automacaoAtiva: true,
  provedorUrl: null,
  provedorToken: null,
  intervaloSegundos: 90,
  limiteDiario: 30,
  janelaRecontatoDias: 30,
  horarioEnvioAtivo: true,
  horarioInicio: "08:00",
  horarioFim: "20:00",
  variacaoAleatoriaAtiva: false,
};

function main() {
  // desligado: sempre permitido, não importa a hora.
  const r1 = horarioPermitidoAgora({ ...cfgBase, horarioEnvioAtivo: false }, dataSP(3));
  afirmar("horarioEnvioAtivo=false: sempre permitido", r1.permitido === true);

  // dentro da janela.
  const r2 = horarioPermitidoAgora(cfgBase, dataSP(14, 30));
  afirmar("14:30 dentro de 08:00-20:00: permitido", r2.permitido === true);

  // exatamente no início: permitido (inclusive).
  const r3 = horarioPermitidoAgora(cfgBase, dataSP(8, 0));
  afirmar("08:00 exato: permitido (limite inclusivo)", r3.permitido === true);

  // exatamente no fim: NÃO permitido (exclusive).
  const r4 = horarioPermitidoAgora(cfgBase, dataSP(20, 0));
  afirmar("20:00 exato: não permitido (limite exclusivo)", r4.permitido === false);

  // antes do início.
  const r5 = horarioPermitidoAgora(cfgBase, dataSP(6, 0));
  afirmar("06:00 antes do início: não permitido", r5.permitido === false);
  if (!r5.permitido) {
    afirmar("06:00 -> espera 2h até as 08:00", r5.esperarSegundos === 2 * 60 * 60);
    afirmar("06:00 -> motivo menciona a janela", r5.motivo.includes("08:00") && r5.motivo.includes("20:00"));
  }

  // depois do fim: espera até o início de AMANHÃ.
  const r6 = horarioPermitidoAgora(cfgBase, dataSP(22, 30));
  afirmar("22:30 depois do fim: não permitido", r6.permitido === false);
  if (!r6.permitido) {
    // de 22:30 até 08:00 do dia seguinte = 9h30 = 34200s
    afirmar("22:30 -> espera até amanhã 08:00 (9h30)", r6.esperarSegundos === 9.5 * 60 * 60);
  }

  // janela diferente, para confirmar que não é hardcoded.
  const cfgNoturno: Config = { ...cfgBase, horarioInicio: "09:00", horarioFim: "18:00" };
  const r7 = horarioPermitidoAgora(cfgNoturno, dataSP(8, 59));
  afirmar("08:59 fora de 09:00-18:00: não permitido", r7.permitido === false);
  if (!r7.permitido) {
    afirmar("08:59 -> espera 1 minuto até as 09:00", r7.esperarSegundos === 60);
  }

  console.log("\nTodos os testes de horário permitido passaram.");
}

main();
