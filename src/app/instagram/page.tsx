"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * 📸 PROSPECÇÃO MANUAL POR INSTAGRAM.
 *
 * A ideia de uso: deixar o disparo de WhatsApp rodando sozinho em /disparos e
 * trabalhar esta lista à mão ao mesmo tempo — abrir o perfil, mandar a
 * mensagem pelo Instagram, marcar como abordado.
 *
 * Nada nesta tela dispara nada. Os botões só mudam `instagramStatus`, que é
 * uma coluna independente do funil de WhatsApp: marcar "sem interesse" aqui
 * não tira o lead da campanha, e uma resposta no WhatsApp não mexe no status
 * daqui. São duas conversas diferentes com a mesma empresa.
 */

type ItemInstagram = {
  id: string;
  nome: string;
  nicho: string;
  cidade: string | null;
  username: string | null;
  url: string | null;
  canal: string;
  scoreComercial: number;
  scoreContatabilidade: number;
  scoreFinal: number;
  solucao: string | null;
  oportunidade: string | null;
  porQue: { criterio: string; pontos: number }[];
  porteEstimadoRotulo: string;
  temWhatsapp: boolean;
  status: string;
};

const STATUS: { valor: string; rotulo: string }[] = [
  { valor: "abordado", rotulo: "ABORDADO" },
  { valor: "respondeu", rotulo: "RESPONDEU" },
  { valor: "sem-interesse", rotulo: "SEM INTERESSE" },
  { valor: "cliente", rotulo: "CLIENTE" },
];

const CORES: Record<string, string> = {
  "nao-abordado": "text-[var(--texto-3)]",
  abordado: "text-[var(--azul)]",
  respondeu: "text-[var(--verde)]",
  "sem-interesse": "text-[var(--texto-3)]",
  cliente: "text-[var(--verde)]",
};

export default function InstagramPage() {
  const [itens, setItens] = useState<ItemInstagram[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [verTrabalhados, setVerTrabalhados] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/instagram").then((x) => x.json());
      setItens(r.leads ?? []);
    } finally {
      setCarregando(false);
    }
  }, []);

  /**
   * O `setState` acontece dentro da função assíncrona, não no corpo do efeito
   * — é o que a regra `react-hooks/set-state-in-effect` do React 19 exige, e
   * é o mesmo padrão já usado em /disparos.
   */
  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  /**
   * Atualiza a lista em memória antes da resposta do servidor. Quem trabalha
   * esta fila marca vários seguidos; esperar o ida-e-volta a cada clique
   * transformaria a tela numa fila de espera.
   */
  const marcar = useCallback(async (id: string, status: string) => {
    setSalvando(id);
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await fetch("/api/instagram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id, status }),
      });
    } finally {
      setSalvando(null);
    }
  }, []);

  const naoAbordados = itens.filter((i) => (i.status ?? "nao-abordado") === "nao-abordado");
  const trabalhados = itens.filter((i) => (i.status ?? "nao-abordado") !== "nao-abordado");
  const lista = verTrabalhados ? trabalhados : naoAbordados;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">📸 Prospecção manual — Instagram</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
            Esta lista não dispara nada. Abra o perfil, fale com a empresa e marque o que
            aconteceu — o WhatsApp continua rodando em paralelo, sem interferência.
          </p>
        </div>
        <Link href="/disparos" className="text-[13px] text-[var(--azul)] underline">
          ir para /disparos
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setVerTrabalhados(false)}
          className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
            !verTrabalhados
              ? "bg-[var(--azul)] text-white"
              : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
          }`}
        >
          A abordar <strong className="tabular-nums">{naoAbordados.length}</strong>
        </button>
        <button
          onClick={() => setVerTrabalhados(true)}
          className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
            verTrabalhados
              ? "bg-[var(--azul)] text-white"
              : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
          }`}
        >
          Já trabalhados <strong className="tabular-nums">{trabalhados.length}</strong>
        </button>
      </div>

      {carregando && <p className="text-[13px] text-[var(--texto-3)]">carregando…</p>}
      {!carregando && lista.length === 0 && (
        <p className="rounded-[10px] bg-[var(--superficie)] px-4 py-3 text-[13px] text-[var(--texto-3)]">
          {verTrabalhados
            ? "Nada trabalhado ainda."
            : "Nenhuma empresa com Instagram utilizável na fila. O enriquecimento pode aumentar esta lista."}
        </p>
      )}

      <ul className="space-y-2.5">
        {lista.map((i) => (
          <li key={i.id} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-medium">
                {i.temWhatsapp ? "🔥 " : "📸 "}
                {i.nome}
              </p>
              <span className="text-[12px] tabular-nums text-[var(--texto-3)]">
                comercial {i.scoreComercial} · contato {i.scoreContatabilidade} · final{" "}
                <strong className="text-[var(--texto-2)]">{i.scoreFinal}</strong>
              </span>
            </div>

            <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
              {i.nicho}
              {i.cidade ? ` · ${i.cidade}` : ""} · {i.porteEstimadoRotulo}
              {i.temWhatsapp && " · 📱 também tem WhatsApp"}
            </p>

            {i.solucao && (
              <p className="mt-1.5 text-[13px] text-[var(--texto-2)]">🛠 {i.solucao}</p>
            )}
            {i.oportunidade && (
              <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">💡 {i.oportunidade}</p>
            )}
            {i.porQue.length > 0 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--texto-3)]">
                {i.porQue
                  .map((x) => `${x.pontos > 0 ? "+" : ""}${x.pontos} ${x.criterio}`)
                  .join(" · ")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primario"
                >
                  ABRIR @{i.username}
                </a>
              )}
              {STATUS.map((s) => (
                <button
                  key={s.valor}
                  disabled={salvando === i.id}
                  onClick={() => void marcar(i.id, i.status === s.valor ? "nao-abordado" : s.valor)}
                  className={`rounded-[10px] px-3 py-1.5 text-[12.5px] transition ${
                    i.status === s.valor
                      ? "bg-[var(--azul-fraco)] font-medium text-[var(--azul)]"
                      : "bg-[var(--superficie)] hover:bg-[var(--superficie-2)]"
                  }`}
                >
                  {s.rotulo}
                </button>
              ))}
              {i.status && i.status !== "nao-abordado" && (
                <span className={`text-[12px] ${CORES[i.status] ?? ""}`}>● {i.status}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
