"use client";

import { useEffect, useState } from "react";
import type { Configuracao } from "@/lib/db/schema";

type Form = {
  marcaDaguaAtiva: boolean;
  marcaDaguaTexto: string;
  marcaDaguaUrl: string;
  pixelFacebook: string;
  googleAnalytics: string;
  googleAds: string;
};

const VAZIO: Form = {
  // Precisa bater com CONFIG_PADRAO em lib/config.ts, senão a tela promete
  // uma coisa e o site gerado faz outra.
  marcaDaguaAtiva: false,
  marcaDaguaTexto: "",
  marcaDaguaUrl: "",
  pixelFacebook: "",
  googleAnalytics: "",
  googleAds: "",
};

export default function ConfigPage() {
  const [form, setForm] = useState<Form>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(({ config }: { config: Configuracao | null }) => {
        if (!config) return;
        setForm({
          marcaDaguaAtiva: config.marcaDaguaAtiva,
          marcaDaguaTexto: config.marcaDaguaTexto ?? "",
          marcaDaguaUrl: config.marcaDaguaUrl ?? "",
          pixelFacebook: config.pixelFacebook ?? "",
          googleAnalytics: config.googleAnalytics ?? "",
          googleAds: config.googleAds ?? "",
        });
      })
      .catch(() => {});
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } finally {
      setSalvando(false);
    }
  }

  const campo = (k: keyof Form) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value }),
    className:
      "campo-apple",
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-[40px] font-semibold leading-none text-[var(--texto)]">Configurações</h1>
        <p className="mt-1 text-[15px] text-[var(--texto-2)]">
          Vale para todo site gerado daqui pra frente. Sites já criados só mudam se você regerar.
        </p>
      </header>

      <form onSubmit={salvar} className="space-y-6">
        <section className="cartao-apple p-6">
          <h2 className="mb-1 font-semibold tracking-tight text-[var(--texto)]">Marca d&apos;água</h2>
          <p className="mb-4 text-[13px] text-[var(--texto-2)]">
            Aparece fixa no canto do site. Desligue para entrega final, ou personalize com a sua
            marca para virar divulgação.
          </p>

          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.marcaDaguaAtiva}
              onChange={(e) => setForm({ ...form, marcaDaguaAtiva: e.target.checked })}
              className="h-4 w-4 rounded border-[var(--linha)]"
            />
            <span className="text-sm text-[var(--texto)]">Mostrar marca d&apos;água</span>
          </label>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Texto</label>
              <input {...campo("marcaDaguaTexto")} placeholder="Site por Italo · (34) 9xxxx-xxxx" />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
                Link (opcional — clica e vai pro seu WhatsApp/portfólio)
              </label>
              <input {...campo("marcaDaguaUrl")} placeholder="https://wa.me/5534..." />
            </div>
          </div>
        </section>

        <section className="cartao-apple p-6">
          <h2 className="mb-1 font-semibold tracking-tight text-[var(--texto)]">Rastreamento</h2>
          <p className="mb-4 text-[13px] text-[var(--texto-2)]">
            Injetado no <code>&lt;head&gt;</code> de todo site. Deixe vazio para não incluir.
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Pixel do Facebook / Meta</label>
              <input {...campo("pixelFacebook")} placeholder="1234567890123456" />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Google Analytics (GA4)</label>
              <input {...campo("googleAnalytics")} placeholder="G-XXXXXXXXXX" />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Google Ads</label>
              <input {...campo("googleAds")} placeholder="AW-XXXXXXXXX" />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={salvando}
          className="btn-primario"
        >
          {salvando ? "Salvando…" : salvo ? "Salvo!" : "Salvar"}
        </button>
      </form>
    </main>
  );
}
