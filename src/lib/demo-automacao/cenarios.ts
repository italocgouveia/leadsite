/**
 * 🧪 OS CENÁRIOS DA DEMONSTRAÇÃO — 24 conversas diferentes, roteirizadas.
 *
 * Uma demonstração que repete a mesma conversa cem vezes é descoberta na
 * terceira. Cada contato recebe um destes roteiros; o roteiro avança uma
 * rodada por vez (cliente fala → IA responde), e é a rodada que muda a
 * intenção, o interesse e a etapa — como aconteceria numa conversa real,
 * onde o cliente começa perguntando preço e termina marcando.
 *
 * TUDO AQUI É FICTÍCIO. Os textos são genéricos de propósito: a demonstração
 * não sabe o ramo do cliente que está assistindo, e uma resposta que citasse
 * "nosso corte masculino" quebraria a ilusão numa clínica.
 */

export type Intencao =
  | "duvida"
  | "preco"
  | "agendar"
  | "horario"
  | "localizacao"
  | "sem-interesse"
  | "humano"
  | "recorrente"
  | "indefinida";

export type Perfil =
  | "interessado"
  | "orcamento"
  | "agendamento"
  | "duvida"
  | "sem-interesse"
  | "pediu-humano"
  | "aguardando"
  | "recorrente";

export type Etapa = "novo" | "em-conversa" | "interessado" | "negociacao" | "agendado" | "humano" | "encerrado";

export type Rodada = {
  cliente: string;
  ia: string;
  /** O que a IA conclui desta rodada. */
  intencao: Intencao;
  interesse: "alto" | "medio" | "baixo" | "indefinido";
  etapa: Etapa;
  /** 0–100. Confiança da classificação — fixa por rodada, não sorteada. */
  confianca: number;
  /** Por que a IA classificou assim. Aparece na "leitura da IA". */
  motivo: string;
};

export type Cenario = {
  id: string;
  perfil: Perfil;
  rodadas: Rodada[];
};

const r = (
  cliente: string,
  ia: string,
  intencao: Intencao,
  interesse: Rodada["interesse"],
  etapa: Etapa,
  confianca: number,
  motivo: string,
): Rodada => ({ cliente, ia, intencao, interesse, etapa, confianca, motivo });

export const CENARIOS: Cenario[] = [
  /* ───────── os roteiros da apresentação vêm PRIMEIRO: Cliente 001 e o primeiro humano mostram exatamente o combinado ───────── */
  {
    id: "apr-valor",
    perfil: "orcamento",
    rodadas: [
      r("Oi, queria saber o valor.", "Claro! Posso te ajudar com isso. Me conta um pouco do que você está procurando.", "preco", "medio", "em-conversa", 90, "Cliente perguntou sobre valor — ainda sem contexto."),
      r("Queria algo para atender melhor meus clientes pelo WhatsApp.", "Entendi. Hoje vocês recebem muitos contatos pelo WhatsApp?", "preco", "alto", "interessado", 93, "Necessidade declarada: atendimento pelo WhatsApp."),
      r("Sim, principalmente durante o dia.", "Nesse caso, a automação pode assumir os primeiros atendimentos e encaminhar para sua equipe quando necessário.", "preco", "alto", "negociacao", 95, "Cliente demonstrou interesse comercial."),
      r("Faz sentido. Quanto fica?", "Te mando a proposta agora com os valores e o que está incluído. Dois minutos.", "preco", "alto", "negociacao", 97, "Pediu valor depois de entender a solução — pronto para proposta."),
    ],
  },
  {
    id: "apr-humano",
    perfil: "pediu-humano",
    rodadas: [
      r("Quero falar com alguém.", "Claro. Vou encaminhar seu atendimento para nossa equipe.", "humano", "medio", "humano", 98, "Pedido explícito de atendimento humano."),
    ],
  },
  /* ───────────── orçamento (5) ───────────── */
  {
    id: "orc-direto",
    perfil: "orcamento",
    rodadas: [
      r("Oi, queria saber o preço.", "Claro! Para te passar o valor certo, me conta rapidinho o que você precisa?", "preco", "alto", "negociacao", 94, "Cliente perguntou diretamente sobre preço."),
      r("É para minha empresa. Atendemos muita gente pelo WhatsApp.", "Perfeito, isso ajuda. Vocês costumam perder contato quando o movimento aumenta?", "preco", "alto", "negociacao", 91, "Contexto de empresa com volume — perfil de compra."),
      r("Sim, bastante. Acaba ficando sem resposta.", "Entendi. É exatamente isso que a automação resolve. Posso te mandar uma proposta com os valores?", "preco", "alto", "negociacao", 96, "Dor confirmada pelo próprio cliente."),
      r("Pode mandar.", "Enviado! Qualquer dúvida sobre os valores, é só me chamar por aqui.", "preco", "alto", "negociacao", 97, "Cliente pediu a proposta."),
    ],
  },
  {
    id: "orc-comparando",
    perfil: "orcamento",
    rodadas: [
      r("Vocês fazem orçamento?", "Faço sim! Me conta um pouco do que você precisa para eu entender melhor.", "preco", "medio", "em-conversa", 89, "Pedido de orçamento sem contexto ainda."),
      r("Estou vendo algumas opções no mercado.", "Ótimo, comparar é o certo. O que mais pesa para você: preço, prazo ou suporte?", "preco", "medio", "negociacao", 87, "Cliente em comparação — interesse real, decisão em aberto."),
      r("Suporte, principalmente.", "Então vale saber: aqui o suporte é por WhatsApp mesmo, com gente de verdade. Quer que eu monte a proposta com isso em destaque?", "preco", "alto", "negociacao", 93, "Critério de decisão identificado: suporte."),
    ],
  },
  {
    id: "orc-valor",
    perfil: "orcamento",
    rodadas: [
      r("Quanto custa por mês?", "Depende do volume de conversas. Vocês recebem quantas mensagens por dia, mais ou menos?", "preco", "alto", "negociacao", 95, "Pergunta objetiva de valor mensal."),
      r("Umas 40 por dia.", "Nesse volume o retorno costuma vir rápido. Te passo os valores por aqui ou prefere uma ligação de 10 minutos?", "preco", "alto", "negociacao", 92, "Volume informado — permite dimensionar."),
    ],
  },
  {
    id: "orc-desconto",
    perfil: "orcamento",
    rodadas: [
      r("Tem desconto para pagamento anual?", "Tem sim, e te explico certinho. Antes, me diz: vocês já usam algum sistema hoje?", "preco", "alto", "negociacao", 90, "Já negocia condição — estágio avançado."),
      r("Não, é tudo no WhatsApp mesmo.", "Então a mudança é grande e vale a pena. Vou preparar a proposta com a condição anual. Ok?", "preco", "alto", "negociacao", 94, "Sem sistema atual — oportunidade limpa."),
    ],
  },
  {
    id: "orc-socio",
    perfil: "orcamento",
    rodadas: [
      r("Preciso do valor para passar pro meu sócio.", "Sem problema. Te mando um resumo em uma página, fácil de repassar. Vocês são quantos na operação?", "preco", "medio", "negociacao", 88, "Decisão compartilhada — precisa de material."),
      r("Três pessoas.", "Perfeito, é o tamanho em que a automação mais alivia. Mandando o resumo agora.", "preco", "alto", "negociacao", 91, "Equipe pequena — perfil ideal."),
    ],
  },

  /* ───────────── agendamento (5) ───────────── */
  {
    id: "ag-sexta",
    perfil: "agendamento",
    rodadas: [
      r("Quero marcar para sexta.", "Sexta tenho às 9h e às 15h. Qual fica melhor?", "agendar", "alto", "agendado", 96, "Pedido explícito de agendamento com dia."),
      r("15h.", "Marcado: sexta, 15h. Te mando um lembrete na quinta à noite. Até lá!", "agendar", "alto", "agendado", 98, "Horário confirmado."),
    ],
  },
  {
    id: "ag-vaga",
    perfil: "agendamento",
    rodadas: [
      r("Tem vaga essa semana?", "Tenho sim! Amanhã de manhã ou quinta à tarde — qual prefere?", "agendar", "alto", "agendado", 93, "Busca por disponibilidade."),
      r("Amanhã de manhã.", "Amanhã às 10h está reservado para você. Qualquer imprevisto, é só avisar por aqui.", "agendar", "alto", "agendado", 97, "Escolha feita — agendamento fechado."),
    ],
  },
  {
    id: "ag-como",
    perfil: "agendamento",
    rodadas: [
      r("Como faço para agendar?", "É por aqui mesmo! Me diz o melhor dia e período que eu reservo.", "agendar", "medio", "em-conversa", 90, "Intenção de agendar, sem data ainda."),
      r("Pode ser na segunda à tarde.", "Segunda às 14h fechado. Anotei aqui. Precisa de mais alguma coisa?", "agendar", "alto", "agendado", 95, "Data e período definidos."),
    ],
  },
  {
    id: "ag-remarcar",
    perfil: "recorrente",
    rodadas: [
      r("Preciso remarcar o horário de amanhã.", "Claro! Qual dia fica melhor para você?", "recorrente", "alto", "agendado", 92, "Cliente já tem horário — recorrente."),
      r("Quinta no mesmo horário.", "Feito: quinta, mesmo horário. O de amanhã foi liberado.", "agendar", "alto", "agendado", 96, "Remarcação concluída."),
    ],
  },
  {
    id: "ag-hoje",
    perfil: "agendamento",
    rodadas: [
      r("Consegue me encaixar hoje?", "Deixa eu ver… tenho um horário às 17h. Serve?", "agendar", "alto", "negociacao", 89, "Urgência — quer hoje."),
      r("Serve!", "Reservado às 17h. Te espero!", "agendar", "alto", "agendado", 97, "Encaixe confirmado."),
    ],
  },

  /* ───────────── interessado / dúvida (6) ───────────── */
  {
    id: "int-como-funciona",
    perfil: "interessado",
    rodadas: [
      r("Oi, queria saber como funciona.", "Claro! Posso te explicar 😊 Você está procurando esse serviço para sua empresa?", "duvida", "medio", "em-conversa", 85, "Pergunta aberta — interesse inicial."),
      r("Sim, queria algo para melhorar meu atendimento.", "Entendi. Hoje vocês recebem muitos contatos pelo WhatsApp?", "duvida", "alto", "interessado", 90, "Objetivo declarado: melhorar atendimento."),
      r("Sim, bastante.", "Faz sentido. Posso te mostrar como esse atendimento poderia funcionar automaticamente.", "duvida", "alto", "interessado", 93, "Volume confirmado — dor identificada."),
      r("Pode mostrar.", "Vou te mandar um exemplo real por aqui. Dois minutos e você entende tudo.", "duvida", "alto", "interessado", 95, "Cliente aceitou a demonstração."),
    ],
  },
  {
    id: "int-servico",
    perfil: "interessado",
    rodadas: [
      r("Vocês fazem esse serviço?", "Fazemos, sim! Me conta o que você precisa para eu te orientar melhor.", "duvida", "medio", "em-conversa", 86, "Verificação de escopo."),
      r("Preciso organizar os clientes que chegam pelo Instagram e WhatsApp.", "Perfeito, isso é o nosso dia a dia. Você quer só organizar, ou também responder automaticamente?", "duvida", "alto", "interessado", 91, "Necessidade específica descrita."),
      r("Os dois.", "Então é o pacote completo. Quer que eu te explique como fica?", "duvida", "alto", "interessado", 94, "Escopo completo — interesse alto."),
    ],
  },
  {
    id: "int-gostaria",
    perfil: "interessado",
    rodadas: [
      r("Gostaria de saber mais.", "Com prazer! Qual é o seu negócio? Assim eu te mostro o que se aplica.", "duvida", "medio", "em-conversa", 84, "Interesse genérico — precisa qualificar."),
      r("Tenho uma clínica.", "Ótimo. Para clínica, o que mais ajuda é confirmação de consulta automática — reduz muito a falta. Faz sentido para vocês?", "duvida", "alto", "interessado", 92, "Ramo identificado — argumento direcionado."),
    ],
  },
  {
    id: "duv-horario",
    perfil: "duvida",
    rodadas: [
      r("Vocês atendem hoje?", "Atendemos até as 18h! Posso te ajudar com alguma coisa agora?", "horario", "medio", "em-conversa", 93, "Pergunta de horário."),
      r("Queria tirar uma dúvida sobre o serviço.", "Claro, pode perguntar. Estou por aqui.", "duvida", "medio", "em-conversa", 88, "Dúvida sem definição ainda."),
    ],
  },
  {
    id: "duv-onde",
    perfil: "duvida",
    rodadas: [
      r("Onde fica?", "Ficamos na região central, com estacionamento na porta. Quer que eu te mande a localização?", "localizacao", "medio", "em-conversa", 95, "Pergunta de endereço."),
      r("Manda sim.", "Enviado! Se quiser, já marco um horário para você passar aqui.", "localizacao", "medio", "em-conversa", 90, "Localização enviada — abertura para agendar."),
    ],
  },
  {
    id: "duv-sabado",
    perfil: "duvida",
    rodadas: [
      r("Funciona no sábado?", "Sim, sábado até 12h. Quer reservar um horário?", "horario", "medio", "em-conversa", 94, "Horário de sábado."),
    ],
  },

  /* ───────────── sem interesse (3) ───────────── */
  {
    id: "sem-nao",
    perfil: "sem-interesse",
    rodadas: [
      r("Não tenho interesse.", "Sem problema, obrigado por responder! Se mudar de ideia, estou por aqui.", "sem-interesse", "baixo", "encerrado", 97, "Recusa direta — conversa encerrada com educação."),
    ],
  },
  {
    id: "sem-pensar",
    perfil: "sem-interesse",
    rodadas: [
      r("Vou pensar e te retorno.", "Tranquilo! Se quiser, te mando um resumo por aqui para facilitar.", "sem-interesse", "baixo", "em-conversa", 86, "Adiamento — sem compromisso."),
      r("Pode mandar.", "Enviado. Qualquer dúvida é só chamar.", "sem-interesse", "medio", "em-conversa", 82, "Aceitou material — porta aberta."),
    ],
  },
  {
    id: "sem-depois",
    perfil: "sem-interesse",
    rodadas: [
      r("Agora não, obrigado.", "Entendido! Fico à disposição quando fizer sentido.", "sem-interesse", "baixo", "encerrado", 95, "Recusa temporária."),
    ],
  },

  /* ───────────── pediu humano (3) ───────────── */
  {
    id: "hum-pessoa",
    perfil: "pediu-humano",
    rodadas: [
      r("Pode falar com alguém?", "Claro! Vou te passar para um atendente agora. Só um instante.", "humano", "medio", "humano", 98, "Pedido explícito de atendimento humano."),
    ],
  },
  {
    id: "hum-reclamacao",
    perfil: "pediu-humano",
    rodadas: [
      r("Tive um problema com o serviço.", "Sinto muito por isso. Vou chamar um atendente para resolver com você agora mesmo.", "humano", "medio", "humano", 93, "Reclamação — transferência imediata."),
    ],
  },
  {
    id: "hum-complexo",
    perfil: "pediu-humano",
    rodadas: [
      r("Preciso de um orçamento personalizado, é um caso diferente.", "Entendi. Como é um caso específico, vou te conectar com quem monta propostas sob medida.", "humano", "alto", "humano", 90, "Complexidade acima do que a IA resolve — encaminha."),
    ],
  },

  /* ───────────── recorrente (2) ───────────── */
  {
    id: "rec-denovo",
    perfil: "recorrente",
    rodadas: [
      r("Oi, sou eu de novo! Queria o mesmo do mês passado.", "Que bom te ver de volta! Vou repetir o pedido anterior. Mesmo horário de sempre?", "recorrente", "alto", "agendado", 94, "Cliente recorrente — histórico reconhecido."),
      r("Isso mesmo.", "Feito! Está agendado. Obrigado pela preferência.", "recorrente", "alto", "agendado", 97, "Recompra confirmada."),
    ],
  },
  {
    id: "rec-indicacao",
    perfil: "recorrente",
    rodadas: [
      r("Um amigo me indicou vocês.", "Que ótimo! Indicação é a melhor forma de chegar. Me conta o que você precisa?", "duvida", "alto", "interessado", 88, "Veio por indicação — confiança prévia."),
    ],
  },

  /* ───────────── aguardando (2) — cliente ainda não respondeu ───────────── */
  {
    id: "agu-oi",
    perfil: "aguardando",
    rodadas: [r("Oi", "Oi! Tudo bem? Como posso te ajudar hoje?", "indefinida", "indefinido", "em-conversa", 60, "Saudação sem conteúdo — aguardando o cliente dizer o que quer.")],
  },
  {
    id: "agu-interrogacao",
    perfil: "aguardando",
    rodadas: [r("??", "Olá! Me conta o que você precisa e eu te ajudo.", "indefinida", "indefinido", "em-conversa", 55, "Mensagem sem conteúdo classificável.")],
  },

  /* ───────────── variações naturais (§6) ───────────── */
  {
    id: "var-explicar",
    perfil: "duvida",
    rodadas: [
      r("Tem alguém que pode me explicar?", "Posso te explicar por aqui mesmo, e se preferir chamo uma pessoa. O que você quer entender?", "duvida", "medio", "em-conversa", 84, "Quer explicação — não pediu humano ainda."),
      r("Como funciona na prática.", "Na prática: o cliente manda mensagem, a IA responde na hora, classifica e avisa você quando vale sua atenção. Quer ver um exemplo?", "duvida", "alto", "interessado", 91, "Interesse em entender o funcionamento."),
    ],
  },
  {
    id: "var-ajuda",
    perfil: "duvida",
    rodadas: [
      r("Preciso de ajuda.", "Estou aqui! Me conta o que está acontecendo.", "duvida", "medio", "em-conversa", 80, "Pedido de ajuda genérico — precisa qualificar."),
      r("Não consigo dar conta das mensagens.", "Isso é exatamente o que resolvemos. Quantas mensagens por dia, mais ou menos?", "duvida", "alto", "interessado", 92, "Dor confirmada: volume de mensagens."),
    ],
  },
  {
    id: "var-contratar",
    perfil: "orcamento",
    rodadas: [
      r("Quero contratar.", "Ótimo! Para fechar, preciso de duas informações: nome da empresa e o WhatsApp que vai usar a automação.", "preco", "alto", "negociacao", 98, "Decisão de compra explícita."),
      r("Empresa Exemplo, esse número mesmo.", "Perfeito. Te mando o contrato e o passo a passo da ativação por aqui. Bem-vindo!", "preco", "alto", "negociacao", 99, "Dados enviados — fechamento."),
    ],
  },
  {
    id: "var-amanha",
    perfil: "sem-interesse",
    rodadas: [
      r("Pode me chamar amanhã?", "Claro! Que horas fica bom para você?", "sem-interesse", "medio", "em-conversa", 88, "Adiou, mas abriu horário — follow-up marcado."),
      r("De manhã, umas 10h.", "Anotado: amanhã às 10h eu te chamo. Até lá!", "agendar", "medio", "agendado", 94, "Follow-up com hora — vira agendamento."),
    ],
  },
  {
    id: "var-interesse",
    perfil: "interessado",
    rodadas: [
      r("Tenho interesse.", "Que bom! Me conta um pouco do seu negócio para eu te mostrar o que se aplica.", "duvida", "alto", "interessado", 90, "Interesse declarado de saída."),
      r("Tenho uma oficina mecânica.", "Para oficina, o que mais ajuda é orçamento e ordem de serviço saindo direto do WhatsApp. Quer ver como fica?", "duvida", "alto", "interessado", 94, "Ramo identificado — argumento direcionado."),
    ],
  },
  {
    id: "var-outra-empresa",
    perfil: "sem-interesse",
    rodadas: [
      r("Já trabalho com outra empresa.", "Entendo! Se um dia quiser comparar, estou por aqui. Posso te perguntar o que você mais gosta na solução atual?", "sem-interesse", "baixo", "em-conversa", 90, "Objeção: já tem fornecedor. IA não insiste, mas abre conversa."),
      r("O suporte é bom.", "Isso importa muito mesmo. Vou deixar registrado — qualquer coisa, é só chamar.", "sem-interesse", "baixo", "encerrado", 92, "Sem abertura — encerra com educação."),
    ],
  },
  {
    id: "var-pesquisando",
    perfil: "sem-interesse",
    rodadas: [
      r("Só estou pesquisando.", "Sem pressa! Se quiser, te mando um resumo de uma página para ajudar na pesquisa.", "sem-interesse", "baixo", "em-conversa", 89, "Estágio de pesquisa — sem pressão."),
      r("Pode mandar.", "Enviado. Quando fizer sentido, é só me chamar.", "sem-interesse", "medio", "em-conversa", 85, "Aceitou material — porta aberta."),
    ],
  },
];

export const ROTULO_INTENCAO: Record<Intencao, string> = {
  duvida: "💬 Dúvida",
  preco: "💰 Orçamento",
  agendar: "📅 Agendamento",
  horario: "🕐 Horário",
  localizacao: "📍 Localização",
  "sem-interesse": "❌ Sem interesse",
  humano: "👤 Humano",
  recorrente: "🔁 Recorrente",
  indefinida: "❔ Indefinida",
};

export const ROTULO_ETAPA: Record<Etapa, string> = {
  novo: "Novo",
  "em-conversa": "Em conversa",
  interessado: "🔥 Interessado",
  negociacao: "💰 Negociação",
  agendado: "📅 Agendado",
  humano: "👤 Humano",
  encerrado: "Encerrado",
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  interessado: "Interessado",
  orcamento: "Orçamento",
  agendamento: "Agendamento",
  duvida: "Dúvida",
  "sem-interesse": "Sem interesse",
  "pediu-humano": "Pediu humano",
  aguardando: "Aguardando",
  recorrente: "Recorrente",
};

/** A próxima ação sugerida, derivada do estado — não é sorteio. */
export function proximaAcao(intencao: Intencao, etapa: Etapa, humano: boolean): string {
  if (humano) return "Atendente responde";
  if (etapa === "encerrado") return "Nenhuma — encerrado com educação";
  if (intencao === "humano") return "Transferir para atendente";
  if (intencao === "preco") return "Enviar proposta";
  if (intencao === "agendar" || etapa === "agendado") return "Confirmar e lembrar na véspera";
  if (intencao === "recorrente") return "Repetir pedido anterior";
  if (intencao === "sem-interesse") return "Registrar e não insistir";
  if (intencao === "localizacao") return "Enviar localização e oferecer horário";
  if (intencao === "horario") return "Oferecer horário";
  if (etapa === "interessado") return "Mostrar exemplo prático";
  return "Aguardar o cliente";
}
