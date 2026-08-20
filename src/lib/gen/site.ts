import type { Lead, ModeloSite } from "@/lib/db/schema";
import { gerarTexto } from "./cliente";

const SISTEMA = `Você cria sites de uma página para pequenos negócios brasileiros.

O site é uma PRÉVIA de vendas: o dono do negócio vai receber o link no WhatsApp
sem nunca ter pedido nada. Em 5 segundos ele precisa pensar "caramba, é o meu
negócio, ficou lindo". Se parecer template genérico, a venda morre.

REGRAS TÉCNICAS (obrigatórias):
- Devolva UM arquivo HTML completo, de <!DOCTYPE html> até </html>. Nada mais.
- Sem markdown, sem cercas de código, sem comentário antes ou depois do HTML.
- Tailwind via <script src="https://cdn.tailwindcss.com"></script>. Sem build.
- Fontes do Google Fonts via <link>. Escolha uma combinação que combine com o ramo.
- Responsivo de verdade: teste mental em 375px de largura.
- Ícones: SVG inline. Nunca use bibliotecas de ícone por CDN.
- Botão flutuante de WhatsApp fixo no canto inferior direito, verde #25D366,
  visível em todas as telas, com o link exato que eu fornecer.
- <title> e <meta name="description"> com o nome do negócio + cidade (SEO local).
- Inclua JSON-LD schema.org LocalBusiness com os dados reais fornecidos.

REGRAS DE CONTEÚDO:
- Use SOMENTE os dados reais que eu fornecer. Nome, telefone, endereço e nota
  precisam bater exatamente.

- NUNCA invente: e-mail, CNPJ, preço, horário de funcionamento, forma de
  pagamento, tempo de casa, nome de sócio, número de clientes.

- DEPOIMENTO É PROIBIDO, sem exceção. Não escreva citação de cliente, não crie
  nome ("Mariana, Uberlândia"), não invente nota individual, e JAMAIS escreva
  "cliente verificado". Você não tem um único depoimento real. Um depoimento
  falso assinado por uma pessoa que não existe é o erro mais grave possível
  aqui: se o dono do negócio percebe, a venda acaba e a reputação vai junto.
  A prova social permitida é UMA só: a nota e o número de avaliações do Google,
  quando eu fornecer.

- SEÇÃO SEM DADO NÃO EXISTE. Se eu não mandar preços, não crie a coluna de
  preço. Se não mandar horários, não escreva horário nenhum — nem "consulte
  nossos horários" como se houvesse uma tabela. Se não mandar formas de
  pagamento, não fale de pagamento. Site menor e verdadeiro vende mais que
  site cheio e inventado.
- Se o negócio tem nota e avaliações no Google, mostre como prova social real.
- Textos de serviço podem ser escritos por você, mas devem ser plausíveis para o
  ramo e genéricos o bastante para serem verdade. Na dúvida, seja menos específico.
- Mapa: SEMPRE inclua um <iframe> do Google Maps embed, no formato
  https://maps.google.com/maps?q=ENDERECO_OU_CIDADE_URLENCODED&output=embed
  Sem chave de API. Se não houver endereço, use a cidade.

=== NÃO PAREÇA FEITO POR IA — esta é a parte mais importante ===

O dono vai bater o olho e sentir se aquilo foi feito por gente ou cuspido por
robô. Sites gerados por IA têm tiques que qualquer um reconhece. Evite TODOS:

1. ETIQUETA EM CAIXA ALTA ACIMA DE CADA SEÇÃO.
   "O QUE FAZEMOS DE MELHOR", "QUEM SOMOS", "ONDE ESTAMOS", "NOSSOS DIFERENCIAIS".
   Site de verdade não tem isso em toda seção. Use no MÁXIMO uma vez no site
   inteiro, ou nenhuma. Prefira ir direto no título.

2. CARDS DE ESTATÍSTICA INVENTADA. Proibido, sem exceção.
   "100% DEDICAÇÃO", "+500 CLIENTES", "10 ANOS DE EXPERIÊNCIA", "PREMIUM
   PRODUTOS". Você não tem esses números. Inventar número é mentir, e número
   redondo bonitinho é a assinatura mais óbvia de texto gerado.
   Só mostre número se eu tiver fornecido (nota e avaliações do Google).

3. FRASE DE EFEITO COM PARALELISMO.
   "O visual que você merece, com a qualidade que você exige."
   "Não é só um corte, é uma experiência."
   "Muito mais que um salão: um estilo de vida."
   Toda construção "não é apenas X, é Y" e "mais que X, Y" está proibida.

4. PERGUNTA RETÓRICA COMO CHAMADA.
   "Pronto para transformar seu visual?", "Bora agendar?", "Que tal começar hoje?"
   Troque por uma frase afirmativa e direta, ou só o botão sozinho.

5. PALAVRA DE FOLHETO. Banidas:
   excelência, exclusividade, inovador, diferenciado, personalizado, sob medida,
   transformador, experiência única, o melhor do mercado, alto padrão, premium,
   referência na região, paixão pelo que fazemos, feito com amor, cuidado em
   cada detalhe, sua satisfação é nossa prioridade, atendimento humanizado.

6. PALAVRA DESTACADA EM COR NO MEIO DO TÍTULO DO HERO.
   Aquele efeito de uma palavra em gradiente/laranja no meio da frase é marca
   de template. Título inteiro na mesma cor.

7. NOME DE SERVIÇO INVENTADO COM AR DE PRODUTO.
   "Combo Imperial", "Ritual Premium", "Experiência Assinatura".
   Use o nome que o cliente usaria: "Corte e barba", "Escova", "Troca de óleo".

8. ANO ERRADO NO RODAPÉ.
   Você não sabe que ano é hoje e chuta o ano do seu treinamento. Rodapé com
   ano vencido grita "site abandonado". Ou escreva o ano que eu informar no
   briefing, ou não coloque ano nenhum — só o nome do negócio.

9. TEXTO LONGO DEMAIS.
   Negócio de bairro escreve pouco. Parágrafo de 4 linhas em site de barbearia
   não existe no mundo real. Seção "sobre" com 2 ou 3 frases resolve.

COMO ESCREVER NO LUGAR DISSO:
- Concreto vence abstrato. "Corte na tesoura, lavagem e finalização" é melhor
  que "cuidado em cada detalhe".
- Fale como um comerciante brasileiro falaria do próprio negócio, sem marketês.
  Tom natural, frases curtas, sem medo de ser simples.
- Se você não sabe algo (preço, horário, tempo de casa), NÃO contorne com frase
  vaga bonita. Diga que combina pelo WhatsApp, ou simplesmente não fale.
- Pode repetir palavra. Pode ter frase curta. Texto perfeito demais entrega.

VARIE A ESTRUTURA:
Não existe um esqueleto único. Nem todo site precisa de seção "sobre". Nem todo
site precisa de 4 cards de serviço — pode ser 3, pode ser uma lista simples, pode
ser só um parágrafo com os serviços no meio. Escolha o que faz sentido para ESTE
ramo e siga. Dois sites gerados por você não devem ter o mesmo formato.

DESIGN:
- Se eu fornecer fotos reais do estabelecimento, use-as no hero e nos cards.
  Se não fornecer, resolva com tipografia e espaço — NUNCA use <img> apontando
  para serviço de placeholder ou foto de estoque com URL inventada, porque quebram.

=== LINGUAGEM VISUAL ===

Editorial e caloroso. Tipografia grande e LEVE, cor de destaque quente, muito
respiro. Sem imagem nenhuma — o site se sustenta em tipo, cor e espaço.

TIPOGRAFIA:
- Fonte: Poppins do Google Fonts (pesos 300, 400, 500). Carregue via <link>.
- Título do hero: clamp(2.5rem, 6vw, 4rem), **font-weight 400** (não 600, não
  700 — leve mesmo), line-height 0.95, sem letter-spacing.
  Peso leve em corpo grande é o que dá o ar caro. Título grosso empobrece.
- Títulos de seção: 2.25rem, weight 400.
- Etiqueta acima do título de seção: 0.75rem, MAIÚSCULA, letter-spacing 0.18em,
  na cor de destaque. Use no MÁXIMO em 2 seções do site inteiro.
- Corpo: 1rem, line-height 1.7, na cor cinza secundária.

PALETA (3 cores + 2 neutros, sempre):
- Quase-preto: #141316 — fundo das seções escuras e texto principal
- Off-white: #fbfaf9 — fundo padrão do site (nunca branco puro)
- Cinza de texto: #73778c
- UMA cor de destaque quente, escolhida pelo ramo. Exemplos por tipo de negócio:
  salão/estética #eeb52f (dourado) · restaurante #c2410c (terracota) ·
  clínica #0f766e (verde profundo) · oficina #b45309 (âmbar) ·
  advocacia #7c2d3e (vinho) · pet #0369a1 (azul petróleo)
- Opcional: um segundo tom escuro da mesma família para detalhe.

RITMO DAS SEÇÕES — é o que faz parecer caro:
- 128px de padding vertical em cada seção (80px no mobile).
- Alterne: claro → claro → ESCURO (#141316, texto branco) → claro.
  Uma única seção escura no meio do site cria a dobra visual.
- Container 1120px, mas o texto corrido nunca passa de 65 caracteres por linha.

BOTÕES:
- radius 6px. Pequeno mesmo — não é pílula, não é quadrado.
- Primário: fundo na cor de destaque, texto #141316, padding 14px 28px,
  weight 500. Sem sombra, sem gradiente.
- Secundário: transparente, borda 1px na cor de destaque, texto na cor de destaque.

CARDS:
- Sem sombra. Borda 1px numa cor bem clara, ou apenas uma linha divisória entre
  os itens. radius 8px no máximo.
- Card de serviço: nome à esquerda, preço à direita na cor de destaque (SÓ se eu
  fornecer preço), descrição curta abaixo.

DETALHE QUE VALE MUITO:
Depois do hero, uma faixa fina mostrando a nota do Google em número grande na cor
de destaque, ao lado do texto "(N avaliações no Google)". Só se eu fornecer nota.`;

/**
 * O "site animado" é o upsell: mesmo conteúdo, movimento premium.
 * Vale cobrar mais caro, então a instrução é separada e explícita.
 */
const ANIMACAO = `

ESTE SITE É A VERSÃO ANIMADA (premium). Adicione movimento de verdade:
- Entrada dos elementos ao rolar a página, via IntersectionObserver + classes CSS.
  Nada de biblioteca externa de animação — CSS e JS puro.
- Hero com movimento sutil e contínuo (gradiente que desloca, forma que flutua).
- Micro-interação em todo elemento clicável (transform + transition no hover).
- Contadores que sobem quando entram na tela, se houver número pra mostrar.
- Transições de 200–600ms com easing (cubic-bezier), nunca linear.

LIMITES (animação ruim é pior que nenhuma):
- Nada de piscar, girar sem parar ou saltar. Movimento discreto e caro.
- Respeite @media (prefers-reduced-motion: reduce) desligando tudo.
- O conteúdo precisa aparecer mesmo se o JS falhar — anime a partir de um estado
  visível, ou garanta a classe final no load. Site em branco por causa de
  animação perde a venda.`;

function briefing(lead: Lead, fotos: string[]): string {
  const linhas = [
    `Nome: ${lead.nome}`,
    `Ramo: ${lead.categoria ?? "não informado"}`,
    `Cidade: ${lead.cidade ?? ""}${lead.estado ? ` - ${lead.estado}` : ""}`,
    lead.bairro ? `Bairro: ${lead.bairro}` : null,
    `Endereço completo: ${lead.endereco ?? "não informado"}`,
    lead.telefone ? `Telefone: ${lead.telefone}` : "Telefone: não informado",
    lead.whatsapp ? `Link do WhatsApp (use exatamente este): ${lead.whatsapp}` : null,
    lead.nota != null
      ? `Nota no Google: ${lead.nota} (${lead.avaliacoes ?? 0} avaliações) — use como prova social`
      : "Sem nota no Google — não invente prova social",
    fotos.length
      ? `Fotos reais do estabelecimento (use estas URLs):\n${fotos.map((f) => `  - ${f}`).join("\n")}`
      : "Sem fotos disponíveis — use gradientes/formas, não use <img> externa",
    // Dados que só o dono sabe. Quando vazios, a seção correspondente some.
    lead.precos
      ? `Preços REAIS (use exatamente estes, na seção de serviços):
${lead.precos}`
      : "SEM preços — não invente valor nem coluna de preço.",
    lead.horarios
      ? `Horário de funcionamento REAL (use exatamente este):
${lead.horarios}`
      : "SEM horário — não escreva dia nem hora em lugar nenhum do site.",
    lead.pagamento
      ? `Formas de pagamento REAIS: ${lead.pagamento}`
      : "SEM formas de pagamento — não fale de pagamento.",
    lead.diferenciais
      ? `Diferenciais informados pelo dono (use como base da seção de destaque):
${lead.diferenciais}`
      : null,
    "Não existem depoimentos. Não crie nenhum.",
    // O modelo não sabe a data e chuta o ano do treinamento no rodapé.
    `Ano corrente (use este, se usar ano no rodapé): ${new Date().getFullYear()}`,
  ].filter(Boolean);

  return linhas.join("\n");
}

/**
 * Sem isso, todo site sai com o mesmo esqueleto — e é justamente a repetição
 * que denuncia geração automática quando você mostra o terceiro site pro mesmo
 * bairro. Sorteamos uma direção por geração.
 */
/**
 * Variações DENTRO da linguagem Apple — a Apple mesma alterna entre página
 * clara, página escura e página com faixa colorida. Sem isso, todo site sai
 * idêntico e a repetição denuncia a geração automática.
 */
const DIRECOES_VISUAIS = [
  "Hero ESCURO (#141316) com título branco em peso 400, resto do site off-white. A dobra inicial impacta.",
  "Site todo off-white (#fbfaf9), com UMA seção escura no meio destacando os serviços.",
  "Hero off-white com o nome do negócio enorme e leve; seção de contato escura no fim.",
  "Hero escuro, faixa da nota do Google logo abaixo, serviços em lista com divisórias finas.",
  "Off-white do início ao fim, sem seção escura — separação só por espaço e linha fina.",
  "Hero escuro ocupando a tela inteira, com a cor de destaque só no botão e nos preços.",
];

const ESTRUTURAS = [
  "Hero → faixa com a nota do Google → serviços → contato com mapa → rodapé.",
  "Hero → serviços em lista com divisórias → seção escura com os diferenciais → contato e mapa → rodapé.",
  "Hero → serviços em grade de 3 colunas → faixa da nota → localização com mapa grande → rodapé.",
  "Hero ocupando a tela → serviços → contato em duas colunas (dados de um lado, mapa do outro) → rodapé.",
];

/**
 * O modelo "simples" existe por dois motivos: entrega mais rápida no dia a dia
 * e — o mais prático — é o único que costuma terminar dentro dos 60 segundos
 * que o plano Hobby da Vercel permite por requisição.
 */
const SIMPLES = `

ESTE É O MODELO SIMPLES. Enxugue:
- No máximo 4 seções: hero, serviços, localização e rodapé.
- Nada de seção "sobre" separada — se precisar, uma frase dentro do hero.
- Serviços em lista, não em cards elaborados.
- Menos texto ainda que o normal: o site inteiro cabe em 150 palavras.
- Mantenha o mapa e o botão de WhatsApp. O resto é dispensável.`;

export type OpcoesGeracao = {
  fotos?: string[];
  modelo?: ModeloSite;
  /** SVG do logo já gerado, pra embutir no header em vez de texto puro. */
  logoSvg?: string | null;
};

/** Geração inicial do site a partir dos dados do lead. */
export async function gerarSite(lead: Lead, opcoes: OpcoesGeracao = {}): Promise<string> {
  const { fotos = [], modelo = "completo", logoSvg = null } = opcoes;

  const sorteio = <T,>(lista: readonly T[]) => lista[Math.floor(Math.random() * lista.length)];

  const partes = [
    `Crie o site deste negócio:\n\n${briefing(lead, fotos)}`,
    ``,
    `Direção visual para ESTE site: ${sorteio(DIRECOES_VISUAIS)}`,
    `Estrutura para ESTE site: ${sorteio(ESTRUTURAS)}`,
    `Adapte ao ramo se fizer sentido, mas não repita o formato padrão de sempre.`,
  ];
  if (logoSvg) {
    partes.push(
      `\nLogo do negócio (embuta este SVG no header e no rodapé, ajustando só o tamanho):\n${logoSvg}`,
    );
  }

  const sistema =
    modelo === "animado"
      ? SISTEMA + ANIMACAO
      : modelo === "simples"
        ? SISTEMA + SIMPLES
        : SISTEMA;

  const texto = await gerarTexto({
    sistema,
    entrada: partes.join("\n"),
    // O simples pede menos e pensa menos — é o que faz caber nos 60s da Vercel.
    maxTokens: modelo === "simples" ? 20000 : 48000,
    raciocinio: modelo === "simples" ? "low" : "high",
  });

  return extrairHtml(texto);
}

/** Edição por conversa: manda o HTML atual + o pedido, recebe o HTML novo. */
export async function editarSite(
  htmlAtual: string,
  pedido: string,
  lead: Lead,
): Promise<string> {
  const texto = await gerarTexto({
    sistema: SISTEMA,
    entrada: [
      `Este é o site atual de ${lead.nome}:`,
      "",
      htmlAtual,
      "",
      `Pedido de alteração: ${pedido}`,
      "",
      "Aplique SOMENTE essa alteração e devolva o HTML completo novamente.",
      "Não mexa em nada que não foi pedido. Não invente dados novos.",
    ].join("\n"),
    maxTokens: 48000,
    raciocinio: "medium",
  });

  return extrairHtml(texto);
}

function extrairHtml(texto: string): string {
  // Cinto e suspensório: o prompt proíbe cerca de código, mas se vier, tiramos.
  const comCerca = texto.match(/```(?:html)?\s*([\s\S]*?)```/);
  const limpo = (comCerca ? comCerca[1] : texto).trim();

  const inicio = limpo.search(/<!DOCTYPE html>|<html/i);
  if (inicio === -1) {
    throw new Error("O modelo não devolveu HTML válido");
  }

  return limpo.slice(inicio);
}

/** Slug do subdomínio/URL pública: "Pizzaria do Zé" -> "pizzaria-do-ze" */
export function gerarSlug(nome: string, cidade?: string | null): string {
  const base = `${nome} ${cidade ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  // Sufixo curto evita colisão entre dois "Salão da Ana" na mesma cidade.
  const sufixo = Math.random().toString(36).slice(2, 6);
  return `${base}-${sufixo}`;
}
