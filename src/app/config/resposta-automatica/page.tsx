"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Resposta automática — configuração, não controle de disparo.
 *
 * Fica em /config porque é isso que é: liga/desliga e edita texto por
 * categoria, uma vez, e esquece. Não decide QUANDO nem SE o worker da bridge
 * está mandando campanha — aquilo é /disparos. Já morou em /automacao/regras;
 * essa rota antiga agora só redireciona para cá.
 */

type Regra = {
  intencao: string;
  texto: string;
  ativa: boolean;
  rotulo: string;
  emoji: string;
};

export default function RespostaAutomaticaPage() {
  const [ativa, setAtiva] = useState(false);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoGlobal, setSalvandoGlobal] = useState(false);

  useEffect(() => {
    fetch("/api/automacao/regras")
      .then((r) => r.json())
      .then((dados: { ativa: boolean; regras: Regra[] }) => {
        setAtiva(dados.ativa);
        setRegras(dados.regras);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  async function alternarGlobal(valor: boolean) {
    setAtiva(valor);
    setSalvandoGlobal(true);
    try {
      await fetch("/api/automacao/regras", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostaAutomaticaAtiva: valor }),
      });
    } finally {
      setSalvandoGlobal(false);
    }
  }

  async function salvarRegra(intencao: string, valores: Partial<Pick<Regra, "texto" | "ativa">>) {
    setRegras((rs) => rs.map((r) => (r.intencao === intencao ? { ...r, ...valores } : r)));
    await fetch("/api/automacao/regras", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intencao, ...valores }),
    });
  }

  if (carregando) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-[var(--texto-2)]">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link href="/config" className="mb-2 inline-block text-[13px] text-[var(--texto-2)] hover:text-[var(--texto)]">
          ← Configurações
        </Link>
        <h1 className="text-[32px] font-semibold leading-none text-[var(--texto)]">Resposta automática</h1>
        <p className="mt-2 text-[15px] text-[var(--texto-2)]">
          Quando o lead responde e a intenção é detectada com confiança, o sistema pode responder
          sozinho com o texto de cada categoria abaixo. A detecção continua igual — aqui você só
          escreve a resposta e decide quais categorias ficam ligadas.
        </p>
      </header>

      <section className="cartao-apple mb-6 flex items-center justify-between p-5">
        <div>
          <h2 className="font-semibold tracking-tight text-[var(--texto)]">Resposta automática</h2>
          <p className="text-[13px] text-[var(--texto-2)]">
            Chave-mestra. Desligada, nenhuma categoria abaixo dispara, mesmo marcada como ativa.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ativa}
            disabled={salvandoGlobal}
            onChange={(e) => alternarGlobal(e.target.checked)}
            className="h-5 w-5 rounded border-[var(--linha)]"
          />
        </label>
      </section>

      <div className="space-y-4">
        {regras.map((r) => (
          <section key={r.intencao} className="cartao-apple p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold tracking-tight text-[var(--texto)]">
                {r.emoji} {r.rotulo}
              </h3>
              <label className="flex items-center gap-2 text-[13px] text-[var(--texto-2)]">
                <input
                  type="checkbox"
                  checked={r.ativa}
                  onChange={(e) => salvarRegra(r.intencao, { ativa: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--linha)]"
                />
                Ativa
              </label>
            </div>
            <textarea
              defaultValue={r.texto}
              onBlur={(e) => salvarRegra(r.intencao, { texto: e.target.value })}
              placeholder="Ex: Fico feliz em ajudar, {{nome}}! Posso te mandar o orçamento por aqui mesmo."
              rows={3}
              className="campo-apple w-full resize-none"
            />
            <p className="mt-1 text-[12px] text-[var(--texto-3)]">
              Variáveis: {"{{nome}}"} e {"{{cidade}}"}. Salva ao sair do campo.
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
