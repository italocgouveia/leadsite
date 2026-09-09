"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MATERIAIS,
  ROTULO_CATEGORIA,
  ROTULO_CANAL_MATERIAL,
  variaveisDe,
  type CategoriaMaterial,
  type CanalMaterial,
} from "@/lib/materiais";
import { Abas, Etiqueta, Vazio } from "@/components/central";

/**
 * 📚 BIBLIOTECA COMERCIAL — o que falar, quando, e por qual canal.
 *
 * A tela é estática de propósito: os materiais vivem em `lib/materiais.ts`,
 * versionados junto com o sistema. Não há busca no banco, não há estado de
 * servidor, e por isso ela abre instantaneamente no meio de uma ligação — que
 * é exatamente quando se precisa dela.
 *
 * FAVORITOS ficam no navegador, não no banco. É preferência de quem está
 * usando, não dado da operação; guardar no servidor seria criar uma migração
 * para lembrar de um coração.
 */

const CATEGORIAS: { id: CategoriaMaterial | "todas"; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "primeiro-contato", rotulo: "Primeiro contato" },
  { id: "follow-up", rotulo: "Follow-up" },
  { id: "objecao", rotulo: "Objeções" },
  { id: "diagnostico", rotulo: "Diagnóstico" },
  { id: "proposta", rotulo: "Propostas" },
  { id: "fechamento", rotulo: "Fechamento" },
];

const CANAIS: { id: CanalMaterial | "todos"; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos os canais" },
  { id: "whatsapp", rotulo: "📱 WhatsApp" },
  { id: "instagram", rotulo: "📸 Instagram" },
  { id: "ligacao", rotulo: "📞 Ligação" },
  { id: "email", rotulo: "📧 E-mail" },
  { id: "multicanal", rotulo: "🔀 Multicanal" },
];

const CHAVE_FAVORITOS = "materiais-favoritos";

function lerFavoritos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FAVORITOS) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export default function MateriaisPage() {
  const [categoria, setCategoria] = useState<CategoriaMaterial | "todas">("todas");
  const [canal, setCanal] = useState<CanalMaterial | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [favoritos, setFavoritos] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : lerFavoritos(),
  );
  const [copiado, setCopiado] = useState<string | null>(null);

  const alternarFavorito = (id: string) => {
    setFavoritos((f) => {
      const novo = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(novo));
      } catch {
        /* navegador anônimo ou storage bloqueado: o favorito vale só nesta sessão. */
      }
      return novo;
    });
  };

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      /* sem permissão de área de transferência: o texto continua selecionável. */
    }
  };

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return MATERIAIS.filter((m) => {
      if (categoria !== "todas" && m.categoria !== categoria) return false;
      if (canal !== "todos" && m.canal !== canal) return false;
      if (soFavoritos && !favoritos.includes(m.id)) return false;
      if (!termo) return true;
      return `${m.titulo} ${m.objetivo} ${m.quandoUsar} ${m.corpo}`.toLowerCase().includes(termo);
    });
  }, [categoria, canal, busca, soFavoritos, favoritos]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Biblioteca comercial</h1>
          <p className="mt-1 text-[13px] text-[var(--texto-3)]">
            O que falar, quando usar e o que esperar de resposta. {MATERIAIS.length} materiais.
          </p>
        </div>
        <Link href="/cacada" className="text-[13px] text-[var(--acao)] underline">
          voltar à Central
        </Link>
      </header>

      {/**
       * O AVISO QUE PRECISA ESTAR AQUI.
       *
       * Estes materiais são para contato MANUAL. O disparo automático continua
       * usando a mensagem universal aprovada, sem variação por lead — misturar
       * as duas coisas é como uma campanha automática acaba mandando texto que
       * ninguém revisou.
       */}
      <p className="mb-5 rounded-[10px] bg-[var(--superficie)] px-4 py-2.5 text-[12px] leading-relaxed text-[var(--texto-3)]">
        Estes textos são para abordagem <strong className="text-[var(--texto-2)]">manual</strong> —
        Instagram, ligação e o WhatsApp que você escreve à mão. O disparo automático continua usando
        a mensagem universal aprovada, sem alteração.
      </p>

      <div className="mb-3">
        <Abas
          abas={CATEGORIAS.map((c) => ({
            id: c.id,
            rotulo: c.rotulo,
            contagem:
              c.id === "todas"
                ? MATERIAIS.length
                : MATERIAIS.filter((m) => m.categoria === c.id).length,
          }))}
          atual={categoria}
          aoTrocar={setCategoria}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value as CanalMaterial | "todos")}
          className="campo w-48 py-1.5 text-[12.5px]"
        >
          {CANAIS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar no texto…"
          className="campo w-60 py-1.5 text-[12.5px]"
        />
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input
            type="checkbox"
            checked={soFavoritos}
            onChange={(e) => setSoFavoritos(e.target.checked)}
          />
          ★ só favoritos
        </label>
      </div>

      {lista.length === 0 && (
        <Vazio
          titulo="Nenhum material com esses filtros."
          detalhe="Tente outra categoria, outro canal, ou limpe a busca."
        />
      )}

      <ul className="space-y-3">
        {lista.map((m) => {
          const variaveis = variaveisDe(m.corpo);
          const favorito = favoritos.includes(m.id);
          return (
            <li key={m.id} className="cartao p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-medium">{m.titulo}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Etiqueta tom="acao">{ROTULO_CANAL_MATERIAL[m.canal]}</Etiqueta>
                    <Etiqueta>{ROTULO_CATEGORIA[m.categoria]}</Etiqueta>
                    {m.intervaloDias != null && (
                      <Etiqueta tom="alerta">após {m.intervaloDias} dias</Etiqueta>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => alternarFavorito(m.id)}
                  title={favorito ? "Remover dos favoritos" : "Favoritar"}
                  className={`rounded-full px-2.5 py-1 text-[15px] transition ${
                    favorito ? "text-[var(--ambar)]" : "text-[var(--texto-3)] hover:text-[var(--texto-2)]"
                  }`}
                >
                  {favorito ? "★" : "☆"}
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                    Objetivo
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--texto-2)]">{m.objetivo}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
                    Quando usar
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--texto-2)]">{m.quandoUsar}</p>
                </div>
              </div>

              <pre className="mt-3 whitespace-pre-wrap rounded-[10px] bg-[var(--superficie)] px-3.5 py-3 font-sans text-[13px] leading-relaxed text-[var(--texto)]">
                {m.corpo}
              </pre>

              <p className="mt-2 text-[12px] text-[var(--texto-3)]">
                ↳ <strong className="text-[var(--texto-2)]">{m.cta}</strong>
              </p>

              {variaveis.length > 0 && (
                <p className="mt-2 text-[11.5px] text-[var(--texto-3)]">
                  variáveis: {variaveis.map((v) => `{${v}}`).join(" · ")} — quando um dado não
                  existir, a linha inteira sai do texto em vez de virar espaço em branco
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void copiar(m.id, m.corpo)} className="btn-secundario">
                  {copiado === m.id ? "COPIADO ✓" : "COPIAR TEXTO"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
