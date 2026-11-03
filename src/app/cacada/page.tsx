"use client";
import Link from "next/link";
import ScraperContatos from "@/components/scraper-contatos";
import { useRef, useState } from "react";
import { Cabecalho, ErroDados, paginaRotina } from "@/components/rotina-ui";
import { lerJson } from "@/lib/http-cliente";
type Resultado = { leads: { id: string; nome: string; cnpj: string | null; cidade: string | null; categoria: string | null; telefone: string | null; whatsapp: string | null; website: string | null; email: string | null; instagram: string | null }[]; aviso?: string };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export default function BuscarLeads() {
  const [nicho, setNicho] = useState(""); const [cidade, setCidade] = useState("");
  const [buscaId, setBuscaId] = useState(0);
  const [estado, setEstado] = useState("MG"); const [quantidade, setQuantidade] = useState(20);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState(""); const [buscando, setBuscando] = useState(false);
  const emCurso = useRef(false); const formulario = useRef<HTMLFormElement>(null);
  async function buscar() {
    if (emCurso.current || !formulario.current?.reportValidity()) return;
    emCurso.current = true; setBuscando(true); setErro(""); setResultado(null); setBuscaId(i => i + 1);
    try { setResultado(await lerJson<Resultado>("/api/leads/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nicho: nicho.trim(), cidade: cidade.trim(), estado, quantidade }) })); }
    catch (e) { setErro(e instanceof Error ? e.message : "A busca falhou. Tente novamente."); }
    finally { emCurso.current = false; setBuscando(false); }
  }
  return <main className={paginaRotina}>
    <Cabecalho titulo="Buscar leads" descricao="Escolha quem você quer encontrar e onde quer prospectar." />
    <form ref={formulario} onSubmit={e => { e.preventDefault(); void buscar(); }} className="cartao p-6">
      <fieldset disabled={buscando} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr]">
        <label className="text-sm font-medium">Segmento<input required minLength={2} value={nicho} onChange={e => setNicho(e.target.value)} placeholder="Ex.: restaurantes, oficinas, salões" className="campo mt-2" /></label>
        <label className="text-sm font-medium">Cidade<input required minLength={2} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex.: Uberlândia" className="campo mt-2" /></label>
        <label className="text-sm font-medium">Estado<select value={estado} onChange={e => setEstado(e.target.value)} className="campo mt-2">{UFS.map(uf => <option key={uf}>{uf}</option>)}</select></label>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs text-[var(--texto-3)]">Sugestões:</span>{["Restaurantes", "Oficinas", "Salões de beleza", "Pousadas"].map(n => <button disabled={buscando} type="button" key={n} onClick={() => setNicho(n)} className="rounded-full border border-[var(--linha)] px-3 py-1.5 text-xs hover:bg-[var(--superficie-2)]">{n}</button>)}</div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5 border-t border-[var(--linha)] pt-5"><label className="text-sm text-[var(--texto-2)]">Quantidade máxima<select disabled={buscando} className="campo mt-2" value={quantidade} onChange={e => setQuantidade(Number(e.target.value))}>{[10, 20, 40, 60].map(n => <option key={n} value={n}>{n} leads</option>)}</select></label><button disabled={buscando || nicho.trim().length < 2 || cidade.trim().length < 2} className="btn-primario" type="submit">{buscando ? "Buscando empresas…" : "Buscar leads →"}</button></div>
      <p className="mt-5 text-xs leading-relaxed text-[var(--texto-2)]">Fonte: dados abertos de CNPJ da Receita Federal. A busca usa empresas ativas por segmento e cidade; telefones podem estar desatualizados. Os resultados são salvos automaticamente em Meus leads.</p>
    </form>
    {buscando && <div role="status" className="cartao mt-6 p-6"><p className="font-medium">Buscando empresas na base pública de CNPJs…</p><p className="mt-2 text-sm text-[var(--texto-2)]">Aguarde enquanto consultamos os cadastros da cidade.</p><div className="esqueleto mt-5 h-2" /></div>}
    {erro && <ErroDados mensagem={erro} repetir={buscar} />}
    {resultado && resultado.leads.some(l => !l.telefone && !l.email && l.website) && <ScraperContatos key={buscaId} leads={resultado.leads} aoAtualizar={itens => setResultado(atual => atual ? { ...atual, leads: atual.leads.map(l => ({ ...l, ...itens.find(r => r.id === l.id)?.contatos })) } : atual)} />}
    {resultado && <section className="mt-7" aria-live="polite"><div className="mb-4 flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">{resultado.leads.length ? `${resultado.leads.length} leads salvos na sua base` : "Nenhum lead encontrado"}</h2><Link className="btn-secundario" href="/leads">Abrir meus leads →</Link></div>{resultado.aviso && <p className="mb-4 rounded-xl bg-[var(--superficie-2)] p-4 text-sm">{resultado.aviso}</p>}{!resultado.leads.length && <p className="cartao p-6 text-sm text-[var(--texto-2)]">Tente outro segmento ou uma cidade próxima. A busca consulta empresas ativas no cadastro público de CNPJs.</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resultado.leads.map(l => <Link key={l.id} href={`/lead/${l.id}`} className="cartao p-5 hover:border-[var(--azul)]"><h3 className="font-semibold">{l.nome}</h3><p className="mt-2 text-sm text-[var(--texto-2)]">{l.categoria || nicho} · {l.cidade || cidade}</p>{l.cnpj && <p className="mt-1 text-xs text-[var(--texto-3)]">CNPJ: {l.cnpj}</p>}<p className="mt-4 text-sm">{l.telefone || (l.whatsapp ? "WhatsApp disponível" : l.email || l.instagram || (l.website ? "Site disponível · coletar contatos" : "Sem contato direto"))}</p><p className="mt-4 text-xs text-[var(--azul)]">Ver lead →</p></Link>)}</div></section>}
    {!resultado && !buscando && !erro && <section className="mt-8 rounded-xl border border-dashed border-[var(--linha-forte)] px-6 py-12 text-center"><h2 className="font-medium">Sua próxima oportunidade começa aqui.</h2><p className="mt-2 text-sm text-[var(--texto-2)]">Preencha o segmento e a cidade para encontrar empresas.</p></section>}
  </main>;
}
