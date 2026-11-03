import Link from "next/link";
export function Cabecalho({ titulo, descricao }: { titulo: string; descricao: string }) {
  return <header className="mb-8"><p className="mb-2 text-xs font-medium uppercase tracking-[.18em] text-[var(--azul)]">ICG Tech / Prospecção</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1><p className="mt-2 text-sm text-[var(--texto-2)]">{descricao}</p></header>;
}
export function ErroDados({ mensagem, repetir }: { mensagem: string; repetir: () => void }) {
  return <div role="alert" className="cartao my-5 p-5"><p>{mensagem}</p><div className="mt-3 flex items-center gap-4"><button className="btn-secundario" onClick={repetir}>Tentar novamente</button><Link className="text-sm text-[var(--azul)]" href="/entrar">Acessar conta</Link></div></div>;
}
export const paginaRotina = "mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 lg:pt-10";
