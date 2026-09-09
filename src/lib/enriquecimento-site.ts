import type { Lead } from "@/lib/db/schema";
import { analisarSite, type AnaliseSite } from "@/lib/analise-site";
import { validarTelefone, dddCompativel } from "@/lib/telefone";
import { instagramDoLead } from "@/lib/canais";
import { classificarPorte } from "@/lib/porte";

/**
 * O QUE A ANÁLISE DO SITE PODE, DE FATO, GRAVAR NO CADASTRO.
 *
 * A análise em si é leitura: ela devolve o que a página publica. Esta camada
 * decide o que disso pertence À EMPRESA — e é aqui que mora a diferença entre
 * enriquecer e contaminar.
 *
 * OS TRÊS ENGANOS QUE APARECERAM NO PRIMEIRO TESTE REAL
 *
 * 1. CONTA DA REDE. O lead "Ibis Hotel" tinha `all.accor.com` como site, e a
 *    home devolveu `@all.accor` — o Instagram global da rede, não da unidade
 *    de Uberlândia. Gravar isso daria ao vendedor um perfil corporativo com
 *    milhões de seguidores no lugar do hotel da esquina.
 *
 * 2. DDD DE OUTRA PRAÇA. "Clínica Alira" devolveu um WhatsApp com DDD 11 num
 *    cadastro de Minas. Pode ser central de atendimento, pode ser o site de
 *    outra unidade — em nenhum dos casos é o número daquele endereço.
 *
 * 3. MARCA NACIONAL. Um restaurante local cujo site é da franqueadora
 *    devolve o `@` da marca. Mesmo problema do item 1, com outra roupa.
 *
 * A regra que atravessa os três: um dado só entra quando há razão para crer
 * que é DAQUELA empresa. Na dúvida, ele vira sugestão para revisão humana, e
 * não gravação automática.
 */

export type Achado = {
  campo: "telefone" | "whatsapp" | "instagram" | "email";
  valor: string;
  /** Pode gravar sozinho? */
  aceito: boolean;
  /** Por que sim ou por que não — a tela precisa poder explicar. */
  motivo: string;
};

export type ResultadoEnriquecimento = {
  leadId: string;
  nome: string;
  url: string;
  analisou: boolean;
  motivoFalha?: string;
  achados: Achado[];
  /** O que seria gravado. Vazio numa simulação que não aprovou nada. */
  gravaria: Partial<Record<"telefone" | "whatsapp" | "instagram" | "email", string>>;
};

/**
 * O host do site pertence à empresa, ou é de uma rede/portal?
 *
 * Não dá para saber com certeza, mas dá para reconhecer o caso comum: quando o
 * cadastro já foi classificado como rede, ou quando o domínio não guarda
 * nenhuma relação com o nome do negócio, o que a página publica tem grande
 * chance de ser da marca e não da unidade.
 */
function siteParecerDaEmpresa(lead: Lead, host: string): { sim: boolean; motivo: string } {
  const classe = classificarPorte(lead);
  if (classe.rede) {
    return { sim: false, motivo: `Cadastro é rede/franquia (${classe.motivosRede[0]}) — a home é da marca` };
  }

  const limpo = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  /**
   * A comparação é por PALAVRA, e as genéricas não contam.
   *
   * A primeira versão comparava blocos do nome inteiro colado e reprovou
   * `clinicaclima.com.br` para "CLIMA Clínica de Imagem" — o domínio é da
   * empresa, mas "climaclinicadeimagem" não contém "clinicaclima" em pedaço
   * nenhum. Errar para o lado de não gravar é o lado certo, e ainda assim é
   * erro.
   *
   * Palavra a palavra resolve. Mas "clínica", "auto" e "centro" aparecem em
   * milhares de domínios: aceitar por elas casaria qualquer clínica com o site
   * de qualquer outra. Só palavra distintiva conta.
   */
  const GENERICAS = new Set([
    "clinica", "centro", "auto", "casa", "loja", "grupo", "servicos", "comercio",
    "empresa", "sistema", "digital", "online", "brasil", "hotel", "restaurante",
    "bar", "pet", "shop", "salao", "studio", "espaco", "medical", "med", "odonto",
    "academia", "escola", "curso", "imoveis", "imobiliaria", "solucoes",
  ]);

  const palavras = lead.nome
    .split(/\s+/)
    .map(limpo)
    .filter((p: string) => p.length >= 4 && !GENERICAS.has(p));

  const dominioColado = limpo(host.split(".")[0]);
  const nomeColado = limpo(lead.nome);

  if (!dominioColado || !nomeColado) {
    return { sim: true, motivo: "Sem como comparar — seguindo com cautela" };
  }

  const bate =
    dominioColado.includes(nomeColado.slice(0, 8)) ||
    nomeColado.includes(dominioColado.slice(0, 8)) ||
    palavras.some((p: string) => dominioColado.includes(p));

  return bate
    ? { sim: true, motivo: "Domínio combina com o nome do negócio" }
    : {
        sim: false,
        motivo: `Domínio "${host}" não lembra "${lead.nome}" — pode ser portal ou rede`,
      };
}

export async function enriquecerPeloSite(
  lead: Lead,
  /**
   * `true` (padrão) apenas relata o que faria. Gravar exige decisão explícita
   * de quem chama — e nenhuma função desta biblioteca escreve no banco: ela
   * devolve o que gravar, e quem grava é o script, sob supervisão.
   */
  simular = true,
): Promise<ResultadoEnriquecimento> {
  const base: ResultadoEnriquecimento = {
    leadId: lead.id,
    nome: lead.nome,
    url: lead.website ?? "",
    analisou: false,
    achados: [],
    gravaria: {},
  };

  if (!lead.website) return { ...base, motivoFalha: "Lead sem site cadastrado" };

  const a: AnaliseSite = await analisarSite(lead.website);
  if (!a.ok) return { ...base, motivoFalha: a.motivo };

  const pertence = siteParecerDaEmpresa(lead, a.host);
  const achados: Achado[] = [];

  /* ─────────────────── WhatsApp ─────────────────── */
  if (a.whatsapp) {
    const v = validarTelefone(a.whatsapp);
    if (!v) {
      achados.push({ campo: "whatsapp", valor: a.whatsapp, aceito: false, motivo: "Número inválido" });
    } else if (!pertence.sim) {
      achados.push({ campo: "whatsapp", valor: v.formatado, aceito: false, motivo: pertence.motivo });
    } else if (lead.estado && !dddCompativel(v.e164, lead.estado)) {
      achados.push({
        campo: "whatsapp",
        valor: v.formatado,
        aceito: false,
        motivo: `DDD não bate com ${lead.estado} — pode ser central de atendimento ou outra unidade`,
      });
    } else if (lead.telefone) {
      /**
       * NUNCA sobrescrever contato existente. Vale a mesma regra do upsert da
       * coleta: fonte nova com valor pode acrescentar, nunca substituir o que
       * já custou trabalho para entrar.
       */
      achados.push({
        campo: "whatsapp",
        valor: v.formatado,
        aceito: false,
        motivo: "Lead já tem telefone — número novo fica para revisão manual",
      });
    } else {
      achados.push({ campo: "whatsapp", valor: v.formatado, aceito: true, motivo: pertence.motivo });
    }
  }

  /* ─────────────────── telefone comum ─────────────────── */
  if (!a.whatsapp && a.telefones.length && !lead.telefone) {
    const celular = a.telefones.map((t) => validarTelefone(t)).find((v) => v?.tipo === "celular");
    const escolhido = celular ?? validarTelefone(a.telefones[0]);
    if (escolhido) {
      const okDdd = !lead.estado || dddCompativel(escolhido.e164, lead.estado);
      achados.push({
        campo: "telefone",
        valor: escolhido.formatado,
        aceito: pertence.sim && okDdd,
        motivo: !pertence.sim
          ? pertence.motivo
          : !okDdd
            ? `DDD não bate com ${lead.estado}`
            : `Telefone publicado no próprio site (${escolhido.tipo})`,
      });
    }
  }

  /* ─────────────────── Instagram ─────────────────── */
  if (a.instagram) {
    const jaTem = instagramDoLead(lead);
    if (jaTem) {
      achados.push({
        campo: "instagram",
        valor: a.instagram,
        aceito: false,
        motivo: `Lead já tem @${jaTem.username}`,
      });
    } else if (!pertence.sim) {
      achados.push({ campo: "instagram", valor: a.instagram, aceito: false, motivo: pertence.motivo });
    } else {
      achados.push({ campo: "instagram", valor: a.instagram, aceito: true, motivo: pertence.motivo });
    }
  }

  /* ─────────────────── e-mail ─────────────────── */
  if (a.email && !lead.email) {
    achados.push({
      campo: "email",
      valor: a.email,
      aceito: pertence.sim,
      motivo: pertence.sim ? "E-mail publicado no próprio site" : pertence.motivo,
    });
  }

  const gravaria: ResultadoEnriquecimento["gravaria"] = {};
  for (const x of achados) if (x.aceito) gravaria[x.campo] = x.valor;

  return {
    ...base,
    url: a.url,
    analisou: true,
    achados,
    gravaria: simular ? gravaria : gravaria,
  };
}
