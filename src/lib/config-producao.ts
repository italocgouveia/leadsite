import type { configuracoes } from "@/lib/db/schema";

/**
 * A configuração do provedor é de PRODUÇÃO ou sobrou de um teste?
 *
 * POR QUE ISTO EXISTE
 *
 * Um `test:campanha` interrompido no meio deixou `provedorBaseUrl` apontando
 * para `provedor-de-teste.example.com` com token `chave-de-teste`. A automação
 * estava desligada, então nada foi enviado — mas o próximo INICIAR teria
 * falhado, e a falha apareceria como "a Bridge não responde", que manda
 * consertar a coisa errada.
 *
 * Este arquivo é a rede de segurança: antes de ligar o worker ou de permitir
 * envio real, alguém pergunta se a configuração PARECE de produção. Não
 * substitui o pré-voo, que testa conectividade — responde outra pergunta,
 * anterior: *isto aqui é a configuração certa?*
 *
 * REGRA DE LEITURA: nada aqui lê ou registra o valor de um segredo. O token é
 * inspecionado por FORMATO (parece um marcador de teste?) e nunca é devolvido,
 * logado ou comparado por igualdade contra um valor conhecido.
 */

type Config = typeof configuracoes.$inferSelect;

/**
 * Marcadores que só aparecem em configuração de teste.
 *
 * `example.com` é reservado pela RFC 2606 justamente para isso — nenhum
 * provedor real mora lá. Os demais são os nomes que os testes deste repositório
 * usam; se um teste novo inventar outro, ele entra aqui.
 */
const MARCAS_DE_TESTE = [
  "example.com",
  "example.org",
  "provedor-de-teste",
  "provedor-teste",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
];

/** O token parece um marcador de teste? Checa forma, nunca o valor real. */
function tokenParecerDeTeste(token: string | null): boolean {
  if (!token) return false;
  return /(^|[^a-z])(teste|test|mock|fake|dummy|exemplo|sample|placeholder)([^a-z]|$)/i.test(token);
}

function contemMarca(url: string | null): string | null {
  if (!url) return null;
  const alvo = url.toLowerCase();
  return MARCAS_DE_TESTE.find((m) => alvo.includes(m)) ?? null;
}

export type Veredito =
  | { valida: true }
  | { valida: false; motivo: string; detalhe: string };

/**
 * A configuração serve para enviar mensagem de verdade?
 *
 * Devolve o motivo em português porque quem lê isto é a pessoa na tela às
 * 8 da manhã tentando entender por que o disparo não ligou — e "config
 * inválida" sem dizer qual campo faz perder meia hora.
 */
export function validarConfigDeProducao(cfg: Config | null | undefined): Veredito {
  if (!cfg) {
    return { valida: false, motivo: "Sem configuração", detalhe: "A tabela `configuracoes` está vazia." };
  }

  const url = cfg.provedorBaseUrl?.trim() || null;
  if (!url) {
    return {
      valida: false,
      motivo: "Provedor sem URL",
      detalhe: "`provedorBaseUrl` está vazio — o CRM não sabe para onde mandar.",
    };
  }

  const marca = contemMarca(url);
  if (marca) {
    return {
      valida: false,
      motivo: "Configuração de TESTE em produção",
      detalhe:
        `A URL do provedor contém "${marca}", que é endereço de teste. ` +
        "Restaure a configuração real antes de enviar (npx tsx src/scripts/restaurar-provedor.ts).",
    };
  }

  if (tokenParecerDeTeste(cfg.provedorToken)) {
    return {
      valida: false,
      motivo: "Token de TESTE em produção",
      detalhe:
        "O token do provedor parece um marcador de teste. " +
        "Restaure a configuração real antes de enviar.",
    };
  }

  if (!cfg.provedorTipo) {
    return {
      valida: false,
      motivo: "Provedor sem tipo",
      detalhe: "`provedorTipo` está vazio — não dá para saber qual protocolo usar.",
    };
  }

  /**
   * `custom` sem endpoint é a pegadinha silenciosa: a chamada vai para a raiz
   * da Bridge, que responde 404, e o erro vira "número não tem WhatsApp".
   */
  if (cfg.provedorTipo === "custom" && !cfg.provedorEndpointCustom?.trim()) {
    return {
      valida: false,
      motivo: "Provedor custom sem endpoint",
      detalhe: "`provedorEndpointCustom` está vazio (a Bridge deste projeto usa `/send`).",
    };
  }

  return { valida: true };
}

/**
 * Um retrato da configuração seguro para log e para tela.
 *
 * NUNCA inclui token, segredo de webhook ou qualquer valor sensível — só a
 * presença deles. É o que permite registrar "como estava a config antes da
 * operação" sem transformar o log num vazamento.
 */
export function retratoDaConfig(cfg: Config | null | undefined): Record<string, unknown> {
  if (!cfg) return { em: new Date().toISOString(), existe: false };
  return {
    em: new Date().toISOString(),
    provedorTipo: cfg.provedorTipo ?? null,
    /** Só o host: o caminho pode carregar instância ou token em querystring. */
    provedorHost: (() => {
      try {
        return cfg.provedorBaseUrl ? new URL(cfg.provedorBaseUrl).host : null;
      } catch {
        return "(url inválida)";
      }
    })(),
    provedorEndpoint: cfg.provedorEndpointCustom ?? null,
    provedorInstancia: cfg.provedorInstancia ?? null,
    /** Presença, não valor. */
    temToken: Boolean(cfg.provedorToken),
    testadoEm: cfg.provedorTestadoEm?.toISOString() ?? null,
    automacaoAtiva: cfg.automacaoAtiva,
    limiteDiario: cfg.limiteDiario,
  };
}
