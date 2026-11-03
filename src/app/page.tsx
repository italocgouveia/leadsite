"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Cabecalho, ErroDados, paginaRotina } from "@/components/rotina-ui";
import { lerJson } from "@/lib/http-cliente";
type Base = { resumo: { total: number; novo: number; conversa: number; fechado: number }; leads: { id: string; empresa: string; segmento: string; proximoContato: string | null; status: string }[] };
export default function Inicio() {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try { setBase(await lerJson<Base>("/api/prospeccao")); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar o resumo."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const retornos = (base?.leads ?? []).filter(l => l.proximoContato && !["fechado", "perdido"].includes(l.status)).sort((a, b) => a.proximoContato!.localeCompare(b.proximoContato!));
  return <main className={paginaRotina}>
    <Cabecalho titulo="Sua prospecção, organizada." descricao="Encontre empresas, acompanhe as conversas e saiba qual é o próximo passo." />
    <section className="mb-7 rounded-2xl border border-[var(--linha-forte)] bg-[var(--azul-fraco)] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><p className="text-xl font-semibold">Comece por uma boa lista.</p><p className="mt-2 text-sm text-[var(--texto-2)]">Escolha um segmento e uma cidade. Os leads encontrados ficam salvos para você.</p></div><Link href="/cacada" className="btn-primario mt-5 shrink-0 sm:mt-0">Buscar leads →</Link></section>
    {erro && <ErroDados mensagem={erro} repetir={carregar} />}
    <section aria-label="Resumo da base" aria-busy={carregando} className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Leads na base", base?.resumo.total], ["Novos leads", base?.resumo.novo], ["Em conversa", base?.resumo.conversa], ["Clientes fechados", base?.resumo.fechado]].map(([rotulo, valor]) => <div key={rotulo} className="cartao p-5"><p className="text-sm text-[var(--texto-2)]">{rotulo}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{carregando || erro ? "—" : valor}</p></div>)}</section>
    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="cartao p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Próximos contatos</h2><Link className="text-sm text-[var(--azul)]" href="/leads">Ver leads →</Link></div>
      {carregando ? <p role="status">Carregando sua agenda…</p> : erro ? <p className="text-sm text-[var(--texto-2)]">Agenda indisponível. Tente carregar novamente.</p> : retornos.length ? <ul className="divide-y divide-[var(--linha)]">{retornos.slice(0, 6).map(l => <li key={l.id}><Link href={`/lead/${l.id}`} className="flex items-center justify-between gap-3 py-4 hover:text-[var(--azul)]"><div><p className="font-medium">{l.empresa}</p><p className="mt-1 text-xs text-[var(--texto-2)]">{l.segmento}</p></div><time className="shrink-0 text-sm" dateTime={l.proximoContato!}>{new Date(l.proximoContato!).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time></Link></li>)}</ul> : <div className="py-8 text-center"><p className="font-medium">Nenhum retorno agendado.</p><p className="mt-2 text-sm text-[var(--texto-2)]">Abra um lead e defina o próximo contato para organizar sua rotina.</p><Link className="btn-secundario mt-5" href="/leads">Organizar meus leads</Link></div>}
      </section>
      <section className="cartao p-6"><h2 className="text-lg font-semibold">Uma rotina simples</h2><ol className="mt-5 space-y-6">{[["01", "Buscar", "Encontre empresas no segmento e na cidade escolhidos.", "/cacada"], ["02", "Conversar", "Acompanhe respostas e registre o próximo passo.", "/conversas"], ["03", "Automatizar", "Prepare mensagens, revise e acompanhe os envios.", "/rotina"]].map(([n, titulo, texto, href]) => <li key={n} className="flex gap-4"><span className="text-sm text-[var(--azul)]">{n}</span><Link href={href}><p className="font-medium">{titulo} ↗</p><p className="mt-1 text-sm leading-relaxed text-[var(--texto-2)]">{texto}</p></Link></li>)}</ol></section>
    </div>
  </main>;
}
