"use client";

import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";

/**
 * 🔀 FLUXOS — como a IA decide.
 *
 * Cada fluxo tem gatilho, condição, ação e resultado. É a parte da
 * apresentação em que o cliente entende que não é mágica: é decisão com
 * motivo. Os cinco fluxos são exatamente o que os roteiros de `cenarios.ts`
 * fazem, então o que está na tela é o que acontece na simulação.
 */

type Fluxo = {
  emoji: string;
  titulo: string;
  gatilho: string;
  condicao: string;
  acoes: string[];
  resultado: string;
};

const FLUXOS: Fluxo[] = [
  {
    emoji: "👋",
    titulo: "Primeiro atendimento",
    gatilho: "Mensagem recebida de um contato novo",
    condicao: "Ainda não há conversa com este cliente",
    acoes: ["Lê a mensagem", "Identifica a intenção", "Responde em segundos", "Classifica o interesse", "Conduz a conversa"],
    resultado: "Cliente atendido sem fila",
  },
  {
    emoji: "💰",
    titulo: "Pedido de orçamento",
    gatilho: "Cliente pergunta preço ou valor",
    condicao: "Intenção = orçamento, com confiança acima de 85%",
    acoes: ["Responde e pergunta o contexto", "Entende a necessidade", "Marca como negociação", "Prepara a proposta"],
    resultado: "Lead quente com proposta a caminho",
  },
  {
    emoji: "📅",
    titulo: "Agendamento",
    gatilho: "Cliente quer marcar dia ou horário",
    condicao: "Intenção = agendar",
    acoes: ["Oferece horários", "Registra a escolha", "Confirma", "Programa lembrete na véspera"],
    resultado: "Horário na agenda",
  },
  {
    emoji: "🔥",
    titulo: "Cliente interessado",
    gatilho: "Cliente demonstra interesse sem pedir preço ainda",
    condicao: "Interesse = alto e etapa = interessado",
    acoes: ["Aprofunda com uma pergunta", "Mostra exemplo prático", "Aguarda sinal de orçamento ou agenda"],
    resultado: "Conversa conduzida até a decisão",
  },
  {
    emoji: "👤",
    titulo: "Transferência para humano",
    gatilho: "Cliente pede uma pessoa, reclama ou traz caso complexo",
    condicao: "Intenção = humano, ou confiança abaixo do limite",
    acoes: ["Avisa que vai transferir", "Pausa nesta conversa", "Sinaliza o atendente", "Entrega o histórico"],
    resultado: "Pessoa assume com contexto, sem repetir nada",
  },
];

export default function FluxosPage() {
  const { apresentacao } = useDemo();

  return (
    <main>
      <div className="mb-4">
        <p className="text-[17px] font-semibold">Fluxos de atendimento</p>
        <p className="mt-0.5 text-[13px] text-[var(--texto-3)]">O que a IA faz, passo a passo, em cada situação.</p>
      </div>

      {/* ───────── a jornada, em uma linha ───────── */}
      <section className="cartao mb-4 overflow-x-auto p-4">
        <div className="flex min-w-[720px] items-center gap-2 text-[12px]">
          {["Novo cliente", "Mensagem recebida", "IA identifica intenção", "IA responde", "Cliente demonstra interesse", "IA conduz", "Orçamento", "Agendamento", "Humano quando necessário"].map((p, i, arr) => (
            <div key={p} className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 ${i === 0 ? "bg-[var(--acao-fraco)] text-[var(--acao)]" : "bg-[var(--superficie-2)] text-[var(--texto-2)]"}`}>{p}</span>
              {i < arr.length - 1 && <span className="text-[var(--texto-3)]">→</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {FLUXOS.map((f) => (
          <section key={f.titulo} className="cartao p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold">{f.emoji} {f.titulo}</p>
              <Etiqueta tom="bom">ativo</Etiqueta>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Gatilho</p>
                <p className="mt-1 rounded-[10px] bg-[var(--acao-fraco)] px-3 py-2 text-[12.5px] text-[var(--acao)]">{f.gatilho}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Condição</p>
                <p className="mt-1 rounded-[10px] bg-[var(--superficie-2)] px-3 py-2 text-[12.5px] text-[var(--texto-2)]">{f.condicao}</p>
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">Ação</p>
              <ol className="mt-1.5 space-y-1">
                {f.acoes.map((a, i) => (
                  <li key={a} className="flex items-start gap-2.5 text-[13px]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--superficie-2)] text-[10.5px] tabular-nums text-[var(--texto-3)]">{i + 1}</span>
                    <span className="text-[var(--texto-2)]">{a}</span>
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
          Estes cinco fluxos são exatamente o que os roteiros da demonstração executam. Quando a IA real for ligada, ela cumpre o mesmo contrato por trás — o que muda é a qualidade do texto, não a lógica.
        </p>
      )}
    </main>
  );
}
