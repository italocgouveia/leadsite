import { OBJECOES } from "@/lib/objecoes";

/**
 * A BIBLIOTECA COMERCIAL — o que falar, quando, e por qual canal.
 *
 * POR QUE É CÓDIGO E NÃO TABELA
 *
 * `objecoes.ts` já vive assim e funciona: conteúdo comercial versionado junto
 * com o sistema, revisável em diff, sem migração e sem risco de alguém apagar
 * a biblioteca inteira com um DELETE. Quando houver necessidade real de criar
 * e editar material pela tela, entra uma tabela para os materiais DO USUÁRIO —
 * e estes continuam como padrão de fábrica.
 *
 * O QUE UM MATERIAL PRECISA TER
 *
 * Texto pronto não basta. Sem "quando usar", o vendedor manda follow-up de
 * quinta tentativa em quem respondeu ontem; sem "objetivo", ele não sabe se a
 * mensagem funcionou. Por isso todo material carrega os dois.
 *
 * SOBRE AS VARIÁVEIS
 *
 * O texto usa {nome_empresa}, {cidade}, {sistema} e afins. `preencher()` NUNCA
 * inventa valor: quando o dado não existe, ele remove a frase inteira que
 * dependia dela, em vez de deixar "[informação não encontrada]" no meio de uma
 * mensagem que vai para um cliente.
 *
 * ISTO NÃO É A MENSAGEM UNIVERSAL. O disparo automático continua usando a
 * mensagem universal aprovada, sem IA e sem variação por lead. A biblioteca
 * serve ao contato MANUAL — Instagram, ligação, e o WhatsApp que você escreve
 * com a própria mão.
 */

export type CategoriaMaterial =
  | "primeiro-contato"
  | "follow-up"
  | "objecao"
  | "diagnostico"
  | "proposta"
  | "fechamento"
  | "pos-venda";

export const ROTULO_CATEGORIA: Record<CategoriaMaterial, string> = {
  "primeiro-contato": "Primeiro contato",
  "follow-up": "Follow-up",
  objecao: "Objeções",
  diagnostico: "Diagnóstico",
  proposta: "Propostas",
  fechamento: "Fechamento",
  "pos-venda": "Pós-venda",
};

export type CanalMaterial = "whatsapp" | "instagram" | "ligacao" | "email" | "multicanal";

export const ROTULO_CANAL_MATERIAL: Record<CanalMaterial, string> = {
  whatsapp: "📱 WhatsApp",
  instagram: "📸 Instagram",
  ligacao: "📞 Ligação",
  email: "📧 E-mail",
  multicanal: "🔀 Multicanal",
};

export type Material = {
  id: string;
  titulo: string;
  categoria: CategoriaMaterial;
  canal: CanalMaterial;
  /** O que esta mensagem tenta conseguir. Sem isto não dá para saber se deu certo. */
  objetivo: string;
  /** A situação exata em que ela cabe — e, por consequência, quando não cabe. */
  quandoUsar: string;
  corpo: string;
  /** O passo seguinte que a mensagem tenta provocar. */
  cta: string;
  /** Nichos em que ela funciona melhor. Vazio = serve para qualquer um. */
  nichos?: string[];
  /** Só para follow-up: quantos dias esperar desde o contato anterior. */
  intervaloDias?: number;
};

/* ══════════════════════ PRIMEIRO CONTATO ══════════════════════ */

const PRIMEIRO_CONTATO: Material[] = [
  {
    id: "pc-direto",
    titulo: "Primeiro contato direto",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Conseguir uma resposta, qualquer que seja, sem gastar a paciência de ninguém.",
    quandoUsar:
      "Quando você não sabe quase nada sobre a empresa além do ramo. É a abordagem mais segura justamente porque não finge conhecer o negócio.",
    corpo:
      "Olá! Aqui é o Ítalo, da ICG Tech, de {cidade}.\n\n" +
      "Trabalho com sistema para {categoria} — organizar cliente, agenda e histórico num lugar só.\n\n" +
      "Faz sentido eu te mostrar como funciona?",
    cta: "Faz sentido eu te mostrar como funciona?",
  },
  {
    id: "pc-consultivo",
    titulo: "Primeiro contato consultivo",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Abrir conversa sobre o processo antes de falar de produto.",
    quandoUsar:
      "Quando o ramo tem um processo evidente (ordem de serviço, agenda, retorno) e você quer que o dono descreva a rotina dele — a resposta vale mais que a venda.",
    corpo:
      "Olá! Aqui é o Ítalo, da ICG Tech.\n\n" +
      "Uma pergunta rápida, se puder: hoje como vocês controlam {processo}? Caderno, planilha, ou algum sistema?\n\n" +
      "Pergunto porque atendo bastante {categoria} aqui em {cidade} e esse é sempre o ponto que mais dá trabalho.",
    cta: "Como vocês controlam isso hoje?",
  },
  {
    id: "pc-curto",
    titulo: "Abordagem curta",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Máxima taxa de leitura. Cabe inteira na prévia da notificação.",
    quandoUsar:
      "Quando o número tem alta chance de ser o celular pessoal do dono, que lê no meio do trabalho. Mensagem longa aí não é lida.",
    corpo: "Olá! Vocês usam algum sistema para controlar {processo}?",
    cta: "Vocês usam algum sistema?",
  },
  {
    id: "pc-oportunidade",
    titulo: "Abordagem por oportunidade",
    categoria: "primeiro-contato",
    canal: "multicanal",
    objetivo: "Ancorar na operação que a empresa já tem, não num problema que você supôs.",
    quandoUsar:
      "Quando há evidência pública de volume: muitas avaliações, horário estendido, vários serviços listados.",
    corpo:
      "Olá! Aqui é o Ítalo, da ICG Tech.\n\n" +
      "Vi que vocês atendem bastante gente. Nesse volume, o que costuma apertar é achar o histórico do cliente quando ele volta.\n\n" +
      "Trabalho com {sistema}. Quer que eu te mostre em cinco minutos?",
    cta: "Quer que eu te mostre em cinco minutos?",
  },
  {
    id: "pc-dor",
    titulo: "Abordagem por dor",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Nomear a tarefa chata que o dono faz e odeia.",
    quandoUsar:
      "SOMENTE quando a dor provável tem sinais que a sustentam. Se você não souber citar o sinal, use a abordagem consultiva — afirmar a dor de quem você nunca conversou encerra a conversa.",
    corpo:
      "Olá! Uma pergunta que faço para todo {categoria} que atendo:\n\n" +
      "quanto tempo por semana vocês gastam {dor}?\n\n" +
      "É o que mais aparece aqui, e normalmente dá para cortar quase tudo.",
    cta: "Quanto tempo isso toma por semana?",
  },
  {
    id: "pc-sem-site",
    titulo: "Empresa sem site",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Entrar pela presença digital, que é a lacuna visível.",
    quandoUsar:
      "Quando a auditoria CONFIRMOU ausência de site próprio. Não use com `site não verificado`: ausência de dado não é ausência de site.",
    corpo:
      "Olá! Aqui é o Ítalo, da ICG Tech, de {cidade}.\n\n" +
      "Procurei vocês na internet e achei o contato, mas não achei uma página de vocês.\n\n" +
      "Faço site e sistema para {categoria}. Quer ver como ficaria?",
    cta: "Quer ver como ficaria?",
  },
  {
    id: "pc-instagram-forte",
    titulo: "Empresa com Instagram ativo",
    categoria: "primeiro-contato",
    canal: "instagram",
    objetivo: "Elogiar o que é verdade e ligar isso ao que falta atrás do balcão.",
    quandoUsar:
      "Perfil com posts recentes e movimento. A ponte é: a frente está boa, e o controle interno costuma não acompanhar.",
    corpo:
      "Oi! Acompanhei o perfil de vocês aqui.\n\n" +
      "Vocês cuidam bem da parte de fora. Costumo perguntar: e o controle de {processo}, é no caderno ainda?\n\n" +
      "Trabalho com sistema para {categoria} aqui em {cidade}.",
    cta: "Como vocês controlam isso por dentro?",
  },
  {
    id: "pc-atende-whatsapp",
    titulo: "Empresa que atende pelo WhatsApp",
    categoria: "primeiro-contato",
    canal: "whatsapp",
    objetivo: "Partir do canal que ela já usa — o problema não é o canal, é o que se perde nele.",
    quandoUsar: "Quando a empresa publica WhatsApp como canal principal de atendimento.",
    corpo:
      "Olá! Vi que vocês atendem por aqui mesmo.\n\n" +
      "A pergunta que faço sempre: depois que o cliente fecha pelo WhatsApp, onde fica o registro? Muita gente perde o histórico na rolagem da conversa.\n\n" +
      "É exatamente isso que o {sistema} resolve.",
    cta: "Onde fica o registro depois que fecha?",
  },
];

/* ══════════════════════════ FOLLOW-UP ══════════════════════════ */

const FOLLOW_UP: Material[] = [
  {
    id: "fu-sem-pressao",
    titulo: "Follow-up sem pressão",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Reabrir sem cobrar. Cobrança em quem não respondeu vira bloqueio.",
    quandoUsar: "Primeira retomada, 3 a 4 dias depois do contato inicial sem resposta.",
    intervaloDias: 3,
    corpo: "Oi! Só retomando aqui — chegou a ver minha mensagem? Se não for o momento, sem problema.",
    cta: "Chegou a ver?",
  },
  {
    id: "fu-novo-valor",
    titulo: "Follow-up com valor novo",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Dar um motivo novo para responder, em vez de repetir o pedido.",
    quandoUsar:
      "Segunda retomada. Repetir 'só passando para saber' pela segunda vez ensina o cliente a ignorar.",
    intervaloDias: 7,
    corpo:
      "Oi! Lembrei de vocês agora.\n\n" +
      "Montei um {sistema} para outro {categoria} aqui em {cidade} — o dono me disse que economizou umas três horas por semana só de não refazer conta à mão.\n\n" +
      "Quer que eu te mande como ficou?",
    cta: "Quer que eu te mande como ficou?",
  },
  {
    id: "fu-apos-interesse",
    titulo: "Follow-up após interesse",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Transformar 'me interessa' em compromisso com hora marcada.",
    quandoUsar: "A pessoa demonstrou interesse e a conversa esfriou. Aqui o que falta é data.",
    intervaloDias: 2,
    corpo:
      "Oi! Você tinha comentado que fazia sentido dar uma olhada.\n\n" +
      "Consigo te mostrar amanhã de manhã ou depois à tarde. Qual fica melhor?",
    cta: "Amanhã de manhã ou depois à tarde?",
  },
  {
    id: "fu-silencio",
    titulo: "Follow-up após silêncio",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Descobrir se é 'não' ou 'não agora' — as duas coisas ajudam.",
    quandoUsar: "Duas tentativas sem resposta nenhuma.",
    intervaloDias: 14,
    corpo:
      "Oi! Vou parar de insistir para não incomodar.\n\n" +
      "Só me diz uma coisa para eu saber: não é o momento, ou não é para vocês mesmo? Qualquer uma das duas está ótima.",
    cta: "Não é o momento, ou não é para vocês?",
  },
  {
    id: "fu-ultima",
    titulo: "Última tentativa",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Encerrar com elegância e deixar a porta aberta.",
    quandoUsar: "Terceira tentativa sem resposta. Depois desta, o lead sai da fila ativa.",
    intervaloDias: 30,
    corpo:
      "Oi! Esta é minha última mensagem, prometo.\n\n" +
      "Fico à disposição se um dia fizer sentido. Deixo meu contato salvo aqui e te desejo boas vendas.",
    cta: "Fico à disposição.",
  },
  {
    id: "fu-reativacao",
    titulo: "Reativação",
    categoria: "follow-up",
    canal: "whatsapp",
    objetivo: "Voltar a um lead antigo com um gancho legítimo.",
    quandoUsar: "Mais de 90 dias desde o último contato, e a empresa continua ativa.",
    intervaloDias: 90,
    corpo:
      "Oi! Faz um tempo que a gente conversou.\n\n" +
      "As coisas mudaram bastante por aqui desde então. Se aquele assunto do {processo} ainda for um incômodo, me avisa que eu te mostro o que dá para fazer hoje.",
    cta: "Ainda é um incômodo?",
  },
];

/* ═══════════════════════ DIAGNÓSTICO ═══════════════════════ */

const DIAGNOSTICO: Material[] = [
  {
    id: "dg-descoberta",
    titulo: "Perguntas de descoberta",
    categoria: "diagnostico",
    canal: "ligacao",
    objetivo: "Entender a operação antes de propor qualquer coisa.",
    quandoUsar: "Primeira conversa real, depois que a pessoa respondeu e topou falar.",
    corpo:
      "• Como vocês recebem os clientes hoje?\n" +
      "• Quantas pessoas trabalham no atendimento?\n" +
      "• O que mais dá trabalho no dia a dia?\n" +
      "• Tem alguma coisa que vocês refazem toda semana?\n" +
      "• Se desse para tirar uma tarefa da sua semana, qual seria?",
    cta: "Deixe a pessoa falar. Anote as palavras dela, não as suas.",
  },
  {
    id: "dg-operacao",
    titulo: "Perguntas de operação",
    categoria: "diagnostico",
    canal: "ligacao",
    objetivo: "Achar onde o processo quebra.",
    quandoUsar: "Depois da descoberta, quando você já sabe o formato do negócio.",
    corpo:
      "• Como vocês controlam os atendimentos?\n" +
      "• Onde fica registrado o que foi feito para cada cliente?\n" +
      "• Como vocês sabem quando um cliente precisa voltar?\n" +
      "• Já aconteceu de perder um agendamento?\n" +
      "• Como controlam estoque e reposição?",
    cta: "Procure a resposta que vier com um suspiro. É ali que dói.",
  },
  {
    id: "dg-atendimento",
    titulo: "Perguntas de atendimento",
    categoria: "diagnostico",
    canal: "ligacao",
    objetivo: "Medir o volume e o custo do atendimento manual.",
    quandoUsar: "Quando a empresa atende muito pelo WhatsApp.",
    corpo:
      "• Quantas mensagens vocês respondem por dia, mais ou menos?\n" +
      "• Quem responde? É sempre a mesma pessoa?\n" +
      "• O que acontece quando essa pessoa falta?\n" +
      "• Já perderam venda por demorar a responder?\n" +
      "• Depois que fecha, onde fica o registro?",
    cta: "Quantifique junto com o cliente. O número tem de ser dele.",
  },
  {
    id: "dg-automacao",
    titulo: "Perguntas de automação",
    categoria: "diagnostico",
    canal: "ligacao",
    objetivo: "Descobrir o que já é repetitivo o bastante para automatizar.",
    quandoUsar: "Quando o diagnóstico apontou volume e repetição.",
    corpo:
      "• Que pergunta os clientes mais repetem?\n" +
      "• Vocês mandam lembrete de agendamento? Como?\n" +
      "• Alguém faz follow-up de quem não voltou?\n" +
      "• Quanto tempo leva para montar um orçamento?\n" +
      "• Se isso fosse automático, o que você faria com o tempo?",
    cta: "A última pergunta é a que vende. Espere a resposta.",
  },
];

/* ════════════════════════ PROPOSTAS ════════════════════════ */

const PROPOSTAS: Material[] = [
  {
    id: "pr-estrutura",
    titulo: "Estrutura de proposta",
    categoria: "proposta",
    canal: "email",
    objetivo: "Escrever proposta que o cliente entende sem você do lado.",
    quandoUsar: "Depois do diagnóstico, com a dor descrita nas palavras dele.",
    corpo:
      "1. O QUE VOCÊ ME CONTOU — repita a dor com as palavras do cliente\n" +
      "2. O QUE ISSO CUSTA HOJE — em horas ou em vendas perdidas, o número dele\n" +
      "3. O QUE EU PROPONHO — {sistema}, em linguagem de negócio, não de software\n" +
      "4. COMO FUNCIONA NA PRÁTICA — o dia a dia depois\n" +
      "5. PRAZO E PRÓXIMO PASSO — data concreta\n\n" +
      "Se não houver valor definido no sistema, NÃO invente faixa de preço.",
    cta: "Podemos começar na semana que vem?",
  },
  {
    id: "pr-apresentacao",
    titulo: "Apresentação da solução",
    categoria: "proposta",
    canal: "ligacao",
    objetivo: "Mostrar o sistema resolvendo o problema DELE, não o passeio de funcionalidades.",
    quandoUsar: "Na demonstração.",
    corpo:
      "Abra na tela que resolve a dor que ele citou. Primeiro isso, só isso.\n\n" +
      "Depois: 'lembra que você falou que perde o histórico quando o cliente volta? Olha aqui.'\n\n" +
      "Não mostre menu. Não mostre configuração. Mostre a tarefa dele acontecendo mais rápido.",
    cta: "Faz sentido para o seu dia a dia?",
  },
  {
    id: "pr-impacto",
    titulo: "Impacto e retorno",
    categoria: "proposta",
    canal: "multicanal",
    objetivo: "Traduzir o sistema em conta que fecha.",
    quandoUsar: "Quando o preço virou assunto e você já tem os números do diagnóstico.",
    corpo:
      "Use SEMPRE os números que ele te deu:\n\n" +
      "'Você me disse que gasta cerca de X horas por semana nisso. São ~4X por mês. Se metade disso volta para você atender mais gente, a conta muda.'\n\n" +
      "Se ele não te deu números, você ainda não pode fazer esta conta. Volte ao diagnóstico.",
    cta: "A conta fecha para você?",
  },
  {
    id: "pr-fechamento",
    titulo: "Fechamento",
    categoria: "fechamento",
    canal: "multicanal",
    objetivo: "Sair da conversa com uma data, não com um 'vou ver'.",
    quandoUsar: "Quando não sobrou objeção aberta.",
    corpo:
      "Não pergunte 'o que você acha?'. Pergunte a data:\n\n" +
      "'Consigo deixar rodando até sexta. Começamos com o cadastro dos clientes que você já tem, e na semana seguinte a gente liga o resto. Fecha assim?'",
    cta: "Fecha assim?",
  },
];

/* ═══════════ objeções: vindas de objecoes.ts, não recriadas ═══════════ */

/**
 * As oito objeções já existiam em `objecoes.ts`, com estratégia, pergunta e
 * resposta — e são as mesmas que o classificador usa para DETECTAR objeção nas
 * respostas recebidas. Recriá-las aqui daria duas listas que divergem na
 * primeira edição: a tela mostraria uma resposta e o classificador reagiria a
 * outra. Elas são adaptadas para o formato de material, não copiadas.
 */
const DE_OBJECOES: Material[] = OBJECOES.map((o) => ({
  id: `ob-${o.id}`,
  titulo: o.nome,
  categoria: "objecao" as const,
  canal: "multicanal" as const,
  objetivo: o.estratégia,
  quandoUsar: `Quando o cliente responde algo como "${o.nome.toLowerCase()}".`,
  corpo: o.resposta,
  cta: o.pergunta,
}));

export const MATERIAIS: Material[] = [
  ...PRIMEIRO_CONTATO,
  ...FOLLOW_UP,
  ...DE_OBJECOES,
  ...DIAGNOSTICO,
  ...PROPOSTAS,
];

/* ════════════════════════ variáveis ════════════════════════ */

export type ValoresVariaveis = Partial<
  Record<
    | "nome_empresa"
    | "cidade"
    | "categoria"
    | "telefone"
    | "instagram"
    | "site"
    | "sistema"
    | "dor"
    | "processo"
    | "nome_contato",
    string | null | undefined
  >
>;

/**
 * Preenche o material com os dados REAIS do lead.
 *
 * A regra que manda aqui: variável sem valor não vira "[informação não
 * encontrada]" nem placeholder nenhum. A LINHA inteira que dependia dela sai.
 *
 * O motivo é prático. "Vi que vocês atendem em [informação não encontrada]" é
 * pior que não mandar nada — denuncia automação e queima a abordagem. Já uma
 * mensagem com uma frase a menos continua sendo uma mensagem que faz sentido.
 *
 * Quando a remoção esvazia o texto todo, devolvemos `null`: é a forma de dizer
 * "não há dados suficientes para este material", e quem chama decide o que
 * fazer — nunca mandar assim mesmo.
 */
export function preencher(texto: string, valores: ValoresVariaveis): string | null {
  const linhas = texto.split("\n");
  const mantidas: string[] = [];

  for (const linha of linhas) {
    const usadas = [...linha.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
    const faltando = usadas.some((v) => {
      const valor = valores[v as keyof ValoresVariaveis];
      return !valor || !String(valor).trim();
    });
    if (faltando) continue;

    mantidas.push(
      linha.replace(/\{([a-z_]+)\}/g, (_, v: string) =>
        String(valores[v as keyof ValoresVariaveis] ?? "").trim(),
      ),
    );
  }

  const resultado = mantidas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return resultado.length > 0 ? resultado : null;
}

/** Quais variáveis um texto exige — para a tela avisar o que falta. */
export function variaveisDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
}

export function materialPorId(id: string): Material | undefined {
  return MATERIAIS.find((m) => m.id === id);
}
