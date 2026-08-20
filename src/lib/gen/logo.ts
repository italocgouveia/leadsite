import type { Lead } from "@/lib/db/schema";
import { gerarTexto } from "./cliente";

/**
 * Logo em SVG, não em PNG.
 *
 * Claude não gera imagem raster — gera código. Pra logo isso é vantagem, não
 * limitação: SVG escala sem pixelar, funciona em fachada e em favicon, o cliente
 * pode mudar a cor depois, e entra direto no HTML do site sem hospedar arquivo.
 * Se um dia você quiser logo com textura/foto, aí sim precisa de um modelo de
 * imagem (Gemini, DALL·E) — outra API, outro custo.
 */

const SISTEMA = `Você desenha logos em SVG para pequenos negócios brasileiros.

REGRAS TÉCNICAS:
- Devolva SOMENTE o SVG, de <svg até </svg>. Nada antes, nada depois, sem markdown.
- viewBox="0 0 240 240". Sem width/height fixos (quem usa define o tamanho).
- Tudo em <path>, <circle>, <rect>, <text>. Sem <image>, sem <foreignObject>,
  sem CSS externo, sem @font-face — precisa renderizar em qualquer lugar.
- Texto: use <text> com font-family de fonte segura (Arial, Georgia, Verdana,
  'Trebuchet MS'). Fonte customizada não carrega em SVG isolado.
- Máximo 4 cores. Defina cada uma como valor hex direto no atributo fill.
- Funciona em 32x32px: nada de detalhe fino que some quando reduz.

REGRAS DE DESENHO:
- Símbolo geométrico simples + nome do negócio. Não desenhe cena, mascote
  detalhado ou ilustração — logo não é ilustração.
- O símbolo deve remeter ao ramo sem ser óbvio demais (tesoura pra barbearia é
  clichê; um formato que sugira corte/precisão é melhor).
- Paleta que combine com o ramo: clínica não usa a cor de pizzaria.
- Se o nome for longo, quebre em duas linhas ou use só a palavra principal.
- Contraste alto entre símbolo e fundo. Assuma fundo branco.`;

export type ResultadoLogo = { svg: string; conceito: string };

export async function gerarLogo(lead: Lead, direcao?: string): Promise<ResultadoLogo> {
  const briefing = [
    `Negócio: ${lead.nome}`,
    `Ramo: ${lead.categoria ?? "não informado"}`,
    `Cidade: ${lead.cidade ?? ""}`,
    direcao ? `Direção pedida pelo cliente: ${direcao}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const texto = await gerarTexto({
    sistema: SISTEMA,
    entrada: `Desenhe o logo deste negócio:\n\n${briefing}\n\nAntes do SVG, escreva UMA linha começando com "CONCEITO:" explicando a ideia. Depois, o SVG puro.`,
    maxTokens: 8000,
    raciocinio: "medium",
  });

  const conceito = texto.match(/CONCEITO:\s*(.+)/)?.[1]?.trim() ?? "";

  const inicio = texto.indexOf("<svg");
  const fim = texto.lastIndexOf("</svg>");
  if (inicio === -1 || fim === -1) {
    throw new Error("O modelo não devolveu um SVG válido");
  }

  return { svg: texto.slice(inicio, fim + 6), conceito };
}
