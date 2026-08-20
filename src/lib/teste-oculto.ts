import type { Lead } from "@/lib/db/schema";
import { categoriaSingular } from "@/lib/categoria-nome";

/**
 * Abordagem "cliente oculto".
 *
 * Em vez de SUPOR que o atendimento deles é lento, você descobre: manda uma
 * pergunta de cliente, cronometra a resposta e usa o resultado real como
 * abertura. Deixa de ser opinião de vendedor e vira fato que o dono não
 * consegue contestar — ele viu a mensagem chegar.
 *
 * REGRA QUE MANDA NESTE ARQUIVO:
 * a mensagem de revelação só pode afirmar o que o teste MEDIU. Se ainda não
 * houve teste, não existe mensagem de revelação — nem com texto "provável".
 * Gerar "te mandei mensagem e vocês não responderam" sem isso ter acontecido
 * seria pôr uma mentira na boca do usuário, e a primeira resposta do dono
 * ("mandou quando? não recebi nada") acaba com a venda e com a reputação dele.
 *
 * É a mesma regra que vale no resto do sistema: ausência de dado não vira
 * afirmação.
 */

export type ResultadoTeste = "sem-resposta" | "demorou" | "rapida";

export type TesteOculto = {
  /** ISO. Quando você mandou a pergunta de cliente. */
  enviadoEm: string;
  resultado: ResultadoTeste | null;
  /** Minutos até responderem. Só faz sentido quando responderam. */
  minutos?: number;
  /** O que veio de resposta, nas suas palavras. Opcional. */
  observacao?: string;
};

/**
 * A pergunta que um cliente de verdade faria.
 *
 * Precisa ser uma dúvida legítima: você está mesmo perguntando, e a resposta
 * (ou a falta dela) é o dado. Nada de pegadinha ou de fingir compra que não
 * existe — o objetivo é medir tempo de resposta, não enganar ninguém.
 */
const PERGUNTAS: Record<string, string> = {
  car_wash: "Boa tarde! Vocês lavam SUV? Queria saber o valor da lavagem completa e se tem horário essa semana.",
  car_repair: "Boa tarde! Vocês fazem revisão completa? Queria uma ideia de valor e se dá pra deixar o carro essa semana.",
  tyres: "Boa tarde! Quanto está o pneu aro 15? E vocês fazem alinhamento junto?",
  hairdresser: "Oi, boa tarde! Qual o valor do corte feminino e tem horário pra essa semana?",
  barber: "Fala! Quanto tá o corte com barba? E precisa agendar ou pode chegar?",
  beauty: "Oi! Queria saber o valor da limpeza de pele e se tem horário nos próximos dias.",
  restaurant: "Boa noite! Vocês estão abertos hoje? E fazem entrega pra qual região?",
  fast_food: "Boa noite! Estão atendendo agora? Queria saber o valor do combo e se entregam aqui na região.",
  pizzaria: "Boa noite! Qual o valor da pizza grande e quanto tempo demora a entrega?",
  lanchonete: "Boa noite! Estão abertos? Queria saber os valores e se fazem entrega.",
  bakery: "Bom dia! Vocês fazem bolo de aniversário por encomenda? Queria saber valor e prazo.",
  cafe: "Bom dia! Que horas vocês abrem? E tem opção sem lactose?",
  dentist: "Boa tarde! Vocês atendem convênio? Queria saber o valor da avaliação e se tem horário.",
  clinic: "Boa tarde! Queria marcar uma consulta. Vocês atendem convênio e qual o valor particular?",
  doctors: "Boa tarde! Queria marcar uma consulta. Atendem convênio? E qual o valor particular?",
  veterinary: "Boa tarde! Quanto custa a consulta pra cachorro? E tem horário essa semana?",
  physiotherapist: "Boa tarde! Qual o valor da sessão e quantas costumam ser necessárias?",
  pharmacy: "Boa tarde! Vocês têm entrega? E qual o horário de funcionamento no domingo?",
  optician: "Boa tarde! Vocês fazem exame de vista? Queria saber o valor da armação com lente.",
  fitness_centre: "Boa tarde! Qual o valor da mensalidade e tem taxa de matrícula?",
  pet: "Boa tarde! Quanto fica o banho e tosa pra cachorro médio? Tem horário essa semana?",
  lawyer: "Boa tarde! Vocês atendem causa trabalhista? Queria saber como funciona a primeira consulta.",
  accountant: "Boa tarde! Quanto fica a abertura de MEI e a mensalidade da contabilidade?",
  estate_agent: "Boa tarde! Vocês têm apartamento de 2 quartos pra alugar na região? Qual a faixa de preço?",
  hotel: "Boa tarde! Tem quarto disponível pro fim de semana? Qual o valor da diária pra casal?",
  guest_house: "Boa tarde! Tem vaga pro fim de semana? Qual o valor da diária?",
  clothes: "Boa tarde! Vocês têm tamanho GG dessa peça? E fazem entrega?",
  florist: "Boa tarde! Quanto fica um buquê pra entregar amanhã? E vocês entregam na região?",
  mobile_phone: "Boa tarde! Vocês trocam tela de iPhone? Qual o valor e quanto tempo demora?",
};

/** Sinônimos em português caem na mesma pergunta da tag do OSM. */
const APELIDOS: Record<string, string> = {
  oficina: "car_repair",
  mecanica: "car_repair",
  borracharia: "tyres",
  salao: "hairdresser",
  cabeleireiro: "hairdresser",
  barbearia: "barber",
  estetica: "beauty",
  restaurante: "restaurant",
  churrascaria: "restaurant",
  marmitaria: "fast_food",
  hamburgueria: "fast_food",
  cafeteria: "cafe",
  padaria: "bakery",
  confeitaria: "bakery",
  doceria: "bakery",
  sorveteria: "cafe",
  acaiteria: "cafe",
  dentista: "dentist",
  odontologia: "dentist",
  clinica: "clinic",
  medico: "doctors",
  veterinaria: "veterinary",
  fisioterapia: "physiotherapist",
  farmacia: "pharmacy",
  otica: "optician",
  academia: "fitness_centre",
  pilates: "fitness_centre",
  crossfit: "fitness_centre",
  petshop: "pet",
  advocacia: "lawyer",
  advogado: "lawyer",
  contabilidade: "accountant",
  imobiliaria: "estate_agent",
  pousada: "guest_house",
  roupas: "clothes",
  floricultura: "florist",
  celular: "mobile_phone",
};

export function perguntaDeCliente(lead: Lead): string {
  const chave = (lead.categoria ?? "").toLowerCase();

  for (const [k, v] of Object.entries(PERGUNTAS)) {
    if (chave.includes(k)) return v;
  }
  for (const [apelido, tag] of Object.entries(APELIDOS)) {
    if (chave.includes(apelido)) return PERGUNTAS[tag];
  }

  /**
   * Padrão: preço e disponibilidade. É o que o cliente pergunta em qualquer
   * ramo, e é justamente a pergunta que o dono responde vinte vezes por dia.
   */
  return `Boa tarde! Queria saber os valores de vocês e se tem horário essa semana.`;
}

function quandoLegivel(iso: string): string {
  const enviado = new Date(iso);
  const horas = Math.floor((Date.now() - enviado.getTime()) / 3_600_000);
  const hora = enviado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (horas < 20) return `hoje às ${hora}`;
  if (horas < 44) return `ontem às ${hora}`;
  return `dia ${enviado.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${hora}`;
}

function tempoLegivel(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} hora${horas > 1 ? "s" : ""}`;
  const dias = Math.round(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

/** Primeiro nome do sócio que administra, quando a Receita já foi consultada. */
function comQuemFalar(lead: Lead): string | null {
  const dono = (lead.socios ?? []).find((s) => s.decide) ?? (lead.socios ?? [])[0];
  if (!dono?.nome) return null;
  const primeiro = dono.nome.trim().split(/\s+/)[0];
  return primeiro.charAt(0) + primeiro.slice(1).toLowerCase();
}

export type Revelacao =
  | { serve: true; mensagem: string }
  | { serve: false; motivo: string };

/** O fato medido, em uma frase. É a única parte que afirma algo. */
function fatoDoTeste(teste: TesteOculto): string {
  const quando = quandoLegivel(teste.enviadoEm);
  const base = `Mandei uma mensagem aqui ${quando} perguntando preço, como cliente`;

  if (teste.resultado === "sem-resposta") {
    return `${base}, e até agora não chegou resposta.`;
  }
  if (teste.resultado === "demorou") {
    return `${base}. A resposta veio${teste.minutos ? ` ${tempoLegivel(teste.minutos)} depois` : " bem depois"}.`;
  }
  return `${base}. Vocês responderam${teste.minutos ? ` em ${tempoLegivel(teste.minutos)}` : " rápido"}.`;
}

/**
 * A mensagem depois do teste, conforme o produto.
 *
 * Os dois produtos leem o MESMO teste de formas diferentes, e isso não é
 * truque de vendedor — são duas verdades distintas sobre o mesmo fato:
 *
 *  - CHATBOT: o problema é o tempo. Só existe conversa se demorou ou não
 *    respondeu. Se responderam rápido, o argumento não existe e a função se
 *    recusa a montar a mensagem.
 *
 *  - SITE: o problema é ter precisado perguntar. Aqui a resposta rápida é o
 *    MELHOR gancho, não o pior: alguém aí parou o que estava fazendo para
 *    digitar um preço que uma página responderia sozinha. Por isso, para site,
 *    os três resultados servem.
 */
export function montarRevelacao(
  lead: Lead,
  teste: TesteOculto,
  produto: "site" | "chatbot",
): Revelacao {
  if (!teste.resultado) {
    return { serve: false, motivo: "Registre o resultado do teste primeiro." };
  }

  const nome = comQuemFalar(lead);
  const abertura = nome ? `Oi ${nome}, tudo bem?` : `Oi, tudo bem?`;
  const ramo = categoriaSingular(lead.categoria);
  const fato = fatoDoTeste(teste);

  if (produto === "chatbot") {
    if (teste.resultado === "rapida") {
      const tempo = teste.minutos ? ` (${tempoLegivel(teste.minutos)})` : "";
      return {
        serve: false,
        motivo: `Responderam rápido${tempo}. O argumento de demora não se sustenta aqui — mas serve para vender SITE: alguém digitou aquela resposta à mão.`,
      };
    }

    const consequencia =
      teste.resultado === "sem-resposta"
        ? `Não é reclamação — foi um teste meu, e imagino que a correria aí seja grande.`
        : `Não é crítica: com movimento, é o que acontece mesmo.`;

    return {
      serve: true,
      mensagem: [
        abertura,
        ``,
        fato,
        ``,
        `${consequencia} Mas quem estava perguntando de verdade provavelmente já procurou outro lugar.`,
        ``,
        `Sou desenvolvedor e montei um atendente de WhatsApp com IA para ${ramo}: responde na hora, a qualquer horário, e passa pra vocês quando o assunto precisa de gente.`,
        ``,
        `Quer ver funcionando com as suas perguntas? Levo 30 segundos pra te mostrar.`,
      ].join("\n"),
    };
  }

  // --- site ---
  const leitura =
    teste.resultado === "rapida"
      ? `Rápido, e isso é justamente o ponto: alguém aí parou o que estava fazendo pra digitar um preço.`
      : teste.resultado === "sem-resposta"
        ? `Não é reclamação — foi um teste meu. Só que eu, como cliente, não tinha onde procurar esse preço sem incomodar vocês.`
        : `Não é crítica. Só que enquanto eu esperava, não tinha onde ver esse preço sozinho.`;

  return {
    serve: true,
    mensagem: [
      abertura,
      ``,
      fato,
      ``,
      leitura,
      ``,
      `Sou desenvolvedor e montei um modelo de página para ${ramo}, com os serviços e valores de vocês: o cliente vê sozinho e só chama no WhatsApp quando já decidiu.`,
      ``,
      `Posso te enviar o link pra você dar uma olhada em 30 segundos?`,
    ].join("\n"),
  };
}
