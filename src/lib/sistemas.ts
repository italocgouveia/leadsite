import { aberturaSaudacao } from "@/lib/saudacao";
import type { Lead } from "@/lib/db/schema";
import { categoriaSingular, categoriaPlural, ondeFica } from "@/lib/categoria-nome";

/**
 * Terceiro produto: sistema de gestão sob medida.
 *
 * Site e chatbot resolvem o que o cliente do lead vê. Sistema resolve o que
 * DÓI DENTRO da empresa: agenda em caderno, ordem de serviço em papel, estoque
 * na cabeça do dono, comissão calculada na calculadora no fim do mês.
 *
 * Fica em módulo próprio, fora de `produto.ts`, de propósito: o motor de
 * site x chatbot já está em produção e testado. Sistema é uma dimensão
 * DIFERENTE — um mesmo lead pode precisar de site e de sistema ao mesmo tempo,
 * e forçar os três no mesmo enum quebraria o que funciona.
 *
 * REGRA QUE MANDA AQUI: o encaixe vem do RAMO, que é dado verificável. Nada
 * de supor "essa empresa deve usar planilha" — isso é chute sobre a rotina de
 * alguém, e o dono percebe na primeira frase. O que o sistema afirma é apenas
 * "negócios desse ramo costumam ter esse problema", que é honesto e checável.
 */

export type Modulo =
  | "agendamento"
  | "ordem-servico"
  | "clientes"
  | "historico"
  | "estoque"
  | "financeiro"
  | "comissao"
  | "equipe"
  | "orcamento"
  | "pedidos"
  | "cardapio"
  | "reservas"
  | "fidelidade"
  /**
   * Módulos que nomeiam o OBJETO do negócio, não uma função genérica.
   *
   * "Clientes" serve para qualquer ramo e por isso não diz nada. Quem tem pet
   * shop reconhece "ficha do pet"; quem tem lava-jato pensa em placa, não em
   * "cliente"; imobiliária trabalha imóvel e visita. Falar o objeto certo é a
   * diferença entre a mensagem parecer feita para aquele negócio ou parecer
   * modelo — e essa diferença é o que faz responderem.
   */
  | "pets"
  | "veiculos"
  | "imoveis"
  | "visitas"
  | "quartos"
  | "hospedes"
  /** Chamar de volta quem sumiu: o dinheiro que já está na base e ninguém busca. */
  | "retorno";

export type EncaixeSistema = {
  /** Este ramo tem operação que um sistema organiza? */
  serve: boolean;
  /** Nome do sistema na linguagem do dono. */
  sistema: string;
  /** O que ele faria, em módulos. */
  modulos: Modulo[];
  /** A tarefa manual concreta que ele elimina. */
  dor: string;
  /** Quanto o encaixe é forte: quanto mais sinal operacional, maior. */
  nivel: "alto" | "medio" | "baixo";
  /** Sinais verificáveis que sustentam o encaixe. */
  sinais: string[];
};

type Perfil = { sistema: string; modulos: Modulo[]; dor: string };

/**
 * Ramos com operação que um sistema organiza, e o que o sistema faz em cada um.
 * Chave = tag do OSM; o casamento é por palavra inteira (ver `contemPalavra`).
 */
const PERFIS: Record<string, Perfil> = {
  // --- automotivo: ordem de serviço é o coração ---
  car_repair: {
    sistema: "Sistema de ordem de serviço para oficina",
    modulos: ["ordem-servico", "clientes", "historico", "orcamento", "estoque", "financeiro"],
    dor: "montar orçamento no papel e depois não achar o histórico do carro quando o cliente volta",
  },
  car_wash: {
    sistema: "Sistema de clientes, veículos e retorno para lava-jato",
    modulos: ["clientes", "veiculos", "historico", "retorno", "agendamento", "financeiro"],
    dor: "não saber quem lavou o carro há um mês e nunca chamar de volta — o cliente some e ninguém percebe",
  },
  tyres: {
    sistema: "Sistema de ordem de serviço e estoque",
    modulos: ["ordem-servico", "estoque", "clientes", "financeiro"],
    dor: "conferir estoque de pneu por telefone e anotar serviço em papel",
  },

  /**
   * Assistência técnica: mesmo coração da oficina — ordem de serviço.
   *
   * A diferença é o que entra na OS (aparelho em vez de carro) e o fato de o
   * cliente ligar o tempo todo perguntando "já ficou pronto?". Essa ligação
   * repetida é a dor que mais aparece no ramo, e é ela que a mensagem cita.
   */
  electronics_repair: {
    sistema: "Sistema de ordem de serviço para assistência técnica",
    modulos: ["ordem-servico", "clientes", "historico", "orcamento", "estoque", "financeiro"],
    dor: "anotar o aparelho num caderno e atender o cliente ligando toda hora para saber se já ficou pronto",
  },
  phone_repair: {
    sistema: "Sistema de ordem de serviço para assistência de celular",
    modulos: ["ordem-servico", "clientes", "historico", "orcamento", "estoque", "financeiro"],
    dor: "anotar o aparelho num caderno e atender o cliente ligando toda hora para saber se já ficou pronto",
  },
  computer_repair: {
    sistema: "Sistema de ordem de serviço para assistência de informática",
    modulos: ["ordem-servico", "clientes", "historico", "orcamento", "estoque", "financeiro"],
    dor: "anotar o equipamento num caderno e não conseguir dizer em que etapa cada serviço está",
  },

  // --- saúde: agenda e histórico ---
  clinic: {
    sistema: "Sistema de agenda e prontuário",
    modulos: ["agendamento", "clientes", "historico", "financeiro"],
    dor: "confirmar consulta uma por uma no WhatsApp e procurar ficha antiga na pasta",
  },
  dentist: {
    sistema: "Sistema de agenda e retorno de pacientes",
    modulos: ["agendamento", "clientes", "retorno", "historico", "financeiro"],
    dor: "o paciente que fez limpeza há seis meses e devia voltar — ninguém avisa, e ele só reaparece com dor",
  },
  doctors: {
    sistema: "Sistema de agenda para consultório",
    modulos: ["agendamento", "clientes", "historico", "financeiro"],
    dor: "a secretária repetir horário e valor o dia todo e ainda controlar a agenda no papel",
  },
  veterinary: {
    sistema: "Sistema de agenda e histórico do animal",
    modulos: ["agendamento", "clientes", "historico", "financeiro"],
    dor: "procurar a carteira de vacina do animal e lembrar quem está com dose atrasada",
  },
  physiotherapist: {
    sistema: "Sistema de sessões e evolução",
    modulos: ["agendamento", "clientes", "historico", "financeiro"],
    dor: "controlar quantas sessões cada paciente já fez e quantas faltam do pacote",
  },
  pet: {
    sistema: "Sistema de agenda e ficha do pet",
    modulos: ["agendamento", "clientes", "pets", "historico", "retorno", "financeiro"],
    dor: "encaixar banho e tosa por WhatsApp e não achar a ficha do animal — raça, a tosa que o dono pediu, quando foi a última vez",
  },

  // --- beleza: agenda + comissão ---
  hairdresser: {
    sistema: "Sistema de agendamento para salão",
    modulos: ["agendamento", "clientes", "historico", "comissao", "financeiro"],
    dor: "parar no meio do atendimento para marcar horário e fechar a comissão de cada profissional na mão",
  },
  barber: {
    sistema: "Sistema de agendamento para barbearia",
    modulos: ["agendamento", "clientes", "historico", "comissao", "financeiro"],
    dor: "controlar a fila do dia no caderno e calcular a porcentagem de cada barbeiro no fim da semana",
  },
  beauty: {
    sistema: "Sistema de agenda e pacotes",
    modulos: ["agendamento", "clientes", "historico", "financeiro", "comissao"],
    dor: "controlar quantas sessões do pacote cada cliente já usou",
  },

  // --- serviços e comércio ---
  estate_agent: {
    sistema: "CRM de leads, imóveis e visitas",
    modulos: ["clientes", "imoveis", "visitas", "retorno", "historico"],
    dor: "lembrar qual cliente viu qual imóvel e quem ficou de dar retorno — o lead esfria enquanto a anotação some no meio das conversas",
  },
  pharmacy: {
    sistema: "Sistema de estoque e vendas",
    modulos: ["estoque", "clientes", "financeiro"],
    dor: "conferir validade e ruptura de estoque na prateleira",
  },
  optician: {
    sistema: "Sistema de pedidos e entrega de lentes",
    modulos: ["ordem-servico", "clientes", "estoque", "financeiro"],
    dor: "acompanhar em que etapa está o óculos de cada cliente no laboratório",
  },
  fitness_centre: {
    sistema: "Sistema de matrículas e mensalidades",
    modulos: ["clientes", "financeiro", "agendamento", "equipe"],
    dor: "controlar quem está com mensalidade atrasada numa planilha",
  },

  // --- alimentação: o pedido é a operação ---
  restaurant: {
    sistema: "Sistema de pedidos e cardápio digital",
    modulos: ["pedidos", "cardapio", "clientes", "financeiro", "fidelidade"],
    dor: "anotar pedido no papel e repetir o cardápio no WhatsApp o dia inteiro",
  },
  fast_food: {
    sistema: "Sistema de pedidos e cardápio digital",
    modulos: ["pedidos", "cardapio", "financeiro"],
    dor: "anotar pedido de delivery no caderno e conferir o caixa no fim do dia na mão",
  },
  pizzaria: {
    sistema: "Sistema de pedidos para delivery",
    modulos: ["pedidos", "cardapio", "clientes", "financeiro"],
    dor: "anotar endereço de entrega no papel e perder o histórico do cliente que repete",
  },
  bakery: {
    sistema: "Sistema de encomendas e balcão",
    modulos: ["pedidos", "clientes", "financeiro", "estoque"],
    dor: "controlar encomenda de bolo em caderno e esquecer quem já pagou sinal",
  },

  // --- hospedagem: a reserva é a operação ---
  guest_house: {
    sistema: "Sistema de reservas, quartos e hóspedes",
    modulos: ["reservas", "quartos", "hospedes", "historico", "financeiro"],
    dor: "controlar quais quartos estão livres numa planilha e confirmar reserva uma a uma no WhatsApp",
  },
  hotel: {
    sistema: "Sistema de reservas e hospedagem",
    modulos: ["reservas", "clientes", "financeiro", "historico", "equipe"],
    dor: "cruzar disponibilidade de quarto entre planilha e site de reserva na mão",
  },
  chalet: {
    sistema: "Sistema de reservas para chalés",
    modulos: ["reservas", "clientes", "financeiro"],
    dor: "confirmar disponibilidade e sinal de reserva um por um pelo WhatsApp",
  },
};

/** Sinônimos em português caem no mesmo perfil da tag do OSM. */
const APELIDOS: Record<string, string> = {
  oficina: "car_repair",
  mecanica: "car_repair",
  "auto center": "car_repair",
  "centro automotivo": "car_repair",
  "auto eletrica": "car_repair",
  funilaria: "car_repair",
  "lava-jato": "car_wash",
  lavajato: "car_wash",
  "estetica automotiva": "car_wash",
  borracharia: "tyres",
  pneu: "tyres",
  clinica: "clinic",
  odontologia: "dentist",
  dentista: "dentist",
  medico: "doctors",
  consultorio: "doctors",
  psicologia: "clinic",
  veterinaria: "veterinary",
  fisioterapia: "physiotherapist",
  pilates: "physiotherapist",
  petshop: "pet",
  "pet shop": "pet",
  salao: "hairdresser",
  cabeleireiro: "hairdresser",
  barbearia: "barber",
  barbearia_: "barber",
  estetica: "beauty",
  sobrancelha: "beauty",
  manicure: "beauty",
  imobiliaria: "estate_agent",
  farmacia: "pharmacy",
  otica: "optician",
  academia: "fitness_centre",
};

function semAcento(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Casamento por PALAVRA INTEIRA, não por inclusão.
 *
 * A versão com `includes` fez "Espetinho Avenida" — um restaurante — casar com
 * o apelido `pet` (es-PET-inho) e receber "Sistema de banho e tosa". Substring
 * solta em nome próprio produz esse tipo de erro constrangedor na frente do
 * cliente.
 */
function contemPalavra(texto: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(texto);
}

function perfilDe(lead: Lead): Perfil | null {
  /**
   * A CATEGORIA decide; o nome entra só como reforço para as tags do OSM,
   * que são inglês técnico. Buscar no nome inteiro é o que abre espaço para
   * falso positivo.
   */
  const categoria = semAcento(lead.categoria ?? "");
  const nome = semAcento(lead.nome);

  for (const [k, v] of Object.entries(PERFIS)) {
    if (contemPalavra(categoria, k)) return v;
  }
  for (const [apelido, tag] of Object.entries(APELIDOS)) {
    const termo = semAcento(apelido);
    if (contemPalavra(categoria, termo) || contemPalavra(nome, termo)) return PERFIS[tag];
  }
  return null;
}

export function avaliarSistema(lead: Lead): EncaixeSistema {
  const perfil = perfilDe(lead);

  if (!perfil) {
    return {
      serve: false,
      sistema: "",
      modulos: [],
      dor: "",
      nivel: "baixo",
      sinais: [],
    };
  }

  /**
   * Sinais VERIFICÁVEIS de que a operação tem volume para justificar sistema.
   * Nenhum deles supõe rotina: são coisas publicadas pelo próprio negócio.
   */
  const sinais: string[] = [];
  if (lead.whatsapp) sinais.push("Atende por WhatsApp — o pedido chega por lá");
  if (lead.horarios) sinais.push("Horário fixo publicado — opera com agenda");
  if ((lead.avaliacoes ?? 0) >= 25) {
    sinais.push(`${lead.avaliacoes} avaliações no Google — passa volume de cliente`);
  }
  if (lead.instagram) sinais.push("Instagram ativo — mais um canal de pedido");
  if (lead.endereco) sinais.push("Ponto físico confirmado");

  // Sem WhatsApp não há como abordar nem como o sistema receber pedido.
  const nivel: EncaixeSistema["nivel"] = !lead.whatsapp
    ? "baixo"
    : sinais.length >= 3
      ? "alto"
      : "medio";

  return { serve: true, ...perfil, nivel, sinais };
}

/** Frase curta pra tela: "Agendamento · Clientes · Financeiro". */
export const ROTULO_MODULO: Record<Modulo, string> = {
  agendamento: "Agendamento",
  "ordem-servico": "Ordem de serviço",
  clientes: "Clientes",
  historico: "Histórico",
  estoque: "Estoque",
  financeiro: "Financeiro",
  comissao: "Comissão",
  equipe: "Equipe",
  orcamento: "Orçamento",
  pedidos: "Pedidos",
  cardapio: "Cardápio digital",
  reservas: "Reservas",
  fidelidade: "Fidelização",
  pets: "Ficha do pet",
  veiculos: "Veículos",
  imoveis: "Imóveis",
  visitas: "Visitas",
  quartos: "Quartos",
  hospedes: "Hóspedes",
  retorno: "Retorno de clientes",
};

export function modulosLegiveis(modulos: Modulo[]): string {
  return modulos.map((m) => ROTULO_MODULO[m]).join(" · ");
}

/**
 * Mesma lista, mas para dentro de uma frase: vírgulas e "e" no fim.
 * O separador "·" é de tela — numa mensagem de WhatsApp ele parece erro.
 */
export function modulosNaFrase(modulos: Modulo[]): string {
  const nomes = modulos.map((m) => ROTULO_MODULO[m].toLowerCase());
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Abordagem para sistema.
 *
 * Diferente da de site e chatbot: aqui o gancho não é o que o cliente do lead
 * vê, é a tarefa administrativa que o DONO faz e odeia. Por isso a frase do
 * meio é a `dor` do ramo, e a pergunta final é sobre a rotina dele.
 */
export function montarPropostaSistema(lead: Lead): string | null {
  const encaixe = avaliarSistema(lead);
  if (!encaixe.serve) return null;

  const nome = lead.nome.replace(/\s*[-–|].*$/, "").trim();
  const ramo = categoriaSingular(lead.categoria);

  /**
   * A abertura traz o marcador de saudação; ele só vira "Bom dia"/"Boa tarde"
   * na hora do envio, porque a fila leva dias para escoar. Ver lib/saudacao.ts.
   */
  const abertura = aberturaSaudacao(lead);

  return [
    abertura,
    ``,
    `Conheci a ${nome} procurando ${categoriaPlural(lead.categoria)} ${ondeFica(lead.cidade)}.`,
    ``,
    `Sou desenvolvedor e faço sistema sob medida para ${ramo}. A parte que costuma pesar nesse ramo é ${encaixe.dor}.`,
    ``,
    `Nada de software pronto e caro: monto só os módulos que vocês usam — ${modulosNaFrase(encaixe.modulos)}.`,
    ``,
    `Hoje vocês controlam isso em caderno, planilha ou algum sistema?`,
  ].join("\n");
}
