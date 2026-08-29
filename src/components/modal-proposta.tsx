"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/lib/db/schema";
import { montarProposta, linkWhatsappComMensagem } from "@/lib/proposta";
import { resolverSaudacao } from "@/lib/saudacao";

/**
 * Modal de proposta. A mensagem já vem pronta ao abrir — nada de esperar
 * geração. Editar é opcional; o caminho rápido é abrir e clicar em WhatsApp.
 */
export default function ModalProposta({
  lead,
  urlPrevia,
  aoFechar,
  aoEnviar,
}: {
  lead: Lead;
  urlPrevia?: string | null;
  aoFechar: () => void;
  aoEnviar?: () => void;
}) {
  const base = montarProposta(lead, Boolean(urlPrevia));
  /**
   * Resolve a saudação AQUI, não na fila.
   *
   * Este caminho é manual e imediato: você lê, clica e a mensagem vai agora.
   * Sem esta linha, o link do WhatsApp abriria com "{{saudacao}}, tudo bem?"
   * literal na frente do cliente — o marcador só faz sentido enquanto o texto
   * espera na fila, e aqui não existe espera.
   */
  const pronta = resolverSaudacao(
    urlPrevia ? `${base.mensagem}\n\n${urlPrevia}` : base.mensagem,
  );
  const [mensagem, setMensagem] = useState(pronta);
  const [copiado, setCopiado] = useState(false);
  const [melhorando, setMelhorando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Esc fecha — é a tecla que todo mundo tenta primeiro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aoFechar]);

  const link = linkWhatsappComMensagem(lead, mensagem);

  /**
   * Marca que a abordagem SAIU — etapa "mensagem-enviada", a quarta do funil.
   *
   * Era "proposta", a oitava. Um primeiro contato no WhatsApp não é uma
   * proposta comercial, e pular quatro etapas fazia o funil mostrar 107
   * negócios em fase de fechamento que nunca tinham recebido uma mensagem.
   */
  async function marcarEnviada() {
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [lead.id],
        etapa: "mensagem-enviada",
        noCrm: true,
        visto: true,
      }),
    });
    aoEnviar?.();
  }

  /**
   * Copiar NÃO é enviar.
   *
   * Antes, copiar o texto para a área de transferência avançava o funil. Ler
   * a mensagem antes de decidir — que é o motivo de existir o botão — marcava
   * o lead como já abordado e o tirava de qualquer disparo futuro. Foi assim
   * que 107 leads sumiram da fila sem ninguém ter falado com eles.
   *
   * Agora copiar só registra que você olhou.
   */
  async function copiar() {
    navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [lead.id], visto: true }),
    });
  }

  function abrirWhatsapp() {
    if (!link) return;
    window.open(link, "_blank");
    void marcarEnviada();
  }

  /** Opcional: reescreve com IA. Demora, por isso não é o caminho padrão. */
  async function melhorar() {
    setMelhorando(true);
    setErro(null);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, tipo: "whatsapp", regerar: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Falha ao reescrever");
      setMensagem(data.script.conteudo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setMelhorando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={aoFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surgir flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-[20px] border border-[var(--linha)] bg-[var(--fundo-2)] p-6 sm:rounded-[20px]"
      >
        <div className="mb-5">
          <p className="text-[13px] text-[var(--texto-2)]">Proposta para</p>
          <h2 className="text-[22px] font-semibold tracking-tight">{lead.nome}</h2>
        </div>

        <dl className="mb-5 space-y-2.5 rounded-xl bg-[var(--superficie)] p-4 text-[14px]">
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-[var(--texto-2)]">Problema</dt>
            <dd className="flex-1">{base.problema}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-[var(--texto-2)]">Serviço</dt>
            <dd className="flex-1">{base.servico}</dd>
          </div>
          {urlPrevia && (
            <div className="flex gap-3">
              <dt className="w-32 shrink-0 text-[var(--texto-2)]">Prévia</dt>
              <dd className="min-w-0 flex-1 break-all text-[var(--azul)]">{urlPrevia}</dd>
            </div>
          )}
        </dl>

        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[13px] text-[var(--texto-2)]">Mensagem</label>
          <button
            onClick={melhorar}
            disabled={melhorando}
            className="text-[13px] text-[var(--azul)] hover:opacity-70 disabled:opacity-50"
          >
            {melhorando ? "Reescrevendo…" : "Reescrever com IA"}
          </button>
        </div>

        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={9}
          className="campo-apple mb-4 resize-y leading-relaxed"
        />

        {erro && <p className="mb-3 text-[13px] text-[#c9312a]">{erro}</p>}

        {!lead.whatsapp && (
          <p className="mb-3 rounded-lg bg-[var(--ambar-fraco)] px-3 py-2 text-[13px] text-[var(--ambar)]">
            Este lead não tem WhatsApp. Copie a mensagem e use outro canal.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {link && (
            <button onClick={abrirWhatsapp} className="btn-whatsapp flex-1">
              Abrir WhatsApp
            </button>
          )}
          <button onClick={copiar} className="btn-secundario">
            {copiado ? "Copiado!" : "Copiar mensagem"}
          </button>
          <button onClick={aoFechar} className="btn-secundario">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
