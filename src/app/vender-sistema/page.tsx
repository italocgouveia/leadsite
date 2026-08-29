"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Lead } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";
import { avaliarSistema, modulosLegiveis, montarPropostaSistema } from "@/lib/sistemas";
import { resolverSaudacao } from "@/lib/saudacao";
import { linkWhatsappComMensagem } from "@/lib/proposta";
import BuscaRapida from "@/components/busca-rapida";
import BotaoExportar from "@/components/botao-exportar";
import ExcluirLead from "@/components/excluir-lead";

/**
 * Terceira fila: sistema de gestão sob medida.
 *
 * Site e chatbot resolvem o que o cliente do lead vê. Aqui o alvo é a dor
 * administrativa do dono — agenda no caderno, OS em papel, comissão na
 * calculadora. Por isso a lista mostra os MÓDULOS que o sistema teria, não o
 * nível de oportunidade: o que fecha a venda é o dono reconhecer a tarefa.
 *
 * O encaixe vem do RAMO, que é dado verificável. A tela nunca afirma que a
 * empresa usa planilha — diz que negócios daquele ramo costumam ter aquele
 * problema, e deixa a pergunta em aberto na mensagem.
 */
export default function VenderSistema() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [soAlto, setSoAlto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/list");
      const data = await res.json();
      const lista: Lead[] = data.leads ?? [];
      setLeads(
        lista
          .filter((l) => avaliarSistema(l).serve && (l.whatsapp || l.telefone))
          .sort((a, b) => {
            const ordem = { alto: 0, medio: 1, baixo: 2 } as const;
            const d = ordem[avaliarSistema(a).nivel] - ordem[avaliarSistema(b).nivel];
            return d !== 0 ? d : b.score - a.score;
          }),
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const termo = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const visiveis = leads.filter((l) => {
    if (soAlto && avaliarSistema(l).nivel !== "alto") return false;
    if (!termo) return true;
    return `${l.nome} ${categoriaSingular(l.categoria)} ${l.cidade ?? ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .includes(termo);
  });

  function copiar(lead: Lead) {
    const m = montarPropostaSistema(lead);
    if (!m) return;
    // Caminho manual: a saudação vira "Bom dia" agora, não na fila.
    navigator.clipboard.writeText(resolverSaudacao(m));
    setCopiado(lead.id);
    setTimeout(() => setCopiado(null), 1600);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[24px] font-semibold sm:text-[28px]">Vender sistema</h1>
          <BotaoExportar ids={visiveis.map((l) => l.id)} />
        </div>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)] sm:text-[15px]">
          {carregando
            ? "Analisando sua base…"
            : `Ramos com agenda, ordem de serviço ou estoque. ${leads.length} para abordar.`}
        </p>
      </header>

      <BuscaRapida aoConcluir={() => void carregar()} />

      {!carregando && leads.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Filtrar por nome, ramo ou cidade…"
            className="campo"
          />
          <button
            onClick={() => setSoAlto((v) => !v)}
            className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${
              soAlto
                ? "bg-[var(--azul-fraco)] text-[var(--azul)]"
                : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
            }`}
          >
            Só encaixe alto
          </button>
        </div>
      )}

      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="esqueleto h-32" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="cartao px-5 py-14 text-center">
          <p className="text-[15px]">Nenhum lead de sistema ainda.</p>
          <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
            Busque oficinas, clínicas, salões, petshops ou imobiliárias acima.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {visiveis.map((lead) => {
            const e = avaliarSistema(lead);
            const bruta = montarPropostaSistema(lead);
            // Sem resolver, o link do wa.me sairia com "{{saudacao}}" literal.
            const mensagem = bruta ? resolverSaudacao(bruta) : null;
            const link = mensagem ? linkWhatsappComMensagem(lead, mensagem) : null;

            return (
              <li key={lead.id} className="cartao cartao-interativo p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/lead/${lead.id}`}
                      className="block text-[15px] font-semibold leading-snug hover:text-[var(--azul)]"
                    >
                      {lead.nome}
                    </Link>
                    <p className="mt-0.5 text-[13px] capitalize text-[var(--texto-3)]">
                      {categoriaSingular(lead.categoria)} · {lead.cidade}
                      {lead.bairro && lead.bairro !== "-" ? ` · ${lead.bairro}` : ""}
                    </p>
                  </div>
                  <span
                    className={`etiqueta shrink-0 ${
                      e.nivel === "alto"
                        ? "etiqueta-alta"
                        : e.nivel === "medio"
                          ? "etiqueta-boa"
                          : "etiqueta-neutra"
                    }`}
                  >
                    encaixe {e.nivel}
                  </span>
                </div>

                <p className="mt-2.5 text-[14px] font-medium text-[var(--azul)]">{e.sistema}</p>
                <p className="mt-1 text-[13px] text-[var(--texto-2)]">
                  {modulosLegiveis(e.modulos)}
                </p>

                <details className="mt-2.5">
                  <summary className="cursor-pointer text-[13px] text-[var(--texto-3)]">
                    Por que este lead
                  </summary>
                  <ul className="mt-2 space-y-1 text-[13px] text-[var(--texto-2)]">
                    {e.sinais.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                    <li className="text-[var(--texto-3)]">
                      · Dor típica do ramo: {e.dor}
                    </li>
                  </ul>
                </details>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="btn-primario">
                      Enviar no WhatsApp
                    </a>
                  )}
                  <button onClick={() => copiar(lead)} className="btn-secundario">
                    {copiado === lead.id ? "Copiado!" : "Copiar mensagem"}
                  </button>
                  <ExcluirLead
                    id={lead.id}
                    nome={lead.nome}
                    aoExcluir={() => setLeads((l) => l.filter((x) => x.id !== lead.id))}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
