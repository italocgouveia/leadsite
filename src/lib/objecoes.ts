/**
 * Objeções comerciais: reconhecer, e ter o que responder.
 *
 * POR QUE SEPARADO DE lib/classificar
 *
 * Intenção e objeção são perguntas diferentes sobre a mesma frase. "Quanto
 * custa? Mas já tenho sistema" é intenção `orcamento` E objeção `ja-tem-sistema`
 * ao mesmo tempo — forçar uma classificação só faria perder metade da
 * informação, e é justamente a metade que decide o que falar em seguida.
 *
 * A ESTRATÉGIA DE TODAS ELAS É A MESMA
 *
 * Abrir uma lacuna sem atacar o que a pessoa já faz. Quem diz "faço pelo
 * WhatsApp" não está errado — está dizendo que resolve daquele jeito. Discutir
 * isso é discutir com o cliente. Perguntar o que aquele jeito NÃO cobre deixa
 * ele mesmo encontrar a falha, e aí a conversa continua.
 *
 * Tudo aqui é SUGESTÃO. Nada é enviado automaticamente: a resposta automática
 * existente segue com as regras dela, e este módulo não a alimenta.
 *
 * Sem IA, sem banco — regex e texto pronto.
 */

export type IdObjecao =
  | "preco"
  | "ja-tem-sistema"
  | "faz-pelo-whatsapp"
  | "nao-precisa"
  | "manda-apresentacao"
  | "vou-pensar"
  | "agora-nao"
  | "ja-tem-alguem";

export type Objecao = {
  id: IdObjecao;
  nome: string;
  /** O que NÃO fazer, e o que fazer no lugar. */
  estratégia: string;
  /** A pergunta que abre a lacuna sem contestar o cliente. */
  pergunta: string;
  /** Resposta pronta para copiar — o vendedor edita se quiser. */
  resposta: string;
  padroes: RegExp[];
};

export const OBJECOES: Objecao[] = [
  {
    id: "preco",
    nome: "Preço",
    estratégia:
      "Não baixar preço nem justificar valor antes de saber o tamanho do problema. Preço só faz sentido depois que existe uma conta do outro lado.",
    pergunta: "Quantas vezes por semana isso acontece aí?",
    resposta:
      "Entendo. Antes de falar de valor, me ajuda a entender uma coisa: quanto tempo por semana vocês gastam hoje nesse controle? Assim eu te mostro se compensa ou não.",
    padroes: [
      /\b(caro|car[íi]ssimo|salgado|fora do or[çc]amento|n[ãa]o tenho (esse )?(dinheiro|or[çc]amento)|muito dinheiro|pesado (pra|para) mim)\b/i,
      /\bquanto (custa|fica|sai|[ée])\b/i,
      /\bqual (o )?(valor|pre[çc]o|investimento)\b/i,
    ],
  },
  {
    id: "ja-tem-sistema",
    nome: "Já tem sistema",
    estratégia:
      "Não tentar vender por cima. Descobrir se o sistema atual cobre o processo INTEIRO — quase nunca cobre, e a parte que sobra costuma ser exatamente a dor.",
    pergunta: "Ele cobre todo o processo ou tem parte que vocês ainda fazem manualmente?",
    resposta:
      "Entendi. E hoje ele cobre todo o processo de vocês, ou ainda existe alguma parte que acaba sendo feita na mão?",
    padroes: [
      /\b(j[áa] (tenho|temos|uso|usamos|possu[oi])).{0,20}\b(sistema|software|programa|erp|plataforma)\b/i,
      /\b(sistema|software|erp)\b.{0,15}\b(pr[óo]prio|contratado|da empresa)\b/i,
      /\bj[áa] (sou|somos) atendid/i,
    ],
  },
  {
    id: "faz-pelo-whatsapp",
    nome: "Já faz pelo WhatsApp",
    estratégia:
      "Não colocar o sistema como substituto do WhatsApp — ele não é. Mostrar que o WhatsApp guarda a conversa, mas não guarda histórico, retorno nem quem ficou sem resposta.",
    pergunta:
      "Vocês conseguem acompanhar histórico, retorno e quem ainda não fechou só pelo WhatsApp?",
    resposta:
      "Faz sentido, o WhatsApp resolve o contato mesmo. Só uma dúvida: vocês conseguem acompanhar por ele o histórico, os retornos e quem ficou sem resposta? Costuma ser essa parte que some no meio das conversas.",
    padroes: [
      /**
       * `faz` avulso entra porque "a gente faz pelo whats" é a forma mais
       * comum na fala — mais que "fazemos". Só casa quando WhatsApp aparece
       * logo depois, então não pega "faz sentido" nem "faz tempo".
       */
      /\b(fa[çz]o|faz|fazemos|controlo|controla|controlamos|resolvo|resolve|resolvemos|uso|usa|usamos)\b.{0,25}\b(whats|zap)/i,
      /\b(whats(app)?|zap)\b.{0,20}\b(j[áa] (resolve|basta|d[áa] conta|serve))/i,
      /\bs[óo] (pelo|no) (whats|zap)/i,
    ],
  },
  {
    id: "nao-precisa",
    nome: "Não precisa disso",
    estratégia:
      "Não insistir na solução. Trocar de assunto para o processo: quem diz que não precisa costuma não ter visto o custo do jeito atual.",
    pergunta: "Como vocês fazem hoje?",
    resposta:
      "Sem problema. Só por curiosidade, como vocês fazem esse controle hoje? Se já está resolvido, eu paro de te incomodar.",
    padroes: [
      /\bn[ãa]o (precis|necessit)/i,
      /\b(n[ãa]o (tenho|temos) interesse|sem interesse)\b/i,
      /\bn[ãa]o (quero|queremos)\b/i,
      /\bt[áa] (bom|tudo) (assim|do jeito)/i,
    ],
  },
  {
    id: "manda-apresentacao",
    nome: "Manda uma apresentação",
    estratégia:
      "Mandar material genérico é onde a conversa morre. Trocar o PDF por duas perguntas: material feito sobre o processo dele tem resposta, catálogo não tem.",
    pergunta: "Como vocês fazem esse controle hoje?",
    resposta:
      "Mando sim. Só para eu te mandar algo que sirva e não um catálogo genérico: como vocês fazem esse controle hoje?",
    padroes: [
      /\b(manda|envia|me mande|pode mandar|me passa)\b.{0,25}\b(apresenta[çc][ãa]o|material|proposta|pdf|portf[óo]lio|or[çc]amento)\b/i,
    ],
  },
  {
    id: "vou-pensar",
    nome: "Vou pensar",
    estratégia:
      "Quase sempre é uma dúvida não dita. Perguntar qual é, sem pressionar, é o que a traz à tona — e dúvida na mesa dá para responder.",
    pergunta: "O que pesa mais na decisão?",
    resposta:
      "Claro. Só para eu te ajudar melhor: o que pesa mais na decisão — o valor, o tempo de implantar, ou ainda não ficou claro como funciona?",
    padroes: [
      /\bvou (pensar|ver|analisar|avaliar)\b/i,
      /\b(preciso|vou ter que) (pensar|ver com|falar com|conversar com)\b/i,
      /\bdepois eu (te )?(retorno|falo|aviso|vejo)\b/i,
    ],
  },
  {
    id: "agora-nao",
    nome: "Agora não é o momento",
    estratégia:
      "Aceitar e marcar. Insistir contra um 'agora não' queima o contato; combinar uma data preserva a oportunidade para quando o momento chegar.",
    pergunta: "Faz sentido eu te procurar de novo daqui a quanto tempo?",
    resposta:
      "Sem problema. Faz sentido eu te procurar de novo daqui a umas semanas? Marco aqui e não te incomodo até lá.",
    padroes: [
      /\b(agora n[ãa]o|n[ãa]o [ée] (o )?momento|momento ruim|corrido|sem tempo)\b/i,
      /\b(fala|me procura|me chama)\b.{0,15}\b(depois|semana que vem|m[êe]s que vem|mais pra frente)\b/i,
      /\bmais (pra|para) frente\b/i,
    ],
  },
  {
    id: "ja-tem-alguem",
    nome: "Já tem quem faça",
    estratégia:
      "Não competir com o fornecedor atual de frente. Descobrir o escopo do que ele faz — costuma ser site ou social, não sistema de processo.",
    pergunta: "O que essa pessoa cuida hoje para vocês?",
    resposta:
      "Ótimo ter alguém acompanhando. O que ela cuida hoje — mais a parte de site e redes, ou também o controle interno de vocês?",
    padroes: [
      /\bj[áa] (tenho|temos)\b.{0,20}\b(algu[ée]m|pessoa|empresa|fornecedor|ag[êe]ncia|programador|sobrinho|primo)\b/i,
      /\b(algu[ée]m|uma empresa|uma ag[êe]ncia)\b.{0,15}\b(cuida|faz|mexe|resolve)\b/i,
    ],
  },
];

/**
 * Detecta a objeção numa mensagem do lead.
 *
 * Devolve a PRIMEIRA da lista que casar, e a ordem de `OBJECOES` é a ordem de
 * prioridade comercial: preço na frente porque, quando aparece junto com
 * outra, é a que trava a conversa.
 *
 * Devolve `null` quando não reconhece — e isso é o padrão. Forçar uma objeção
 * em toda mensagem faria a tela sugerir resposta de objeção para quem só disse
 * "bom dia".
 */
export function detectarObjecao(texto: string): Objecao | null {
  const t = texto.trim();
  if (t.length < 3) return null;
  return OBJECOES.find((o) => o.padroes.some((p) => p.test(t))) ?? null;
}

export function objecaoPorId(id: string): Objecao | undefined {
  return OBJECOES.find((o) => o.id === id);
}
