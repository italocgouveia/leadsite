"use client";
import { useEffect, useRef, useState } from "react";
import { lerJson } from "@/lib/http-cliente";

export type RetornoScraper = {
  id: string; status: string; motivo?: string; campos?: string[]; paginas?: string[];
  revisao?: { campo: string; motivo: string; valor: string }[];
  contatos?: { telefone: string | null; whatsapp: string | null; email: string | null; instagram: string | null };
};
type Candidato = { id: string; nome: string; website: string | null };

export default function ScraperContatos({ leads, aoAtualizar }: { leads: Candidato[]; aoAtualizar?: (resultados: RetornoScraper[]) => void }) {
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<RetornoScraper[]>([]);
  const [erro, setErro] = useState("");
  const parar = useRef(false);
  const vivo = useRef(true);
  const trava = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; parar.current = true; }; }, []);
  const candidatos = leads.filter(l => l.website);
  const feitos = new Set(resultados.map(r => r.id));
  const pendentes = candidatos.filter(l => !feitos.has(l.id));
  async function executar() {
    if (trava.current) return;
    trava.current = true; parar.current = false; setRodando(true); setErro("");
    // No máximo 20 sites por rodada; a pessoa pode continuar a partir do restante.
    const rodada = pendentes.slice(0, 20);
    try {
      for (let i = 0; i < rodada.length && !parar.current; i += 3) {
        const r = await lerJson<{ resultados: RetornoScraper[] }>("/api/leads/scraper", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: rodada.slice(i, i + 3).map(l => l.id) }),
        });
        if (!vivo.current) break;
        setResultados(anteriores => [...anteriores, ...r.resultados]);
        aoAtualizar?.(r.resultados);
      }
    } catch (e) { if (vivo.current) setErro(e instanceof Error ? e.message : "A coleta foi interrompida. Tente novamente."); }
    finally { trava.current = false; if (vivo.current) setRodando(false); }
  }
  if (!candidatos.length) return null;
  return <section className="cartao my-6 p-5" aria-label="Scraper de contatos">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Completar contatos com scraper</h2><p className="mt-1 max-w-2xl text-sm text-[var(--texto-2)]">Leia os sites públicos destas empresas para encontrar telefone, WhatsApp, e-mail e Instagram. Campos preenchidos são preservados.</p></div>
    {rodando ? <button className="btn-secundario" onClick={() => { parar.current = true; }}>Parar após este lote</button> : <button disabled={!pendentes.length} className="btn-primario" onClick={executar}>{!pendentes.length ? "Coleta concluída" : resultados.length ? "Continuar coleta" : `Buscar contatos em ${Math.min(20, pendentes.length)} sites →`}</button>}</div>
    <p className="mt-3 text-xs text-[var(--texto-2)]">Até 3 páginas por site, sem acessar áreas com login. Até 20 sites por rodada. A coleta depende do conteúdo publicado no site.</p>
    <div role="status" aria-live="polite" className="mt-4 text-sm">{rodando ? "Coletando… " : ""}{resultados.length} de {candidatos.length} sites processados · {resultados.filter(r => r.status === "completado").length} cadastros completados</div>
    {rodando && <progress className="mt-3 h-2 w-full accent-[var(--azul)]" value={resultados.length} max={candidatos.length} aria-label="Progresso da coleta" />}
    {erro && <p role="alert" className="mt-3 text-sm text-[var(--vermelho)]">{erro}</p>}
    {resultados.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm text-[var(--azul)]">Ver resultados da coleta</summary><ul className="mt-3 divide-y divide-[var(--linha)]">{resultados.map(r => <li key={r.id} className="py-3 text-sm"><strong>{leads.find(l => l.id === r.id)?.nome ?? "Lead"}</strong><p className="mt-1 text-[var(--texto-2)]">{r.campos?.length ? `Adicionado: ${r.campos.join(", ")}.` : r.motivo || "Nenhum novo contato aprovado para salvar."}</p>{r.paginas?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-[var(--azul)]">Fonte: {url}</a>)}{r.revisao?.map((a, i) => <p key={i} className="mt-1 text-xs text-[var(--texto-2)]">Revisar {a.campo}: {a.valor} — {a.motivo}</p>)}</li>)}</ul></details>}
  </section>;
}
