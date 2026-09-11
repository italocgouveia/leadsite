"use client";

import { useDemo } from "@/lib/demo-automacao/contexto";
import { Etiqueta } from "@/components/central";

/**
 * ⚙ CONFIGURAÇÕES — o painel visual da demonstração.
 *
 * Tudo aqui é da demonstração. O número de WhatsApp real, o token da Bridge e
 * a configuração de envio de verdade moram em /config e não aparecem nesta
 * tela de propósito: um cliente olhando a demonstração não deve ver — nem
 * poder alterar — nada da operação real.
 */

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "bom" | "alerta" | "neutro" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--linha)] py-2.5 last:border-0">
      <span className="text-[13px] text-[var(--texto-2)]">{rotulo}</span>
      {tom ? <Etiqueta tom={tom}>{valor}</Etiqueta> : <span className="text-[13px] font-medium">{valor}</span>}
    </div>
  );
}

function Alternador({ rotulo, ligado, onClick }: { rotulo: string; ligado: boolean; onClick?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--linha)] py-2.5 last:border-0">
      <span className="text-[13px] text-[var(--texto-2)]">{rotulo}</span>
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`relative h-6 w-11 rounded-full transition ${ligado ? "bg-[var(--acao)]" : "bg-[var(--superficie-2)]"} ${
          onClick ? "cursor-pointer" : "cursor-default"
        }`}
        aria-pressed={ligado}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${ligado ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { estado, alternarIA } = useDemo();

  return (
    <main className="grid gap-4 md:grid-cols-2">
      <section className="cartao p-5">
        <p className="text-[15px] font-semibold">WhatsApp</p>
        <div className="mt-2">
          <Linha rotulo="Status" valor="🟢 Conectado — demonstração" tom="bom" />
          <Linha rotulo="Número" valor="Ambiente de demonstração" />
          <Linha rotulo="Contatos monitorados" valor={String(estado.contatos.length)} />
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--texto-3)]">
          Nenhum número real é mostrado nem usado. A conexão de verdade fica em Configurações do
          sistema, fora desta área.
        </p>
      </section>

      <section className="cartao p-5">
        <p className="text-[15px] font-semibold">IA</p>
        <div className="mt-2">
          <Alternador rotulo="IA ativa" ligado={estado.iaAtiva} onClick={alternarIA} />
          <Alternador rotulo="Responder automaticamente" ligado={estado.iaAtiva} />
          <Alternador rotulo="Identificar intenção" ligado />
          <Alternador rotulo="Classificar interesse" ligado />
          <Alternador rotulo="Transferir para humano" ligado />
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--texto-3)]">
          Pausar a IA aqui é o mesmo botão do cabeçalho: ela para de responder em todas as
          conversas da demonstração até ser retomada.
        </p>
      </section>

      <section className="cartao p-5">
        <p className="text-[15px] font-semibold">Comportamento</p>
        <div className="mt-2">
          <Alternador rotulo="Responder imediatamente" ligado />
          <Alternador rotulo="Identificar orçamento" ligado />
          <Alternador rotulo="Identificar agendamento" ligado />
          <Alternador rotulo="Detectar pedido de humano" ligado />
          <Linha rotulo="Horário de atendimento" valor="seg–sex 8h–18h · sáb até 12h" />
        </div>
        <div className="mt-3">
          <p className="text-[11px] text-[var(--texto-3)]">Mensagem de fallback</p>
          <p className="mt-1 rounded-[10px] bg-[var(--superficie)] px-3 py-2 text-[13px]">
            &ldquo;Vou encaminhar sua solicitação para um atendente.&rdquo;
          </p>
        </div>
      </section>

      <section className="cartao p-5">
        <p className="text-[15px] font-semibold">Segurança</p>
        <div className="mt-2">
          <Linha rotulo="Modo" valor="🧪 Demonstração" tom="alerta" />
          <Linha rotulo="Envia mensagens reais" valor="Não" tom="neutro" />
          <Linha rotulo="Toca a fila real" valor="Não" tom="neutro" />
          <Linha rotulo="Toca o banco de dados" valor="Não" tom="neutro" />
          <Linha rotulo="Onde vive o estado" valor="Neste navegador" />
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--texto-3)]">
          Este ambiente não envia mensagens reais. O motor da demonstração não importa nada da fila,
          da Bridge ou do banco — não tem por onde chegar à operação real, e um teste automático
          reprova se isso mudar.
        </p>
      </section>
    </main>
  );
}
