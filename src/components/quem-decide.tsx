"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead, SocioSalvo } from "@/lib/db/schema";
import { formatar } from "@/lib/cnpj";

/**
 * "Quem decide": puxa o quadro societário público da Receita.
 *
 * O problema que isto resolve é conversar sempre com a recepção. Pedir "o
 * responsável" é o que faz a ligação morrer; pedir a pessoa pelo nome, não.
 *
 * O que a tela promete é exatamente o que a Receita entrega — o NOME de quem
 * administra. Não existe telefone de sócio no quadro societário, e dizer o
 * contrário aqui só ia gerar frustração na hora de usar.
 */
export default function QuemDecide({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [cnpj, setCnpj] = useState(lead.cnpj ? formatar(lead.cnpj) : "");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const socios = (lead.socios ?? []) as SocioSalvo[];
  const jaConsultado = Boolean(lead.receitaEm);

  async function consultar() {
    setCarregando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/leads/receita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          ...(cnpj.trim() ? { cnpj: cnpj.trim() } : {}),
        }),
      });
      const corpo = await res.json();

      if (!res.ok) {
        setErro(corpo?.erro ?? "Não consegui consultar agora.");
        return;
      }
      setAviso(corpo?.aviso ?? null);
      router.refresh();
    } catch {
      setErro("Falha de rede na consulta.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="cartao surgir mb-6 p-5">
      <h2 className="text-[16px] font-semibold">Quem decide</h2>
      <p className="mt-1 text-[13px] text-[var(--texto-2)]">
        Nome do dono, direto do quadro societário público da Receita — para você
        pedir a pessoa pelo nome em vez de &quot;o responsável&quot;.
      </p>

      {socios.length > 0 && (
        <ul className="mt-4 space-y-2">
          {socios.map((s) => (
            <li
              key={s.nome}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[var(--superficie)] px-3.5 py-2.5"
            >
              <span className="text-[14px] font-medium capitalize">
                {s.nome.toLowerCase()}
              </span>
              <span
                className={`etiqueta ${s.decide ? "etiqueta-alta" : "etiqueta-neutra"}`}
                title={
                  s.decide
                    ? "Administra a empresa — é com essa pessoa que você quer falar"
                    : "Consta no quadro, mas não administra"
                }
              >
                {s.qualificacao}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lead.razaoSocial && (
        <p className="mt-3 text-[13px] text-[var(--texto-3)]">
          {lead.razaoSocial}
          {lead.cnpj ? ` · ${formatar(lead.cnpj)}` : ""}
        </p>
      )}

      {jaConsultado && socios.length === 0 && (
        <p className="mt-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-2.5 text-[13px] text-[var(--texto-2)]">
          Sem quadro societário — costuma ser MEI ou empresário individual.
          Nesses casos o dono é quem está na razão social acima.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          placeholder="CNPJ (opcional se o lead tiver site)"
          inputMode="numeric"
          className="campo min-w-0 flex-1 sm:max-w-[240px]"
        />
        <button onClick={consultar} disabled={carregando} className="btn-secundario">
          {carregando
            ? "Consultando…"
            : jaConsultado
              ? "Consultar de novo"
              : "Descobrir o dono"}
        </button>
      </div>

      {!jaConsultado && (
        <p className="mt-2 text-[12.5px] text-[var(--texto-3)]">
          {lead.website
            ? "Sem CNPJ preenchido eu procuro no site do lead primeiro. Nem todo site publica — aí cole o número na mão."
            : "Esse lead não tem site para eu vasculhar. O CNPJ costuma estar na nota fiscal ou no Google."}
        </p>
      )}

      {aviso && (
        <p className="mt-3 rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-2.5 text-[13px] text-[var(--ambar)]">
          {aviso}
        </p>
      )}
      {erro && (
        <p className="mt-3 rounded-[10px] bg-[var(--vermelho-fraco)] px-3.5 py-2.5 text-[13px] text-[var(--vermelho)]">
          {erro}
        </p>
      )}
    </section>
  );
}
