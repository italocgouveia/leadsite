"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sair } from "@/app/entrar/acoes";

/**
 * A BARRA LATERAL É A NAVEGAÇÃO. Cada área tem entrada própria.
 *
 * A versão anterior escondia áreas inteiras dentro de abas da Central: para
 * chegar em enriquecimento você entrava em outra tela e clicava de novo. Isso
 * confunde duas coisas diferentes — a Central é BIBLIOTECA (o que falar), e
 * encontrar, priorizar e enriquecer são OPERAÇÃO (o que fazer).
 *
 * Os grupos nomeiam a intenção, não a tecnologia:
 *
 *   PROSPECTAR  trazer empresa e decidir quem abordar
 *   CONVERSAR   os canais e a operação de envio
 *   MATERIAL    o que falar em cada situação
 *   ACOMPANHAR  o que já está em movimento
 *
 * `/` continua existindo e funcionando — é a busca antiga, hoje superada por
 * "Encontrar clientes", que usa a MESMA rota de coleta. Ela saiu do menu para
 * não oferecer duas portas para a mesma coisa, mas o link salvo de alguém
 * continua abrindo.
 */
type ItemMenu = { href: string; rotulo: string; icone: string };
type Grupo = { titulo: string; itens: readonly ItemMenu[] };

const GRUPOS: readonly Grupo[] = [
  {
    titulo: "Prospectar",
    itens: [
      { href: "/cacada", rotulo: "Encontrar clientes", icone: "busca" },
      { href: "/radar", rotulo: "Radar comercial", icone: "alvo" },
      { href: "/enriquecimento", rotulo: "Enriquecimento", icone: "globo" },
      { href: "/leads", rotulo: "Lista de leads", icone: "lista" },
    ],
  },
  {
    titulo: "Conversar",
    itens: [
      { href: "/conversas", rotulo: "Conversas", icone: "balao" },
      { href: "/instagram", rotulo: "Instagram", icone: "camera" },
      { href: "/disparos", rotulo: "Envio de mensagens", icone: "aviao" },
      { href: "/campanhas", rotulo: "Campanhas", icone: "foguete" },
    ],
  },
  {
    titulo: "Automação IA",
    itens: [
      { href: "/automacao", rotulo: "Visão geral", icone: "robo" },
      { href: "/automacao/conversas", rotulo: "Conversas IA", icone: "balao" },
      { href: "/automacao/contatos", rotulo: "Contatos", icone: "lista" },
      { href: "/automacao/fluxos", rotulo: "Fluxos", icone: "fluxo" },
      { href: "/automacao/configuracoes", rotulo: "Configurações", icone: "engrenagem" },
    ],
  },
  {
    titulo: "Material",
    itens: [{ href: "/prospeccao", rotulo: "Central de prospecção", icone: "livro" }],
  },
  {
    titulo: "Acompanhar",
    itens: [
      { href: "/painel", rotulo: "Painel", icone: "grafico" },
      { href: "/pipeline", rotulo: "Pipeline", icone: "colunas" },
      { href: "/sites", rotulo: "Sites", icone: "monitor" },
    ],
  },
] as const;

/** Ajuste e diagnóstico: importam raramente, e ficam fora do caminho. */
const SECUNDARIOS: readonly ItemMenu[] = [
  { href: "/calibracao", rotulo: "Calibração", icone: "regua" },
  { href: "/config", rotulo: "Configurações", icone: "engrenagem" },
] as const;

function Icone({ nome, ativo }: { nome: string; ativo: boolean }) {
  const p = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: ativo ? 2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0",
  };
  if (nome === "robo")
    return (
      <svg {...p}>
        <rect x="5" y="8" width="14" height="11" rx="3" />
        <path d="M12 8V4M9 13h.01M15 13h.01M9 16h6" />
      </svg>
    );
  if (nome === "fluxo")
    return (
      <svg {...p}>
        <rect x="3" y="4" width="6" height="5" rx="1.5" />
        <rect x="15" y="4" width="6" height="5" rx="1.5" />
        <rect x="9" y="15" width="6" height="5" rx="1.5" />
        <path d="M6 9v3h12V9M12 12v3" />
      </svg>
    );
  if (nome === "alvo")
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    );
  if (nome === "livro")
    return (
      <svg {...p}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5z" />
        <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v2H5.5" />
      </svg>
    );
  if (nome === "camera")
    return (
      <svg {...p}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
        <circle cx="12" cy="12" r="3.8" />
        <path d="M16.8 7.2h.01" />
      </svg>
    );
  if (nome === "busca")
    return (
      <svg {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  if (nome === "lista")
    return (
      <svg {...p}>
        <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </svg>
    );
  if (nome === "engrenagem")
    return (
      <svg {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  if (nome === "regua")
    return (
      <svg {...p}>
        <rect x="2.5" y="7" width="19" height="10" rx="2" />
        <path d="M7 7v3M11 7v4.5M15 7v3M19 7v4.5" />
      </svg>
    );
  if (nome === "grafico")
    return (
      <svg {...p}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-5 3.5 3L20 7" />
      </svg>
    );
  if (nome === "foguete")
    return (
      <svg {...p}>
        <path d="M13.5 3c3 1 5.5 3.5 6.5 6.5-1.5 5-6 9-10.5 10.5l-2-2C9 13.5 12 8.5 13.5 3Z" />
        <path d="M7.5 18 4 21M9.5 12.5 5 11l2.5-3 3 .5" />
      </svg>
    );
  if (nome === "aviao")
    return (
      <svg {...p}>
        <path d="M21.5 2.5 11 13M21.5 2.5l-6.8 19-3.7-8.5L2.5 9.3l19-6.8Z" />
      </svg>
    );
  if (nome === "raio")
    return (
      <svg {...p}>
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
      </svg>
    );
  if (nome === "balao")
    return (
      <svg {...p}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.7-5a8.2 8.2 0 0 1-.7-3.4 8.4 8.4 0 0 1 8.5-8.5 8.4 8.4 0 0 1 8.5 7.4Z" />
        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
      </svg>
    );
  if (nome === "monitor")
    return (
      <svg {...p}>
        <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
        <path d="M9 20.5h6M12 16.5v4" />
      </svg>
    );
  if (nome === "colunas")
    return (
      <svg {...p}>
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
        <rect x="16" y="4" width="5" height="7" rx="1.5" />
      </svg>
    );
  if (nome === "globo")
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  );
}

export default function Menu({ usuario }: { usuario?: { nome?: string | null; email?: string | null } | null }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  const escondido = caminho.startsWith("/s/") || caminho === "/entrar";

  // Badge de não lidas em "Conversas" — só busca com o menu visível.
  useEffect(() => {
    if (escondido) return;
    const buscar = () =>
      fetch("/api/conversas")
        .then((r) => r.json())
        .then((d: { naoLidasTotal?: number }) => setNaoLidas(d.naoLidasTotal ?? 0))
        .catch(() => {});
    buscar();
    const id = setInterval(buscar, 30_000);
    return () => clearInterval(id);
  }, [escondido]);

  // A página pública do cliente e a tela de login não levam o menu junto.
  if (escondido) return null;

  /**
   * Exato para a raiz e para /automacao, que tem filhos no proprio menu:
   * com startsWith, "Visao geral" acenderia junto com "Conversas IA".
   */
  const ehAtivo = (href: string) =>
    href === "/" || href === "/automacao" ? caminho === href : caminho.startsWith(href);

  const cabecalho = (
    <div className="mb-6 flex items-center gap-2.5 px-2.5 pt-2">
      {/* Marca: "i" em azul, como no perfil e no site. */}
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--linha)] bg-[var(--superficie)] text-[15px] font-bold tracking-tighter">
        <span className="text-[var(--azul)]">i</span>CG
      </span>
      <span>
        <span className="block text-[14px] font-semibold leading-tight tracking-tight">
          ICG TECH
        </span>
        <span className="block text-[11px] uppercase tracking-[0.14em] text-[var(--texto-3)]">
          Prospecção
        </span>
      </span>
    </div>
  );

  const item = (i: { href: string; rotulo: string; icone: string }) => {
    const ativo = ehAtivo(i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={() => setAberto(false)}
        className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] transition-colors ${
          ativo
            ? "bg-[var(--azul-fraco)] font-medium text-[var(--azul)]"
            : "text-[var(--texto-2)] hover:bg-[var(--superficie)] hover:text-[var(--texto)]"
        }`}
      >
        <Icone nome={i.icone} ativo={ativo} />
        {i.rotulo}
        {i.href === "/conversas" && naoLidas > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--azul)] px-1.5 text-[11px] font-semibold text-white">
            {naoLidas}
          </span>
        )}
      </Link>
    );
  };

  const links = (
    /**
     * O meio rola; cabeçalho e rodapé ficam. A barra é h-screen, e com o
     * grupo Automação os links passaram da altura da tela — o excedente
     * ficava cortado, com o rodapé (Conectado/Sair) fora de alcance.
     * min-h-0 é o que permite ao filho flex encolher abaixo do conteúdo.
     */
    <nav className="rola-fino min-h-0 flex-1 space-y-3 overflow-y-auto pr-1.5">
      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <p className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--texto-3)]">
            {g.titulo}
          </p>
          <div className="space-y-0.5">{g.itens.map(item)}</div>
        </div>
      ))}

      {/**
       * "Mais" abre fechado. As telas de dentro são de ajuste e diagnóstico,
       * não de uso diário — deixá-las visíveis empatava a atenção com o que
       * você faz todo dia.
       */}
      <details className="group pt-1" open={SECUNDARIOS.some((i) => ehAtivo(i.href))}>
        <summary className="cursor-pointer list-none px-2.5 py-2 text-[13px] text-[var(--texto-3)] hover:text-[var(--texto-2)]">
          Mais
        </summary>
        <div className="mt-0.5 space-y-0.5">{SECUNDARIOS.map(item)}</div>
      </details>
    </nav>
  );

  /**
   * Só aparece com sessão do Google. No modo senha não há o que deslogar —
   * o navegador é que guarda as credenciais do Basic Auth.
   */
  const rodape = usuario ? (
    <div className="mt-auto border-t border-[var(--linha)] px-2.5 pb-1 pt-3">
      <p className="truncate text-[13px]">{usuario.nome ?? "Conectado"}</p>
      <p className="mb-2 truncate text-[11px] text-[var(--texto-3)]">{usuario.email}</p>
      <form action={sair}>
        <button
          type="submit"
          className="flex items-center gap-2 text-[13px] text-[var(--texto-2)] transition-colors hover:text-[var(--texto)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sair
        </button>
      </form>
    </div>
  ) : null;

  return (
    <>
      {/* topo só no celular */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--linha)] bg-[var(--fundo)]/70 px-4 backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="rounded-[8px] p-2 text-[var(--texto-2)] hover:bg-[var(--superficie)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold tracking-tight"><span className="text-[var(--azul)]">i</span>CG TECH</span>
      </header>

      {/**
       * Dois elementos separados, de propósito.
       *
       * A versão anterior era um só, alternando entre `-translate-x-full` e
       * `translate-x-0`. A classe trocava, o seletor casava, e mesmo assim o
       * transform computado ficava preso em -100%: disputa de cascata com as
       * utilities do Tailwind v4. Em vez de brigar com precedência, o menu do
       * celular simplesmente não existe no DOM enquanto está fechado.
       */}
      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setAberto(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[var(--linha)] bg-[var(--fundo)]/90 p-3 backdrop-blur-xl lg:hidden">
            {cabecalho}
            {links}
            {rodape}
          </aside>
        </>
      )}

      {/* desktop: fixo, sem animação nenhuma */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--linha)] bg-[var(--fundo)]/55 p-3 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen">
        {cabecalho}
        {links}
        {rodape}
      </aside>
    </>
  );
}
