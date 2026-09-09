import type { Lead } from "@/lib/db/schema";
import { avaliarSistema } from "@/lib/sistemas";
import { probabilidadeComercial } from "@/lib/probabilidade";
import { canalDoLead, instagramDoLead, temSiteProprio } from "@/lib/canais";
import { categoriaSingular } from "@/lib/categoria-nome";
import { PRACA, alcanceDoLead } from "@/lib/territorio";
import { MATERIAIS, preencher, type Material, type CanalMaterial } from "@/lib/materiais";

/**
 * ✨ PREPARAR ABORDAGEM — as quatro partes, montadas com dado real.
 *
 * POR QUE SEM IA
 *
 * A IA escreveria um texto melhor. Também inventaria — "vi que vocês
 * cresceram muito", "notei que vocês têm cinco funcionários" — e a regra da
 * operação é que abordagem não afirma o que não foi verificado. Montando a
 * partir dos campos, cada frase tem lastro num dado que existe no cadastro, e
 * o que falta simplesmente não é dito.
 *
 * ESTA NÃO É A MENSAGEM DO DISPARO. O envio automático continua usando a
 * mensagem universal aprovada. O que sai daqui é para você ler, ajustar e
 * mandar com a própria mão — por isso vem em quatro blocos separados, e não
 * como um texto pronto para colar sem olhar.
 */

export type Abordagem = {
  /** Como começar sem parecer robô nem fingir intimidade. */
  abertura: string;
  /** A pergunta que faz o outro falar. É a parte que mais importa. */
  pergunta: string;
  /** O que você resolve, na linguagem do negócio dele. */
  valor: string;
  /** O passo concreto que você pede. */
  cta: string;
  /** O material da biblioteca que serviu de base, quando houver. */
  materialId: string | null;
  /** Canal para o qual esta abordagem foi montada. */
  canal: CanalMaterial;
  /**
   * O que NÃO foi dito por falta de dado — e é isso que impede a tela de
   * parecer que a abordagem está completa quando não está.
   */
  faltando: string[];
};

/** Escolhe o material que melhor se encaixa no que sabemos deste lead. */
function escolherMaterial(lead: Lead): Material | null {
  const canal = canalDoLead(lead);
  const encaixe = avaliarSistema(lead);
  const dor = probabilidadeComercial(lead).dor;

  const candidatos = MATERIAIS.filter((m) => m.categoria === "primeiro-contato");

  /**
   * A ordem é do mais ancorado em evidência para o menos. Abordagem por dor só
   * entra quando existe dor provável COM sinais — afirmar o problema de quem
   * você nunca conversou é o jeito mais rápido de encerrar a conversa.
   */
  if (canal === "instagram" || canal === "ambos") {
    const ig = candidatos.find((m) => m.id === "pc-instagram-forte");
    if (ig && instagramDoLead(lead)) return ig;
  }
  if (dor.tipo === "provavel" && dor.sinais.length >= 2) {
    return candidatos.find((m) => m.id === "pc-dor") ?? null;
  }
  if (lead.whatsapp && encaixe.serve) {
    return candidatos.find((m) => m.id === "pc-atende-whatsapp") ?? null;
  }
  if (!temSiteProprio(lead) && lead.statusSite !== "nao-verificado") {
    return candidatos.find((m) => m.id === "pc-sem-site") ?? null;
  }
  if (encaixe.serve && encaixe.modulos.length >= 4) {
    return candidatos.find((m) => m.id === "pc-consultivo") ?? null;
  }
  return candidatos.find((m) => m.id === "pc-direto") ?? null;
}

/**
 * O PROCESSO que este ramo tem e que o sistema organiza, em uma palavra que o
 * dono usa. Sai dos módulos do encaixe — nunca inventado.
 */
function processoDe(lead: Lead): string | null {
  const e = avaliarSistema(lead);
  if (!e.serve || !e.modulos.length) return null;
  const nomes: Record<string, string> = {
    "ordem-servico": "as ordens de serviço",
    agendamento: "a agenda",
    clientes: "o cadastro de clientes",
    historico: "o histórico dos clientes",
    estoque: "o estoque",
    pedidos: "os pedidos",
    orcamento: "os orçamentos",
    financeiro: "o caixa",
    comissao: "as comissões",
    cardapio: "o cardápio",
    catalogo: "o catálogo",
  };
  for (const m of e.modulos) if (nomes[m]) return nomes[m];
  return null;
}

export function montarAbordagem(lead: Lead, materialForcado?: string): Abordagem {
  const material =
    (materialForcado ? MATERIAIS.find((m) => m.id === materialForcado) : null) ??
    escolherMaterial(lead);

  const encaixe = avaliarSistema(lead);
  const dor = probabilidadeComercial(lead).dor;
  const ig = instagramDoLead(lead);

  const valores = {
    nome_empresa: lead.nome,
    /**
     * A cidade dita é a NOSSA praça quando o lead é daqui, não a cidade do
     * cadastro: "aqui em Uberlândia" só faz sentido se ele também estiver.
     */
    cidade: alcanceDoLead(lead) === "local" ? PRACA.cidade : (lead.cidade ?? undefined),
    categoria: categoriaSingular(lead.categoria) || undefined,
    telefone: lead.telefone ?? undefined,
    instagram: ig?.username ?? undefined,
    site: temSiteProprio(lead) ? (lead.website ?? undefined) : undefined,
    sistema: encaixe.serve ? encaixe.sistema : undefined,
    dor: dor.tipo !== "nenhuma" ? dor.texto : undefined,
    processo: processoDe(lead) ?? undefined,
  };

  const faltando: string[] = [];
  if (!valores.cidade) faltando.push("cidade");
  if (!valores.categoria) faltando.push("ramo");
  if (!valores.sistema) faltando.push("sistema aplicável");
  if (!valores.processo) faltando.push("processo do negócio");
  if (dor.tipo === "nenhuma") faltando.push("dor provável (faltam sinais)");

  const corpo = material ? preencher(material.corpo, valores) : null;
  const partes = (corpo ?? "").split("\n").filter((l) => l.trim());

  /**
   * A quebra em quatro blocos é o ponto do §17: você vê a abertura, a
   * pergunta, o valor e o pedido separados, e edita o que quiser antes de
   * mandar. Um texto único convida a colar sem ler.
   */
  const abertura = partes[0] ?? "";
  const meio = partes.slice(1, -1).join("\n");
  const cta = material ? (preencher(material.cta, valores) ?? material.cta) : "";

  return {
    abertura,
    pergunta: cta,
    valor: meio || (encaixe.serve ? encaixe.sistema : ""),
    cta,
    materialId: material?.id ?? null,
    canal: material?.canal ?? "multicanal",
    faltando,
  };
}

/**
 * O texto inteiro, para copiar. `null` quando não há dado suficiente para
 * montar nada — e nesse caso a tela precisa dizer isso em vez de oferecer um
 * botão que copia uma mensagem quebrada.
 */
export function textoDaAbordagem(a: Abordagem): string | null {
  const linhas = [a.abertura, a.valor].filter((x) => x && x.trim());
  if (!linhas.length) return null;
  return linhas.join("\n\n").trim();
}
