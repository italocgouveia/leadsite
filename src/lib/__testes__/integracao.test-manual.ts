import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { validarBaseUrl, validarWebhook, urlDoWebhook } from "@/lib/integracao";
import { provedorDe, normalizarNumero, mascarar, limparSegredo, juntarUrl } from "@/lib/providers";
import { cifrar, decifrar, temCriptografia } from "@/lib/segredo";

let falhas = 0;
const ok = (t: string, c: boolean, d = "") => {
  console.log(c ? `  ok   ${t}` : `  FALHA ${t}${d ? ` -> ${d}` : ""}`);
  if (!c) falhas++;
};

const cfgEvo = { tipo: "evolution" as const, baseUrl: "http://localhost:8080", instancia: "principal", apiKey: "seg-red-o-123" };
const cfgWaha = { tipo: "waha" as const, baseUrl: "http://localhost:3000", instancia: "default", apiKey: "chave-waha" };

console.log("\n[URL do webhook rejeitada como API]");
const w = validarBaseUrl("https://leads-eosin.vercel.app/api/automacao/status");
ok("webhook no campo da API e recusado", !w.ok);
if (!w.ok) console.log(`     -> ${w.erro}`);
ok("mensagem diz onde o webhook vai", (w.comoCorrigir ?? []).some(s => /painel do provedor/i.test(s)));
ok("qualquer /webhook e recusado", !validarBaseUrl("https://x.com/webhook").ok);
ok("nossa rota /api/campanhas e recusada", !validarBaseUrl("https://x.com/api/campanhas").ok);

console.log("\n[localhost]");
const l = validarBaseUrl("http://localhost:8080");
ok("localhost aceito como API (com aviso)", l.ok && !!l.aviso);
ok("localhost REJEITADO como webhook publico", !validarWebhook("http://localhost:3000").ok);
ok("dominio publico aceito como webhook", validarWebhook("https://leads-eosin.vercel.app").ok);
ok("webhook montado corretamente",
   urlDoWebhook("https://x.com/") === "https://x.com/api/automacao/status",
   urlDoWebhook("https://x.com/"));

console.log("\n[URL base valida]");
ok("base simples aceita", validarBaseUrl("https://whatsapp.meudominio.com").ok);
const comPath = validarBaseUrl("https://x.com/message/sendText/inst");
ok("base com caminho passa mas avisa", comPath.ok && !!comPath.aviso);
ok("sem protocolo recusado", !validarBaseUrl("localhost:8080").ok);

console.log("\n[endpoints por provedor]");
ok("Evolution monta /message/sendText/{instancia}",
   provedorDe("evolution").urlDeEnvio(cfgEvo) === "http://localhost:8080/message/sendText/principal",
   provedorDe("evolution").urlDeEnvio(cfgEvo));
ok("WAHA monta /api/sendText",
   provedorDe("waha").urlDeEnvio(cfgWaha) === "http://localhost:3000/api/sendText",
   provedorDe("waha").urlDeEnvio(cfgWaha));
ok("juntarUrl nao duplica barra", juntarUrl("http://x.com/", "/a") === "http://x.com/a");
ok("provedor desconhecido cai em Evolution", provedorDe("zzz").nome === "Evolution API");

console.log("\n[normalizacao de numero]");
ok("tira espacos e simbolos", normalizarNumero("+55 (34) 99988-7766") === "5534999887766");
ok("nao inventa DDI", normalizarNumero("34999887766") === "34999887766");
ok("vazio continua vazio", normalizarNumero("abc") === "");

console.log("\n[token nunca vaza]");
ok("mascara guarda so o fim", mascarar("minha-chave-secreta-xyz") === "••••••••••••xyz", mascarar("minha-chave-secreta-xyz"));
ok("mascara de vazio e vazio", mascarar(null) === "");
const comErro = "Erro na url http://x.com?apikey=seg-red-o-123 recusada";
ok("segredo some do texto de erro", !limparSegredo(comErro, "seg-red-o-123").includes("seg-red-o-123"),
   limparSegredo(comErro, "seg-red-o-123"));

console.log("\n[criptografia]");
console.log(`     SEGREDO_CHAVE configurada: ${temCriptografia()}`);
const claro = "minha-api-key-secreta";
const cif = cifrar(claro);
if (temCriptografia()) {
  ok("cifra de verdade", cif !== claro && cif!.startsWith("enc:v1:"));
  ok("decifra de volta", decifrar(cif) === claro);
} else {
  ok("sem chave, grava em texto (e a tela avisa)", cif === claro);
}
ok("valor antigo em texto continua legivel", decifrar("texto-antigo") === "texto-antigo");
ok("null nao quebra", cifrar(null) === null && decifrar(null) === null);

console.log("\n[404: instancia inexistente x nao-e-Evolution]");
/**
 * Caso real desta máquina: a porta 8080 estava ocupada por um processo
 * Electron que respondia 200 na raiz e 404 (HTML) no resto. O teste de conexão
 * acusava "instância não encontrada" para um servidor que nunca foi Evolution,
 * e a investigação foi atrás da instância em vez da porta.
 */
async function testar404() {
  const original = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("<html><title>CEF remote debugging</title></html>", {
      status: 404,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;

  const r1 = await provedorDe("evolution").testarConexao(cfgEvo);
  ok(
    "HTML no 404 -> avisa que nao e a Evolution",
    !r1.ok && /n[ãa]o [ée] a Evolution/i.test(r1.erro),
    r1.ok ? "passou quando nao devia" : r1.erro,
  );
  ok(
    "e manda conferir a porta",
    !r1.ok && r1.comoResolver.some((x) => /porta/i.test(x)),
  );

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: 404, error: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  const r2 = await provedorDe("evolution").testarConexao(cfgEvo);
  ok(
    "JSON no 404 -> instancia inexistente",
    !r2.ok && /Inst[âa]ncia "principal" n[ãa]o encontrada/i.test(r2.erro),
    r2.ok ? "passou quando nao devia" : r2.erro,
  );

  globalThis.fetch = original;
}

console.log("\n[normalizacao de webhook — Evolution]");
const evoRecebida = provedorDe("evolution").normalizarWebhook({
  event: "messages.upsert",
  data: { key: { id: "MSG1", remoteJid: "5534999887766@s.whatsapp.net", fromMe: false },
          message: { conversation: "Quanto custa?" } },
});
ok("identifica resposta do lead", evoRecebida.tipo === "recebida", evoRecebida.tipo);
ok("extrai o texto", evoRecebida.texto === "Quanto custa?");
ok("extrai o numero", evoRecebida.numero === "5534999887766", String(evoRecebida.numero));
ok("extrai o id (idempotencia)", evoRecebida.provedorMsgId === "MSG1");

const evoEco = provedorDe("evolution").normalizarWebhook({
  event: "messages.upsert",
  data: { key: { id: "MSG2", remoteJid: "5534999887766@s.whatsapp.net", fromMe: true },
          message: { conversation: "oi, sou eu" } },
});
ok("ECO do proprio envio nao vira resposta", evoEco.tipo === "enviada" && evoEco.daNossaConta, evoEco.tipo);

console.log("\n[normalizacao de webhook — WAHA]");
const wahaRecebida = provedorDe("waha").normalizarWebhook({
  event: "message",
  payload: { id: "W1", from: "5534999887766@c.us", fromMe: false, body: "tenho interesse" },
});
ok("identifica resposta", wahaRecebida.tipo === "recebida", wahaRecebida.tipo);
ok("extrai texto e numero", wahaRecebida.texto === "tenho interesse" && wahaRecebida.numero === "5534999887766");

/**
 * O bloco do 404 é assíncrono e roda por último. Sem esta chamada a função
 * ficava definida e nunca executada — a suíte imprimia "todos passaram" sem
 * ter rodado os casos, que é pior do que não ter o teste.
 */
testar404().then(() => {
  console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} falha(s).\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
});
