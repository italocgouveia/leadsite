"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { estadoInicial, demoProvider, DEMO_CONTACT_LIMIT, type EstadoDemo, type Metricas } from "@/lib/demo-automacao/motor";

/**
 * O ESTADO DA DEMONSTRAÇÃO, compartilhado entre as cinco telas.
 *
 * Vive em memória e é espelhado no `localStorage` do navegador. Nunca passa
 * pelo servidor, nunca chega ao banco: não existe rota de API para esta área
 * de propósito. A única forma de este estado sair do navegador seria alguém
 * escrever uma — e o teste de isolamento reprova se aparecer um `fetch` aqui.
 *
 * "IA digitando…" é estado de tela, não do motor: o motor transforma estado
 * instantaneamente, e a espera de um segundo existe só para a apresentação
 * ter ritmo de conversa.
 */

const CHAVE = "demo-automacao-v1";
const DIGITANDO_MS = 1100;

type Contexto = {
  estado: EstadoDemo;
  digitandoEm: string | null;
  apresentacao: boolean;
  metricas: Metricas;
  simular: () => void;
  assumir: (contatoId: string) => void;
  devolver: (contatoId: string) => void;
  alternarIA: () => void;
  iniciar: () => void;
  parar: () => void;
  reiniciar: () => void;
  alternarApresentacao: () => void;
};

const Ctx = createContext<Contexto | null>(null);

function carregar(): EstadoDemo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const salvo = JSON.parse(bruto) as EstadoDemo;
      /** Estado salvo com outro tamanho (a versão de 100) é descartado: o limite é o limite. */
      if (Array.isArray(salvo.contatos) && salvo.contatos.length === DEMO_CONTACT_LIMIT) {
        return { ...salvo, rodando: false };
      }
    }
  } catch {
    /* storage bloqueado ou corrompido: começa do zero, que é um estado válido */
  }
  return estadoInicial();
}

export function DemoAutomacaoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoDemo>(estadoInicial);
  const [pronto, setPronto] = useState(false);
  const [digitandoEm, setDigitandoEm] = useState<string | null>(null);
  const [apresentacao, setApresentacao] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laco = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Hidrata do navegador depois da montagem, para não divergir do servidor. */
  useEffect(() => {
    void (async () => {
      setEstado(carregar());
      try {
        setApresentacao(localStorage.getItem(`${CHAVE}-apresentacao`) === "1");
      } catch {
        /* sem storage: apresentação desligada */
      }
      setPronto(true);
    })();
  }, []);

  useEffect(() => {
    if (!pronto) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* quota ou modo privado: a demonstração segue só em memória */
    }
  }, [estado, pronto]);

  const simular = useCallback(() => {
    setEstado((atual) => {
      const { estado: proximo, contatoId } = demoProvider.simulateIncomingMessage(atual);
      if (!contatoId) return atual;
      if (timer.current) clearTimeout(timer.current);
      setDigitandoEm(contatoId);
      timer.current = setTimeout(() => {
        setEstado((e) => demoProvider.sendSimulatedMessage(e, contatoId));
        setDigitandoEm(null);
      }, DIGITANDO_MS);
      return proximo;
    });
  }, []);

  /**
   * O laço da simulação é um `setInterval` DE TELA, dentro do componente, e
   * morre com ele. Não é worker, não é cron, não sobrevive à navegação para
   * fora de /automacao, e não toca em nada além deste estado em memória.
   */
  const iniciar = useCallback(() => {
    setEstado((e) => ({ ...e, rodando: true }));
    if (laco.current) clearInterval(laco.current);
    laco.current = setInterval(simular, 3200);
    simular();
  }, [simular]);

  const parar = useCallback(() => {
    if (laco.current) clearInterval(laco.current);
    laco.current = null;
    setEstado((e) => ({ ...e, rodando: false }));
  }, []);

  useEffect(
    () => () => {
      if (laco.current) clearInterval(laco.current);
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const assumir = useCallback((id: string) => setEstado((e) => demoProvider.pauseConversation(e, id)), []);
  const devolver = useCallback((id: string) => setEstado((e) => demoProvider.resumeConversation(e, id)), []);
  const alternarIA = useCallback(() => setEstado((e) => ({ ...e, iaAtiva: !e.iaAtiva })), []);
  const reiniciar = useCallback(() => {
    parar();
    setEstado(estadoInicial());
  }, [parar]);
  const alternarApresentacao = useCallback(() => {
    setApresentacao((a) => {
      try {
        localStorage.setItem(`${CHAVE}-apresentacao`, a ? "0" : "1");
      } catch {
        /* sem storage */
      }
      return !a;
    });
  }, []);

  const metricas = useMemo(() => demoProvider.getMetrics(estado), [estado]);

  const valor = useMemo<Contexto>(
    () => ({
      estado,
      digitandoEm,
      apresentacao,
      metricas,
      simular,
      assumir,
      devolver,
      alternarIA,
      iniciar,
      parar,
      reiniciar,
      alternarApresentacao,
    }),
    [estado, digitandoEm, apresentacao, metricas, simular, assumir, devolver, alternarIA, iniciar, parar, reiniciar, alternarApresentacao],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDemo(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo precisa estar dentro de DemoAutomacaoProvider");
  return c;
}
