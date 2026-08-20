"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead } from "@/lib/db/schema";
import { avaliar } from "@/lib/oportunidade";
import {
  perguntaDeCliente,
  montarRevelacao,
  type ResultadoTeste,
} from "@/lib/teste-oculto";
import { linkWhatsappComMensagem } from "@/lib/proposta";

/**
 * Cliente oculto, em duas etapas.
 *
 * 1. Você manda uma pergunta de cliente de verdade e o servidor carimba a hora.
 * 2. Você anota o que aconteceu, e só então a abordagem é montada — citando o
 *    que realmente aconteceu.
 *
 * A ordem não é burocracia. Se a mensagem existisse antes do teste, ela diria
 * "te mandei mensagem e não responderam" sem isso ter acontecido, e a primeira
 * resposta do dono ("mandou quando? não recebi nada") acabaria com a venda.
 */

const OPCOES: { valor: ResultadoTeste; rotulo: string; dica: string }[] = [
  { valor: "sem-resposta", rotulo: "Não responderam", dica: "Nada até agora" },
  { valor: "demorou", rotulo: "Demorou", dica: "Responderam, mas tarde" },
  { valor: "rapida", rotulo: "Responderam rápido", dica: "Poucos minutos" },
];

export default function ClienteOculto({ lead }: { lead: Lead }) {
  const router = useRouter();
  const teste = lead.testeOculto ?? null;
  const produtoLead = avaliar(lead).produto;

  /** Qual venda você está preparando. O pacote começa pelo site. */
  const [produto, setProduto] = useState<"site" | "chatbot">(
    produtoLead === "chatbot" ? "chatbot" : "site",
  );
  const [minutos, setMinutos] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"pergunta" | "abordagem" | null>(null);

  const pergunta = perguntaDeCliente(lead);
  const linkPergunta = linkWhatsappComMensagem(lead, pergunta);

  const revelacao = teste?.resultado
    ? montarRevelacao(lead, { ...teste, resultado: teste.resultado }, produto)
    : null;

  const linkAbordagem =
    revelacao?.serve ? linkWhatsappComMensagem(lead, revelacao.mensagem) : null;

  async function chamar(corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/leads/teste-oculto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, ...corpo }),
      });
      if (!res.ok) {
        const c = await res.json().catch(() => null);
        setErro(c?.erro ?? "Não consegui salvar.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setOcupado(false);
    }
  }

  function copiar(texto: string, qual: "pergunta" | "abordagem") {
    navigator.clipboard.writeText(texto);
    setCopiado(qual);
    setTimeout(() => setCopiado(null), 1600);
  }

  if (!lead.whatsapp) {
    return (
      <section className="cartao surgir mb-6 p-5">
        <h2 className="text-[16px] font-semibold">Cliente oculto</h2>
        <p className="mt-2 text-[13px] text-[var(--texto-2)]">
          Esse lead não tem WhatsApp — sem canal para mandar a pergunta, o teste
          não acontece.
        </p>
      </section>
    );
  }

  return (
    <section className="cartao surgir mb-6 p-5">
      <h2 className="text-[16px] font-semibold">Cliente oculto</h2>
      <p className="mt-1 text-[13px] text-[var(--texto-2)]">
        Pergunte como cliente, veja o que acontece e use o resultado real como
        abertura. Para de ser opinião e vira fato que o dono viu acontecer.
      </p>

      {/* ---------- etapa 1 ---------- */}
      {!teste && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
            Passo 1 · mande como cliente
          </p>
          <p className="rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[14px] leading-relaxed">
            {pergunta}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={linkPergunta ?? "#"}
              target="_blank"
              rel="noreferrer"
              onClick={() => chamar({ acao: "iniciar" })}
              className="btn-whatsapp"
            >
              Abrir WhatsApp e marcar hora
            </a>
            <button onClick={() => copiar(pergunta, "pergunta")} className="btn-secundario">
              {copiado === "pergunta" ? "Copiado!" : "Copiar"}
            </button>
          </div>

          <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
            A hora é marcada pelo servidor no clique — é ela que vai na frase
            &quot;mandei ontem às 21h&quot;. Mande de um número que não seja o
            comercial.
          </p>
        </div>
      )}

      {/* ---------- etapa 2 ---------- */}
      {teste && !teste.resultado && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
            Passo 2 · o que aconteceu?
          </p>
          <p className="mb-3 text-[13px] text-[var(--texto-2)]">
            Enviado {new Date(teste.enviadoEm).toLocaleString("pt-BR")}.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={minutos}
              onChange={(e) => setMinutos(e.target.value.replace(/\D/g, ""))}
              placeholder="minutos até responder"
              inputMode="numeric"
              className="campo min-w-0 flex-1 sm:max-w-[190px]"
            />
            {OPCOES.map((o) => (
              <button
                key={o.valor}
                disabled={ocupado}
                title={o.dica}
                onClick={() =>
                  chamar({
                    acao: "resultado",
                    resultado: o.valor,
                    ...(minutos && o.valor !== "sem-resposta"
                      ? { minutos: Number(minutos) }
                      : {}),
                  })
                }
                className="btn-secundario"
              >
                {o.rotulo}
              </button>
            ))}
          </div>

          <button
            onClick={() => chamar({ acao: "limpar" })}
            className="mt-3 text-[13px] text-[var(--texto-3)] hover:text-[var(--texto)]"
          >
            Cancelar teste
          </button>
        </div>
      )}

      {/* ---------- etapa 3 ---------- */}
      {teste?.resultado && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] uppercase tracking-[0.1em] text-[var(--texto-3)]">
              Vender
            </span>
            {(["site", "chatbot"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProduto(p)}
                className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
                  produto === p
                    ? p === "chatbot"
                      ? "bg-[var(--verde-fraco)] text-[var(--verde)]"
                      : "bg-[var(--azul-fraco)] text-[var(--azul)]"
                    : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                }`}
              >
                {p === "site" ? "Site" : "Chatbot"}
              </button>
            ))}
          </div>

          {revelacao?.serve ? (
            <>
              <p className="whitespace-pre-line rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[14px] leading-relaxed">
                {revelacao.mensagem}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {linkAbordagem && (
                  <a
                    href={linkAbordagem}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-whatsapp"
                  >
                    Enviar no WhatsApp
                  </a>
                )}
                <button
                  onClick={() => copiar(revelacao.mensagem, "abordagem")}
                  className="btn-secundario"
                >
                  {copiado === "abordagem" ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </>
          ) : (
            /**
             * Recusa explicada. A ferramenta dizendo "esse ângulo não serve"
             * vale mais do que ela produzindo um texto que o dono desmente.
             */
            <p className="rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--ambar)]">
              {revelacao?.motivo}
            </p>
          )}

          <button
            onClick={() => chamar({ acao: "limpar" })}
            className="mt-3 text-[13px] text-[var(--texto-3)] hover:text-[var(--texto)]"
          >
            Refazer teste
          </button>
        </div>
      )}

      {erro && (
        <p className="mt-3 rounded-[10px] bg-[var(--vermelho-fraco)] px-3.5 py-2.5 text-[13px] text-[var(--vermelho)]">
          {erro}
        </p>
      )}
    </section>
  );
}
