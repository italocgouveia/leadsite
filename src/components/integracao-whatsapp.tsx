"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Assistente de integração de WhatsApp.
 *
 * Duas seções SEPARADAS e rotuladas, porque misturá-las foi o erro que
 * originou tudo isto:
 *
 *   📤 API DE ENVIO   o sistema chama o provedor   (você preenche)
 *   📥 WEBHOOK        o provedor chama o sistema   (você copia)
 *
 * O campo do webhook é somente-leitura. Não existe onde digitar a URL errada.
 */

type Pendencia = { item: string; feito: boolean };

type Estado = {
  pronta: boolean;
  tipo: "evolution" | "waha" | "custom" | null;
  baseUrl: string | null;
  instancia: string | null;
  endpointCustom: string | null;
  temToken: boolean;
  tokenMascarado: string;
  urlDeEnvio: string | null;
  testadoEm: string | null;
  estadoProvedor: string | null;
  erro: string | null;
  comoCorrigir: string[];
  aviso: string | null;
  pendencias: Pendencia[];
  webhook: {
    url: string;
    publico: boolean;
    aviso: string | null;
    recebendo: boolean;
    ultimoEm: string | null;
  };
};

const PROVEDORES = [
  { valor: "evolution", nome: "Evolution API", dica: "Instância no caminho, header apikey" },
  { valor: "waha", nome: "WAHA", dica: "Sessão no corpo, header X-Api-Key" },
  { valor: "custom", nome: "API personalizada", dica: "Você informa o endpoint" },
] as const;

export default function IntegracaoWhatsapp() {
  const [e, setE] = useState<Estado | null>(null);
  const [tipo, setTipo] = useState<"evolution" | "waha" | "custom">("evolution");
  const [baseUrl, setBaseUrl] = useState("");
  const [instancia, setInstancia] = useState("");
  const [endpointCustom, setEndpointCustom] = useState("");
  const [token, setToken] = useState("");
  const [tocouToken, setTocouToken] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{
    ok: boolean;
    texto: string;
    detalhes?: string[];
  } | null>(null);

  const [numeroTeste, setNumeroTeste] = useState("");
  const [textoTeste, setTextoTeste] = useState("Teste enviado pelo sistema.");
  const [copiado, setCopiado] = useState(false);
  const [sugestaoNumero, setSugestaoNumero] = useState<string | null>(null);

  /**
   * `aplicar` recebe o estado do servidor e preenche o formulário com o que
   * já está salvo — assim a tela abre mostrando a configuração atual em vez
   * de campos vazios que fariam você redigitar tudo.
   */
  const aplicar = useCallback((r: Estado) => {
    setE(r);
    if (r.tipo) setTipo(r.tipo);
    setBaseUrl(r.baseUrl ?? "");
    setInstancia(r.instancia ?? "");
    /**
     * O endpoint precisa voltar para o formulário. Sem esta linha o campo
     * abria vazio e o botão Salvar gravava `null` por cima do valor bom — o
     * worker passava a postar na RAIZ do provedor, que respondia 200, e o
     * envio reportava sucesso sem mandar nada.
     */
    setEndpointCustom(r.endpointCustom ?? "");
  }, []);

  const carregar = useCallback(
    () => fetch("/api/integracao").then((x) => x.json() as Promise<Estado>).then(aplicar),
    [aplicar],
  );

  /**
   * O fetch fica DENTRO do efeito, com a atualização no `.then`. Chamar uma
   * função que faz setState direto no corpo do efeito dispara o lint do React
   * 19 (`set-state-in-effect`), que já mordeu este projeto algumas vezes.
   */
  useEffect(() => {
    let vivo = true;
    fetch("/api/integracao")
      .then((x) => x.json() as Promise<Estado>)
      .then((r) => {
        if (vivo) aplicar(r);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [aplicar]);

  async function salvar() {
    setSalvando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provedorTipo: tipo,
          provedorBaseUrl: baseUrl.trim(),
          provedorInstancia: instancia.trim() || null,
          provedorEndpointCustom: endpointCustom.trim() || null,
          // Token só vai quando você digitou algo — assim não apaga o salvo.
          ...(tocouToken ? { provedorToken: token } : {}),
        }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setResultado({ ok: false, texto: corpo.erro, detalhes: corpo.comoCorrigir ?? [] });
        return;
      }
      setTocouToken(false);
      setToken("");
      setResultado({ ok: true, texto: "Configuração salva." });
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function acao(a: "testar-conexao" | "testar-envio" | "registrar-webhook") {
    setTestando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/integracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: a,
          ...(a === "testar-envio" ? { numero: numeroTeste, texto: textoTeste } : {}),
        }),
      }).then((x) => x.json());

      if (r.ok) {
        setResultado({
          ok: true,
          texto:
            a === "testar-conexao"
              ? `Conectado — ${r.detalhes?.provedor}, instância ${r.detalhes?.instancia}, estado ${r.detalhes?.estado}`
              : a === "testar-envio"
                ? `Mensagem enviada${r.provedorId ? ` (id ${r.provedorId})` : ""}`
                : "Webhook registrado no provedor.",
        });
      } else {
        // Sugestão de número corrigido vira botão, em vez de texto para copiar.
        if (r.sugestao) setSugestaoNumero(r.sugestao);
        setResultado({ ok: false, texto: r.erro ?? "Falhou", detalhes: r.comoResolver ?? [] });
      }
      await carregar();
    } finally {
      setTestando(false);
    }
  }

  if (!e) return <div className="esqueleto h-64" />;

  const precisaInstancia = tipo !== "custom";

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════ status ═══════════════════════════════ */}
      <section className="cartao-apple p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold tracking-tight text-[var(--texto)]">
            {e.pronta ? "🟢 WhatsApp conectado" : "🔴 WhatsApp não configurado"}
          </h2>
          {e.testadoEm && (
            <span className="text-[12px] text-[var(--texto-3)]">
              verificado {new Date(e.testadoEm).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        {!e.pronta && (
          <>
            <p className="mb-2 text-[13px] text-[var(--texto-2)]">
              A campanha não vai enviar mensagens até isto ficar verde.
            </p>
            <ul className="mb-1 space-y-1 text-[13px]">
              {e.pendencias.map((p) => (
                <li key={p.item} className={p.feito ? "text-[var(--verde)]" : "text-[var(--texto-2)]"}>
                  {p.feito ? "☑" : "☐"} {p.item}
                </li>
              ))}
            </ul>
          </>
        )}

        {e.pronta && e.estadoProvedor && (
          <p className="text-[13px] text-[var(--texto-2)]">
            {PROVEDORES.find((p) => p.valor === e.tipo)?.nome} · instância{" "}
            <strong>{e.instancia}</strong> · estado {e.estadoProvedor}
          </p>
        )}
      </section>

      {/* ═══════════════════════════ 📤 API DE ENVIO ══════════════════════════ */}
      <section className="cartao-apple p-6">
        <h2 className="mb-1 font-semibold tracking-tight text-[var(--texto)]">
          📤 API de envio
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--texto-2)]">
          O endereço do <strong>seu servidor de WhatsApp</strong> — é para cá que o
          sistema manda as mensagens. Não confunda com o webhook lá embaixo.
        </p>

        <label className="mb-1 block text-[13px] text-[var(--texto-2)]">Provedor</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {PROVEDORES.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => setTipo(p.valor)}
              title={p.dica}
              className={`rounded-[10px] px-3 py-2 text-[13px] transition ${
                tipo === p.valor
                  ? "bg-[var(--azul)] text-white"
                  : "bg-[var(--superficie)] text-[var(--texto-2)] hover:text-[var(--texto)]"
              }`}
            >
              {p.nome}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
              URL base da API
            </label>
            <input
              value={baseUrl}
              onChange={(ev) => setBaseUrl(ev.target.value)}
              placeholder="http://localhost:8080"
              className="campo-apple"
            />
            <p className="mt-1 text-[12px] text-[var(--texto-3)]">
              Só o endereço. Sem caminho, sem instância, sem token.
            </p>
          </div>

          {precisaInstancia ? (
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
                {tipo === "waha" ? "Sessão" : "Instância"}
              </label>
              <input
                value={instancia}
                onChange={(ev) => setInstancia(ev.target.value)}
                placeholder={tipo === "waha" ? "default" : "minha-instancia"}
                className="campo-apple"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
                Endpoint de envio
              </label>
              <input
                value={endpointCustom}
                onChange={(ev) => setEndpointCustom(ev.target.value)}
                placeholder="/api/enviar"
                className="campo-apple"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[13px] text-[var(--texto-2)]">
              Token / API key
            </label>
            <input
              type="password"
              value={tocouToken ? token : ""}
              onChange={(ev) => {
                setToken(ev.target.value);
                setTocouToken(true);
              }}
              placeholder={e.temToken ? e.tokenMascarado : "sua chave"}
              className="campo-apple"
            />
            <p className="mt-1 text-[12px] text-[var(--texto-3)]">
              {e.temToken
                ? `Salvo como ${e.tokenMascarado}. Deixe em branco para manter.`
                : "Fica no servidor e nunca volta para a tela."}
            </p>
          </div>

          {/* endpoint montado, para você conferir */}
          {e.urlDeEnvio && (
            <p className="rounded-[10px] bg-[var(--superficie)] px-3.5 py-2.5 text-[12.5px] text-[var(--texto-2)]">
              O sistema vai chamar:{" "}
              <code className="text-[var(--texto)]">{e.urlDeEnvio}</code>
            </p>
          )}

          {e.aviso && (
            <p className="rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ambar)]">
              {e.aviso}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={salvar} disabled={salvando} className="btn-primario">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => acao("testar-conexao")}
            disabled={testando || !e.baseUrl}
            className="btn-secundario"
          >
            🔌 {testando ? "Testando…" : "Testar conexão"}
          </button>
        </div>

        {resultado && (
          <div
            className={`mt-3 rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed ${
              resultado.ok
                ? "bg-[var(--verde-fraco)] text-[var(--verde)]"
                : "bg-[var(--vermelho-fraco)] text-[var(--vermelho)]"
            }`}
          >
            <p>
              {resultado.ok ? "🟢" : "🔴"} {resultado.texto}
            </p>
            {resultado.detalhes && resultado.detalhes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {resultado.detalhes.map((d, i) => (
                  <li key={i}>
                    {i + 1}. {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ═══════════════════════════ 💬 TESTE DE ENVIO ════════════════════════ */}
      <section className="cartao-apple p-6">
        <h2 className="mb-1 font-semibold tracking-tight text-[var(--texto)]">
          💬 Testar envio
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--texto-2)]">
          Usa exatamente a mesma função do worker. Se funcionar aqui, funciona na
          campanha — não existe caminho de teste separado.
        </p>
        <div className="space-y-3">
          <input
            value={numeroTeste}
            onChange={(ev) => setNumeroTeste(ev.target.value)}
            placeholder="5534999887766"
            inputMode="numeric"
            className="campo-apple"
          />
          <input
            value={textoTeste}
            onChange={(ev) => setTextoTeste(ev.target.value)}
            className="campo-apple"
          />
          {sugestaoNumero && (
            <p className="rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--ambar)]">
              Faltou o código do país.{" "}
              <button
                type="button"
                onClick={() => {
                  setNumeroTeste(sugestaoNumero);
                  setSugestaoNumero(null);
                  setResultado(null);
                }}
                className="font-semibold underline"
              >
                Usar {sugestaoNumero}
              </button>
            </p>
          )}
          <button
            type="button"
            onClick={() => acao("testar-envio")}
            disabled={testando || !numeroTeste.trim()}
            className="btn-primario"
          >
            {testando ? "Enviando…" : "Enviar teste"}
          </button>
          <p className="text-[12px] text-[var(--texto-3)]">
            Com DDI: 55 + DDD + número. Ex: 5534998742209
          </p>
        </div>
      </section>

      {/* ═══════════════════════════ 📥 WEBHOOK ═══════════════════════════════ */}
      <section className="cartao-apple p-6">
        <h2 className="mb-1 font-semibold tracking-tight text-[var(--texto)]">
          📥 Webhook de recebimento
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--texto-2)]">
          Este endereço <strong>NÃO envia mensagens</strong>. Ele vai no painel da sua
          API de WhatsApp, para o provedor avisar este sistema quando alguém responder.
        </p>

        <div className="mb-2 flex gap-2">
          <input readOnly value={e.webhook.url} className="campo-apple" onFocus={(ev) => ev.currentTarget.select()} />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(e.webhook.url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1600);
            }}
            className="btn-secundario shrink-0"
          >
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </div>

        <p className="mb-3 text-[12px] text-[var(--texto-3)]">
          Acrescente <code>?token=SEU_API_TOKEN</code> ao final — o valor está no seu
          <code> .env.local</code>.
        </p>

        <p
          className={`mb-3 rounded-[10px] px-3.5 py-2.5 text-[12.5px] ${
            e.webhook.recebendo
              ? "bg-[var(--verde-fraco)] text-[var(--verde)]"
              : "bg-[var(--ambar-fraco)] text-[var(--ambar)]"
          }`}
        >
          {e.webhook.recebendo
            ? `🟢 Recebendo eventos — último em ${new Date(e.webhook.ultimoEm!).toLocaleString("pt-BR")}`
            : "🟡 Ainda não recebeu nenhum evento"}
        </p>

        {!e.webhook.publico && e.webhook.aviso && (
          <p className="mb-3 rounded-[10px] bg-[var(--ambar-fraco)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ambar)]">
            ⚠️ {e.webhook.aviso}
          </p>
        )}

        {tipo === "evolution" && (
          <button
            type="button"
            onClick={() => acao("registrar-webhook")}
            disabled={testando || !e.pronta}
            className="btn-secundario"
            title={e.pronta ? "Registra o webhook direto na Evolution" : "Teste a conexão primeiro"}
          >
            Configurar webhook automaticamente
          </button>
        )}
      </section>
    </div>
  );
}
