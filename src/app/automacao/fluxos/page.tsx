"use client";

import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";

/**
 * 🔀 FLUXOS — como a IA decide.
 *
 * Cinco fluxos, cada um desenhado como gatilho → passos. É a parte da
 * apresentação em que o cliente entende que não é mágica: é uma sequência
 * de decisões, e cada uma tem um motivo.
 *
 * Os fluxos são descritivos. O motor da demonstração implementa exatamente
 * estes cinco (ver `motor.ts`), então o que está na tela é o que acontece.
 */

type Fluxo = {
  titulo: string;
  emoji: string;
  gatilho: string;
  passos: string[];
  resultado: string;
};

const FLUXOS: Fluxo[] = [
  {
    titulo: "Primeiro atendimento",
    emoji: "👋",
    gatilho: "Nova mensagem de um contato",
    passos: ["IA lê a mensagem", "Identifica a intenção", "Responde em segundos", "Classifica o interesse", "Mantém a conversa"],
    resultado: "Cliente atendido sem fila",
  },
  {
    titulo: "Orçamento",
    emoji: "💰",
    gatilho: "Cliente pergunta preço",
    passos: ["IA responde e pergunta o contexto", "Entende a necessidade", "Marca como interessado", "Encaminha para proposta quando faz sentido"],
    resultado: "Lead quente identificado",
  },
  {
    titulo: "Agendamento",
    emoji: "📅",
    gatilho: "Cliente demonstra interesse em marcar",
    passos: ["Confirma a intenção", "Oferece horários", "Registra a escolha", "Encaminha para confirmação"],
    resultado: "Horário na agenda",
  },
  {
    titulo: "Atendimento humano",
    emoji: "👤",
    gatilho: "Cliente pede uma pessoa",
    passos: ["IA avisa que vai transferir", "Pausa nesta conversa", "Sinaliza o atendente", "Entrega o histórico"],
    resultado: "Pessoa assume com contexto",
  },
  {
    titulo: "Pós-atendimento",
    emoji: "✅",
    gatilho: "Atendimento encerrado",
    passos: ["Envia acompanhamento", "Registra o resultado", "Agenda retorno se houver"],
    resultado: "Nada se perde depois da conversa",
  },
];

export default function FluxosPage() {
  const { apresentacao } = useDemo();

  return (
    <main>
      <div className="mb-4">
        <p className="text-[17px] font-semibold">Fluxos de atendimento</p>
        <p className="mt-0.5 text-[13px] text-[var(--texto-3)]">
          O que a IA faz, passo a passo, em cada situação. Não é mágica: é decisão com motivo.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {FLUXOS.map((f) => (
          <section key={f.titulo} className="cartao p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold">
                {f.emoji} {f.titulo}
              </p>
              <Etiqueta tom="bom">ativo</Etiqueta>
            </div>

            <div className="mt-4">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Gatilho</p>
              <p className="mt-1 rounded-[10px] bg-[var(--acao-fraco)] px-3 py-2 text-[13px] text-[var(--acao)]">
                {f.gatilho}
              </p>
            </div>

            <div className="mt-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">O que a IA faz</p>
              <ol className="mt-1.5 space-y-1">
                {f.passos.map((p, i) => (
                  <li key={p} className="flex items-start gap-2.5 text-[13px]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--superficie-2)] text-[10.5px] tabular-nums text-[var(--texto-3)]">
                      {i + 1}
                    </span>
                    <span className="text-[var(--texto-2)]">{p}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-3 border-t border-[var(--linha)] pt-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Resultado</p>
              <p className="mt-1 text-[13px] font-medium text-[var(--verde)]">→ {f.resultado}</p>
            </div>
          </section>
        ))}
      </div>

      {!apresentacao && (
        <p className="mt-4 text-[11.5px] text-[var(--texto-3)]">
          Estes cinco fluxos são exatamente o que o motor da demonstração implementa. Quando a IA real
          for ligada, ela cumpre o mesmo contrato por trás — o que muda é a qualidade do texto, não a
          lógica.
        </p>
      )}
    </main>
  );
}
