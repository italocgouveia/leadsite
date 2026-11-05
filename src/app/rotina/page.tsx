"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Cabecalho, ErroDados, paginaRotina } from "@/components/rotina-ui";
import { lerJson } from "@/lib/http-cliente";

type Fila = {
  aguardando: number; enviadasHoje: number; respondidasHoje: number; errosHoje: number;
  limiteDiario: number; intervaloSegundos: number; motivo: string | null;
  bridge: { alcancavel: boolean; whatsappConectado?: boolean; filaWorkerAtivo?: boolean };
  statusWorker: { label: string };
  ultimosEnvios: { lead: string; status: string; quando: string }[];
};
export default function Automacao() {
  const [fila, setFila] = useState<Fila | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const carregar = useCallback(async () => {
    try { setFila(await lerJson<Fila>("/api/automacao/fila")); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível consultar a automação."); }
  }, []);
  useEffect(() => {
    const inicial = window.setTimeout(() => void carregar(), 0);
    const id = setInterval(() => { if (document.visibilityState === "visible") void carregar(); }, 30000);
    return () => { window.clearTimeout(inicial); clearInterval(id); };
  }, [carregar]);
  async function pausar() {
    setOcupado(true); setAviso("");
    try {
      // Desliga primeiro o interruptor mestre. Mesmo sem a bridge, a fila bloqueia novos envios.
      await lerJson("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automacaoAtiva: false }) });
      try {
        await lerJson("/api/automacao/worker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "desligar" }) });
        setAviso("Automação pausada. As mensagens pendentes continuam na fila. Um envio já em andamento pode terminar.");
      } catch {
        setAviso("Novos envios bloqueados no painel. Não foi possível confirmar a parada do serviço de WhatsApp. Um envio em andamento pode terminar.");
      }
      await carregar();
    } catch (e) { setAviso(e instanceof Error ? e.message : "Não foi possível pausar. Tente novamente."); }
    finally { setOcupado(false); }
  }
  return <main className={paginaRotina}>
    <Cabecalho titulo="Automação" descricao="Acompanhe os envios e mantenha o controle da sua prospecção." />
    {erro && <ErroDados mensagem={erro} repetir={carregar} />}
    {!fila && !erro && <p role="status" className="cartao p-6">Consultando a automação…</p>}
    {fila && <>
      <section className="cartao p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-[var(--texto-2)]">Estado atual {erro && "· última consulta válida"}</p><h2 className="mt-2 text-xl font-semibold">{fila.statusWorker.label}</h2><p className="mt-2 text-sm text-[var(--texto-2)]">{fila.motivo || "Acompanhe a fila e as respostas abaixo."}</p></div><button disabled={ocupado} className="btn-secundario" onClick={pausar}>{ocupado ? "Pausando…" : "Pausar automação"}</button></div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--linha)] pt-4 text-sm"><span>WhatsApp: {fila.bridge.alcancavel ? fila.bridge.whatsappConectado ? "conectado" : "desconectado" : "indisponível"}</span><span className="text-[var(--texto-2)]">Até {fila.limiteDiario} envios/dia · intervalo de {fila.intervaloSegundos}s</span><Link href="/config" className="text-[var(--azul)]">Configurar conexão →</Link></div>
      </section>
      <section aria-label="Envios de hoje" className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Na fila", fila.aguardando], ["Enviadas hoje", fila.enviadasHoje], ["Respostas hoje", fila.respondidasHoje], ["Falhas hoje", fila.errosHoje]].map(([r, v]) => <div key={r} className="cartao p-5"><p className="text-sm text-[var(--texto-2)]">{r}</p><p className="mt-2 text-3xl font-semibold">{v}</p></div>)}</section>
    </>}
    {aviso && <p role="status" className="my-5 rounded-xl bg-[var(--azul-fraco)] p-4 text-sm">{aviso}</p>}
    <section className="my-6 rounded-xl border border-[var(--linha-forte)] p-6"><h2 className="text-lg font-semibold">Prepare, revise e inicie.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--texto-2)]">Escolha os leads e confira as mensagens antes de iniciar. A preparação e a retomada ficam na mesma tela, com os limites e as verificações da sua operação.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/disparos" className="btn-primario">Preparar ou retomar envios →</Link><Link href="/conversas" className="btn-secundario">Ver respostas</Link></div></section>
    {fila && <section className="cartao p-6"><h2 className="mb-4 text-lg font-semibold">Últimos envios</h2>{fila.ultimosEnvios.length ? <ul className="divide-y divide-[var(--linha)]">{fila.ultimosEnvios.map((m, i) => <li key={`${m.quando}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-4"><span>{m.lead}</span><span className="text-sm text-[var(--texto-2)]">{m.status === "erro" ? "Falha no envio" : m.status} · {new Date(m.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span></li>)}</ul> : <p className="py-5 text-sm text-[var(--texto-2)]">Nenhum envio registrado. Prepare sua primeira fila quando os leads estiverem prontos.</p>}</section>}
  </main>;
}
