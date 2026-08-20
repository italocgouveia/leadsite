"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODELOS, type ModeloSite, type Lead } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";

type Aba = "existente" | "descrever";

export default function NovoSite() {
  const router = useRouter();

  const [aba, setAba] = useState<Aba>("existente");
  const [modelo, setModelo] = useState<ModeloSite>("completo");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // aba "lead existente"
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Lead | null>(null);

  // aba "descrever"
  const [form, setForm] = useState({
    nome: "",
    categoria: "",
    cidade: "",
    estado: "MG",
    telefone: "",
    endereco: "",
  });

  useEffect(() => {
    let cancelado = false;
    fetch("/api/leads/list")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setLeads(d.leads ?? []);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const filtrados = busca.trim()
    ? leads.filter((l) =>
        `${l.nome} ${l.cidade ?? ""} ${l.categoria ?? ""}`
          .toLowerCase()
          .includes(busca.toLowerCase()),
      )
    : leads;

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      let leadId = escolhido?.id;

      // Na aba "descrever", cria o lead antes — o gerador precisa de um.
      if (aba === "descrever") {
        const res = await fetch("/api/leads/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro ?? "Falha ao criar o lead");
        leadId = data.lead.id;
      }

      if (!leadId) throw new Error("Escolha um lead ou descreva o negócio");

      const res = await fetch("/api/sites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, modelo, regerar: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Falha ao gerar o site");

      router.push(`/sites/${data.site.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
      setGerando(false);
    }
  }

  const pronto =
    aba === "existente" ? Boolean(escolhido) : form.nome.trim().length > 1;

  const campo = (k: keyof typeof form, rotulo: string, obrigatorio = false) => (
    <div>
      <label className="mb-1.5 block text-[13px] text-[var(--texto-2)]">
        {rotulo}
      </label>
      <input
        required={obrigatorio}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="campo-apple"
      />
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 text-center">
        <h1 className="text-[40px] font-semibold leading-tight">Criar site</h1>
        <p className="mx-auto mt-3 max-w-lg text-[17px] text-[var(--texto-2)]">
          Escolha um lead que você já buscou, ou descreva um negócio que veio por
          indicação e não está na base.
        </p>
      </header>

      <div className="cartao-apple p-6">
        {/* abas */}
        <div className="mb-6 flex gap-1 rounded-full bg-[var(--superficie)] p-1">
          {(
            [
              ["existente", "Lead existente"],
              ["descrever", "Descrever negócio"],
            ] as [Aba, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setAba(valor)}
              className={`flex-1 rounded-full px-4 py-2 text-[14px] transition ${
                aba === valor
                  ? "bg-[var(--superficie-2)] text-[var(--texto)]"
                  : "text-[var(--texto-2)] hover:text-[var(--texto)]"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "existente" ? (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lead por nome ou cidade…"
              className="campo-apple mb-3"
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtrados.length === 0 && (
                <p className="py-10 text-center text-[14px] text-[var(--texto-2)]">
                  {leads.length === 0
                    ? "Nenhum lead na base. Faça uma busca primeiro ou use a aba ao lado."
                    : "Nada encontrado."}
                </p>
              )}
              {filtrados.slice(0, 40).map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setEscolhido(lead)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    escolhido?.id === lead.id
                      ? "bg-[var(--azul)]/10 ring-1 ring-[var(--azul)]"
                      : "hover:bg-[var(--superficie)]"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--superficie)] text-[13px] font-medium">
                    {lead.nome.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{lead.nome}</span>
                    <span className="block truncate text-[13px] text-[var(--texto-2)]">
                      {categoriaSingular(lead.categoria)} · {lead.cidade}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{campo("nome", "Nome do negócio", true)}</div>
            {campo("categoria", "Ramo")}
            {campo("telefone", "Telefone / WhatsApp")}
            {campo("cidade", "Cidade")}
            {campo("estado", "UF")}
            <div className="sm:col-span-2">{campo("endereco", "Endereço")}</div>
          </div>
        )}

        {/* seletor de modelo */}
        <div className="mt-7 border-t border-[var(--linha)] pt-6">
          <p className="mb-3 text-[13px] text-[var(--texto-2)]">Modelo</p>
          <div className="space-y-2">
            {MODELOS.map((m) => (
              <button
                key={m.valor}
                onClick={() => setModelo(m.valor)}
                className={`flex w-full gap-3 rounded-xl p-3.5 text-left transition ${
                  modelo === m.valor
                    ? "bg-[var(--azul)]/10 ring-1 ring-[var(--azul)]"
                    : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    modelo === m.valor
                      ? "border-[var(--azul)] bg-[var(--azul)]"
                      : "border-[var(--linha-forte)]"
                  }`}
                >
                  {modelo === m.valor && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span>
                  <span className="block text-[15px]">{m.rotulo}</span>
                  <span className="block text-[13px] text-[var(--texto-2)]">
                    {m.descricao}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <p className="mt-5 rounded-xl bg-[#fff1f0] px-4 py-3 text-[14px] text-[#c9312a]">
            {erro}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[13px] text-[var(--texto-2)]">
            {gerando
              ? "Gerando… pode levar mais de um minuto. Não feche a aba."
              : pronto
                ? "Tudo pronto."
                : "Escolha um lead ou descreva o negócio."}
          </p>
          <button onClick={gerar} disabled={!pronto || gerando} className="btn-primario">
            {gerando ? "Gerando…" : "Gerar site"}
          </button>
        </div>
      </div>
    </main>
  );
}
