import type { Lead, TipoScript } from "@/lib/db/schema";
import { gerarTexto } from "./cliente";

const ROTULO_STATUS: Record<string, string> = {
  "sem-site": "não tem site nenhum",
  "so-rede-social": "só tem Instagram/Facebook, sem site",
  "so-agregador": "só tem um link de agregador (Linktree, cardápio digital ou diretório)",
  "site-fora-do-ar": "tem um site cadastrado no Google, mas ele está fora do ar",
  "sem-ssl": "tem site, mas sem HTTPS — o navegador mostra 'não seguro'",
  "tem-site": "já tem site próprio funcionando",
};

const BASE = `Você escreve abordagem comercial para um freelancer brasileiro que vende
sites para pequenos negócios locais.

CONTEXTO REAL: o dono do negócio NÃO pediu nada e não conhece quem está falando.
É abordagem fria. Ele recebe dezenas de mensagens de vendedor por semana e o
polegar dele está a meio segundo de arquivar a conversa.

O QUE FUNCIONA:
- Falar do NEGÓCIO dele, não do seu serviço. Citar algo específico e verificável
  (a nota no Google, o número de avaliações, o bairro) prova que você olhou.
- Ser curto. Mensagem longa de desconhecido não é lida.
- Uma pergunta fácil de responder no final, não um pitch fechado.
- Português falado, do jeito que brasileiro escreve no WhatsApp.

O QUE ENTREGA QUE É MENSAGEM DE ROBÔ (nunca faça):
- "Espero que esteja bem", "tudo bem?", "venho por meio desta", "sou especialista em"
- Travessão (—) no meio da frase. Ninguém digita travessão no WhatsApp.
- Frase com paralelismo bonito: "não é só um site, é sua vitrine 24 horas".
- Toda construção "mais que X, é Y" e "não apenas X, mas Y".
- Vírgula perfeita, pontuação impecável, zero abreviação. Gente real escreve
  "vc", "tô", "pra", começa frase com "e" e às vezes esquece a vírgula.
- Três parágrafos separados por linha em branco. Mensagem fria é curta e corrida.
- Emoji decorativo em excesso, CAPS LOCK, "‼️", "🔥🔥🔥". Um emoji no fim, no máximo.
- Prometer resultado numérico ("triplique suas vendas", "primeiro lugar no Google")
- Template com [NOME DA EMPRESA] ou qualquer colchete
- Inventar dado que você não tem (faturamento, concorrente, quantos clientes perde)
- Falar de preço antes de ele demonstrar interesse
- Terminar com "Fico no aguardo!" ou "Qualquer dúvida, estou à disposição."

COMO SOAR HUMANO:
- Escreva como se estivesse digitando no celular, com pressa, mas educado.
- Uma ideia por mensagem. Curto de verdade: 2 a 4 linhas.
- Pode começar direto pelo assunto, sem saudação elaborada. "Oi, tudo certo?"
  já basta — ou nem isso.
- A pergunta do final tem que ser fácil de responder com uma palavra.
- Contração é natural: "tô", "pra", "cê" dependendo da região. Não force gíria.

Escreva só o texto final, pronto pra copiar e colar. Sem título, sem explicação,
sem markdown, sem aspas em volta.`;

const INSTRUCOES: Record<TipoScript, string> = {
  whatsapp: `Escreva a PRIMEIRA mensagem de WhatsApp. Máximo 4 linhas curtas.
Abre citando algo real do negócio dele, conecta com a oportunidade em uma frase,
e termina com uma pergunta simples de sim/não. Se existe link de prévia do site,
mencione que já fez uma prévia e que pode mandar — sem colar o link ainda, isso
cria a resposta. Nada de se apresentar com currículo.`,

  ligacao: `Escreva um ROTEIRO DE LIGAÇÃO em tópicos curtos:
1. Abertura (15 segundos — quem você é e por que está ligando, sem enrolar)
2. Pergunta de diagnóstico (2 ou 3, pra ele falar mais que você)
3. Ponte para a oportunidade (conectando o que ele falou)
4. Fechamento pedindo só o próximo passo (mandar a prévia / marcar 15 min)
5. Três respostas prontas para as objeções mais prováveis desse ramo
Escreva do jeito que se fala, não do jeito que se escreve.`,

  reuniao: `Escreva um ROTEIRO DE REUNIÃO de 20 minutos:
1. Quebra-gelo e alinhamento de expectativa (2 min)
2. Diagnóstico — perguntas que fazem ele mesmo perceber o problema (7 min)
3. Apresentação da prévia do site, ligando cada parte a uma dor que ele citou (6 min)
4. Investimento — como apresentar o preço à vista e a manutenção mensal (3 min)
5. Fechamento e definição do próximo passo com data (2 min)
Inclua as perguntas exatas para fazer, não descrições genéricas.`,

  objecao: `Escreva RESPOSTAS PARA OBJEÇÕES DE FECHAMENTO. Cubra as 6 mais comuns
nesse tipo de negócio, incluindo obrigatoriamente:
- "Tá caro" / "não tenho verba agora"
- "Vou pensar" / "me manda por WhatsApp que eu vejo depois"
- "Meu Instagram já resolve, não preciso de site"
- "Meu sobrinho/primo faz pra mim"
Para cada uma: a objeção, o que ela REALMENTE significa, e a resposta em até
3 frases. Sem técnica de pressão, sem falsa escassez.`,
};

export async function gerarScript(
  lead: Lead,
  tipo: TipoScript,
  urlPrevia?: string | null,
): Promise<string> {
  const contexto = [
    `Negócio: ${lead.nome}`,
    `Ramo: ${lead.categoria ?? "não informado"}`,
    `Local: ${lead.bairro ? `${lead.bairro}, ` : ""}${lead.cidade ?? ""}${lead.estado ? `/${lead.estado}` : ""}`,
    `Presença online: ${ROTULO_STATUS[lead.statusSite] ?? lead.statusSite}`,
    lead.nota != null
      ? `Google: nota ${lead.nota} com ${lead.avaliacoes ?? 0} avaliações`
      : "Sem avaliações no Google (não invente prova social)",
    urlPrevia ? `Prévia do site já pronta: ${urlPrevia}` : "Prévia do site ainda não foi gerada",
  ].join("\n");

  return gerarTexto({
    sistema: BASE,
    entrada: `${INSTRUCOES[tipo]}\n\nO negócio:\n${contexto}`,
    maxTokens: 8000,
    raciocinio: "medium",
  });
}
