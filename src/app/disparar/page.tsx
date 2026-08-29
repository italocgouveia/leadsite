"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Disparar: uma tela, um botão.
 *
 * O caminho longo (Campanhas → montar → revisar → aprovar → Automação →
 * ligar → iniciar) continua existindo para quando você quer escolher o lote.
 * Esta tela é para o outro caso, que é o de todo dia: mandar para todo mundo
 * que ainda dá.
 *
 * O botão carrega o número no rótulo — "Enviar para 37 empresas". É de
 * propósito: um clique que dispara mensagem de verdade precisa dizer, no
 * próprio botão, quantas e para quem. Perguntar "tem certeza?" num modal
 * depois disso só ensina a clicar em OK sem ler.
 */

type Previa = {
  pronto: boolean;
  impedimento: string | null;
  comoResolver: string[];
  total: number;
  hoje: number;
  dias: number;
  tempoHoje: string;
  naFila: number;
  enviadasHoje: number;
  limiteDiario: number;
  intervaloSegundos: number;
  segmentos: { nome: string; quantidade: number }[];
  cidades: { nome: string; quantidade: number }[];
  produtos: { nome: string; quantidade: number }[];
  recusas: { motivo: string; quantidade: number }[];
  ordem: { nome: string; cidade: string | null; nota: number; emoji: string }[];
  maiorNota: number;
  menorNota: number;
  amostra: { nome: string; cidade: string | null; nota: number; texto: string }[];
};

type Log = { hora: string; texto: string; ok: boolean };

export default function Disparar() {
  const [p, setP] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [enviadas, setEnviadas] = useState(0);
  const [meta, setMeta] = useState(0);
  const [agora, setAgora] = useState<string | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const [erro, setErro] = useState<{ texto: string; passos: string[] } | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const pararRef = useRef(false);

  const anotar = useCallback((texto: string, ok = true) => {
    setLog((l) =>
      [{ hora: new Date().toLocaleTimeString("pt-BR"), texto, ok }, ...l].slice(0, 60),
    );
  }, []);

  const carregar = useCallback(
    () =>
      fetch("/api/disparo")
        .then((r) => r.json() as Promise<Previa>)
        .then(setP)
        .catch(() => {}),
    [],
  );

  /**
   * O fetch fica dentro do efeito e a atualização no `.then`. Chamar uma
   * função que faz setState no corpo do efeito acende o `set-state-in-effect`
   * do React 19, que já apareceu algumas vezes neste projeto.
   */
  useEffect(() => {
    let vivo = true;
    fetch("/api/disparo")
      .then((r) => r.json() as Promise<Previa>)
      .then((r) => {
        if (vivo) setP(r);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  /** Espera, mas acorda na hora se você mandar parar. */
  function esperar(ms: number) {
    return new Promise<void>((pronto) => {
      const inicio = Date.now();
      const t = setInterval(() => {
        if (pararRef.current || Date.now() - inicio >= ms) {
          clearInterval(t);
          pronto();
        }
      }, 400);
    });
  }

  /**
   * O laço de envio vive NO NAVEGADOR.
   *
   * Não é preguiça: função serverless tem tempo máximo, e 40 envios a 90s
   * levam uma hora — seriam cortados no meio, sem ninguém saber quantas
   * saíram. Aqui você vê o ritmo e fecha a aba para parar.
   *
   * Cada volta chama o servidor, que revalida TODAS as travas do zero.
   */
  const laco = useCallback(
    async function laco() {
      while (!pararRef.current) {
        const r = await fetch("/api/automacao/fila", { method: "POST" })
          .then((x) => x.json())
          .catch(() => null);

        if (!r) {
          anotar("Falha de rede — parei por segurança.", false);
          break;
        }

        if (r.enviada) {
          setEnviadas((n) => n + 1);
          setAgora(r.lead);
          anotar(`Enviada para ${r.lead}`);
          await esperar((r.proximaEm ?? 90) * 1000);
          continue;
        }

        // Só o intervalo entre envios: espera e tenta de novo, não desiste.
        if (r.esperarSegundos > 0) {
          setAgora(`aguardando ${r.esperarSegundos}s`);
          await esperar((r.esperarSegundos + 1) * 1000);
          continue;
        }

        // Fila vazia, teto do dia ou automação desligada: aí sim encerra.
        anotar(r.motivo ?? "Fila vazia.", false);
        break;
      }

      setRodando(false);
      setAgora(null);
      await carregar();
    },
    [anotar, carregar],
  );

  /** O clique: enche a fila e já começa a mandar. */
  async function disparar() {
    setOcupado(true);
    setErro(null);
    setLog([]);
    setEnviadas(0);

    try {
      // Fila que sobrou de ontem: continua, não cria campanha nova em cima.
      if (p && p.total === 0 && p.naFila > 0) {
        setMeta(p.naFila);
        anotar(`Continuando ${p.naFila} mensagem(ns) da fila.`);
      } else {
        const r = await fetch("/api/disparo", { method: "POST" }).then(async (x) => ({
          status: x.status,
          corpo: await x.json(),
        }));

        if (r.status !== 200) {
          setErro({ texto: r.corpo.erro, passos: r.corpo.comoResolver ?? [] });
          return;
        }

        setMeta(r.corpo.criadas + (p?.naFila ?? 0));
        anotar(`${r.corpo.criadas} mensagem(ns) na fila — "${r.corpo.nome}".`);
      }

      setRodando(true);
      pararRef.current = false;
      await carregar();
      void laco();
    } finally {
      setOcupado(false);
    }
  }

  async function parar() {
    pararRef.current = true;
    anotar("Parando…", false);
  }

  /** Cancela o que ainda não saiu. Diferente de pausar: não volta sozinho. */
  async function cancelarTudo() {
    pararRef.current = true;
    setOcupado(true);
    try {
      const r = await fetch("/api/disparo", { method: "DELETE" }).then((x) => x.json());
      anotar(`${r.canceladas} mensagem(ns) cancelada(s). Automação desligada.`, false);
      setRodando(false);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  if (!p) {
    return (
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
        <div className="esqueleto h-72" />
      </main>
    );
  }

  const restantes = Math.max(0, meta - enviadas);
  const percentual = meta ? Math.round((enviadas / meta) * 100) : 0;
  const continuando = p.total === 0 && p.naFila > 0;
  const quantidade = continuando ? p.naFila : p.total;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-5 lg:pt-10">
      <header className="surgir mb-6">
        <h1 className="text-[24px] font-semibold sm:text-[28px]">Disparar</h1>
        <p className="mt-1.5 text-[14px] text-[var(--texto-2)]">
          Um botão. Manda para todo mundo que ainda pode receber.
        </p>
      </header>

      {/* ─────────────────────────── o botão ─────────────────────────── */}
      <section className="cartao surgir mb-5 p-6 text-center">
        {rodando ? (
          <>
            <p className="text-[13px] uppercase tracking-[0.14em] text-[var(--texto-3)]">
              Enviando
            </p>
            <p className="mt-2 text-[44px] font-semibold leading-none tabular-nums">
              {enviadas}
              <span className="text-[24px] text-[var(--texto-3)]"> / {meta}</span>
            </p>

            <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-[var(--superficie)]">
              <div
                className="h-full rounded-full bg-[var(--azul)] transition-[width] duration-500"
                style={{ width: `${percentual}%` }}
              />
            </div>

            <p className="mt-3 text-[13.5px] text-[var(--texto-2)]">
              {agora ? `→ ${agora}` : "preparando…"}
              {restantes > 0 && ` · faltam ${restantes}`}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button onClick={parar} className="btn-secundario">
                Pausar
              </button>
              <button onClick={cancelarTudo} disabled={ocupado} className="btn-perigo">
                Cancelar o resto
              </button>
            </div>

            <p className="mx-auto mt-4 max-w-md rounded-[10px] bg-[var(--ambar-fraco)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ambar)]">
              <strong>Deixe esta aba aberta.</strong> O ritmo é controlado aqui — uma
              mensagem a cada {p.intervaloSegundos}s, para o número não virar alvo.
              Fechar a página pausa o envio; o que faltou continua na fila.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] uppercase tracking-[0.14em] text-[var(--texto-3)]">
              {continuando ? "Sobrou da última vez" : "Prontas para receber"}
            </p>
            <p className="mt-2 text-[52px] font-semibold leading-none tabular-nums">
              {quantidade}
            </p>
            <p className="mt-1 text-[14px] text-[var(--texto-2)]">
              {quantidade === 1 ? "empresa" : "empresas"}
            </p>

            <button
              onClick={disparar}
              disabled={ocupado || !p.pronto}
              className="btn-primario mx-auto mt-6 block w-full max-w-sm !py-3.5 !text-[16px]"
            >
              {ocupado
                ? "Preparando…"
                : continuando
                  ? `Continuar envio (${quantidade})`
                  : `Enviar para ${quantidade} ${quantidade === 1 ? "empresa" : "empresas"}`}
            </button>

            {p.pronto && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--texto-3)]">
                Vão sair {p.hoje} hoje ({p.tempoHoje}), respeitando o teto de{" "}
                {p.limiteDiario}/dia.
                {p.dias > 1 && ` O resto continua nos próximos ${p.dias - 1} dia(s).`}
              </p>
            )}
          </>
        )}

        {!p.pronto && !rodando && (
          <div className="mx-auto mt-5 max-w-md rounded-[10px] bg-[var(--vermelho-fraco)] px-4 py-3 text-left text-[13px] leading-relaxed text-[var(--vermelho)]">
            <p className="font-medium">{p.impedimento}</p>
            {p.comoResolver.length > 0 && (
              <ol className="mt-2 space-y-1">
                {p.comoResolver.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s}
                  </li>
                ))}
              </ol>
            )}
            <Link href="/config" className="mt-2 inline-block font-medium underline">
              Abrir configurações
            </Link>
          </div>
        )}

        {erro && (
          <div className="mx-auto mt-5 max-w-md rounded-[10px] bg-[var(--vermelho-fraco)] px-4 py-3 text-left text-[13px] leading-relaxed text-[var(--vermelho)]">
            <p className="font-medium">{erro.texto}</p>
            {erro.passos.map((s, i) => (
              <p key={i} className="mt-1">
                {i + 1}. {s}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ──────────────────────── ordem de saída ──────────────────────── */}
      {!rodando && p.ordem.length > 0 && (
        <section className="cartao surgir mb-5 p-5">
          <h2 className="mb-1 text-[15px] font-semibold">Ordem de saída</h2>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--texto-2)]">
            Mais quentes primeiro, de {p.maiorNota} a {p.menorNota} pontos. Se o
            teto do dia cortar, quem fica para amanhã é o fim da lista.
          </p>

          <ol className="space-y-1">
            {p.ordem.map((l, i) => (
              <li
                key={l.nome + i}
                className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] odd:bg-[var(--superficie)]"
              >
                <span className="w-5 shrink-0 tabular-nums text-[var(--texto-3)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                <span className="hidden shrink-0 text-[12px] text-[var(--texto-3)] sm:block">
                  {l.cidade}
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums">
                  {l.emoji} {l.nota}
                </span>
              </li>
            ))}
          </ol>

          {p.total > p.ordem.length && (
            <p className="mt-2 text-[12px] text-[var(--texto-3)]">
              …e mais {p.total - p.ordem.length}, em ordem decrescente.
            </p>
          )}
        </section>
      )}

      {/* ───────────────────── o que vai acontecer ───────────────────── */}
      {!rodando && p.total > 0 && (
        <section className="cartao surgir mb-5 p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Para quem vai</h2>

          <div className="flex flex-wrap gap-1.5">
            {p.segmentos.map((s) => (
              <span key={s.nome} className="etiqueta etiqueta-neutra capitalize">
                {s.nome} · {s.quantidade}
              </span>
            ))}
          </div>

          {p.cidades.length > 1 && (
            <p className="mt-3 text-[13px] text-[var(--texto-2)]">
              {p.cidades.map((c) => `${c.nome} (${c.quantidade})`).join(" · ")}
            </p>
          )}

          {p.produtos.length > 0 && (
            <p className="mt-3 text-[13px] text-[var(--texto-2)]">
              Oferta escolhida por lead:{" "}
              {p.produtos.map((x) => `${x.quantidade} ${x.nome}`).join(", ")}
            </p>
          )}

          {/* Ver o texto não é aprovar lead — é saber o que sai do seu nome. */}
          {p.amostra.length > 0 && (
            <>
              <button
                onClick={() => setVerTexto((v) => !v)}
                className="mt-4 text-[13px] font-medium text-[var(--azul)] hover:underline"
              >
                {verTexto ? "Esconder" : "Ver a mensagem que vai sair"}
              </button>

              {verTexto && (
                <div className="mt-3 space-y-3">
                  {p.amostra.map((a) => (
                    <div key={a.nome}>
                      <p className="mb-1 text-[12.5px] text-[var(--texto-3)]">
                        {a.nome}
                        {a.cidade ? ` · ${a.cidade}` : ""} · {a.nota} pts
                      </p>
                      <p className="whitespace-pre-line rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 text-[13px] leading-relaxed">
                        {a.texto}
                      </p>
                    </div>
                  ))}
                  <p className="text-[12px] text-[var(--texto-3)]">
                    Cada mensagem é montada com os dados do próprio lead. Para
                    mudar o texto de uma antes de sair, use{" "}
                    <Link href="/automacao" className="text-[var(--azul)]">
                      Automação
                    </Link>
                    .
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ─────────────────── quem ficou de fora, e por quê ─────────────────── */}
      {!rodando && p.recusas.length > 0 && (
        <section className="cartao surgir mb-5 p-5">
          <h2 className="mb-1 text-[15px] font-semibold">Quem ficou de fora</h2>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--texto-2)]">
            Não é erro — são as travas que mantêm o número vivo e a lista limpa.
          </p>
          <ul className="space-y-1 text-[13px]">
            {p.recusas.map((r) => (
              <li key={r.motivo} className="flex justify-between gap-3">
                <span className="text-[var(--texto-2)]">{r.motivo}</span>
                <span className="shrink-0 tabular-nums text-[var(--texto-3)]">
                  {r.quantidade}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ────────────────────────── o que saiu ────────────────────────── */}
      {log.length > 0 && (
        <section className="cartao surgir p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Nesta rodada</h2>
          <ul className="space-y-1.5 text-[13px]">
            {log.map((l, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="shrink-0 tabular-nums text-[var(--texto-3)]">{l.hora}</span>
                <span className={l.ok ? "" : "text-[var(--ambar)]"}>{l.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-center text-[12.5px] text-[var(--texto-3)]">
        Já enviadas hoje: {p.enviadasHoje} de {p.limiteDiario} ·{" "}
        <Link href="/campanhas" className="hover:text-[var(--texto-2)]">
          escolher um lote específico
        </Link>
      </p>
    </main>
  );
}
