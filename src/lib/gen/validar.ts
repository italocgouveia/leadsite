import type { Lead } from "@/lib/db/schema";
import { detectarCliches, detectarHorarios, detectarDepoimentos } from "./deteccao";

/**
 * Validação pós-geração do HTML.
 *
 * POR QUE ISSO EXISTE: o prompt proíbe inventar dados, e mesmo assim o modelo
 * inventou. Num teste com lead SEM telefone, ele gerou seis botões apontando
 * para `wa.me/5534999999999` — número falso, botão morto. Se esse link chega no
 * dono do negócio, a venda morre ali.
 *
 * Instrução em prompt é pedido; verificação em código é garantia. Tudo que
 * puder ser conferido contra o dado real do lead é conferido aqui.
 */

export type Problema = {
  tipo:
    | "telefone-inventado"
    | "email-inventado"
    | "imagem-quebrada"
    | "sem-cta"
    | "cara-de-ia"
    | "horario-inventado"
    | "depoimento-inventado";
  descricao: string;
  /** true = consertado automaticamente; false = você precisa olhar. */
  corrigido: boolean;
};

export type ResultadoValidacao = {
  html: string;
  problemas: Problema[];
};

/** Números que ninguém tem: 999999999, 000000000, 123456789… */
function pareceFalso(digitos: string): boolean {
  const semDdi = digitos.replace(/^55/, "");
  if (/^(\d)\1+$/.test(semDdi)) return true; // todos os dígitos iguais
  if (/(\d)\1{5,}/.test(semDdi)) return true; // 6+ repetições seguidas
  if (semDdi.includes("123456") || semDdi.includes("000000")) return true;
  return false;
}

export function validarSite(html: string, lead: Lead): ResultadoValidacao {
  const problemas: Problema[] = [];
  let saida = html;

  // --- Telefone / WhatsApp ---
  const numeroReal = lead.whatsapp?.match(/wa\.me\/(\d+)/)?.[1] ?? null;
  const linksWa = [...html.matchAll(/wa\.me\/(\d+)/g)].map((m) => m[1]);
  const inventados = [...new Set(linksWa)].filter(
    (n) => n !== numeroReal && (!numeroReal || pareceFalso(n)),
  );

  if (inventados.length) {
    if (numeroReal) {
      // Temos o número certo: troca os errados pelo verdadeiro.
      for (const falso of inventados) {
        saida = saida.replaceAll(`wa.me/${falso}`, `wa.me/${numeroReal}`);
      }
      problemas.push({
        tipo: "telefone-inventado",
        descricao: `O modelo usou ${inventados.length} número(s) inventado(s). Substituí pelo telefone real do lead.`,
        corrigido: true,
      });
    } else {
      // Sem número real: qualquer wa.me é invenção. Neutraliza o link e deixa
      // visível que falta preencher, em vez de entregar um botão morto.
      saida = saida.replace(
        /href="https?:\/\/(?:api\.whatsapp\.com|wa\.me)\/[^"]*"/g,
        'href="#" data-falta-whatsapp="true"',
      );
      problemas.push({
        tipo: "telefone-inventado",
        descricao:
          "Este lead não tem telefone e o modelo inventou um. Desativei os botões de WhatsApp — descubra o número e edite o site antes de enviar.",
        corrigido: false,
      });
    }
  }

  // --- E-mail ---
  // Nenhum lead tem e-mail no banco, então qualquer um é invenção.
  const emails = [...new Set([...html.matchAll(/mailto:([^"'\s>]+)/g)].map((m) => m[1]))];
  if (emails.length) {
    saida = saida.replace(/href="mailto:[^"]*"/g, 'href="#" data-email-removido="true"');
    problemas.push({
      tipo: "email-inventado",
      descricao: `Removi ${emails.length} e-mail inventado (${emails[0]}).`,
      corrigido: true,
    });
  }

  // --- Imagens externas que não vieram do lead ---
  const imgs = [...html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const fotosDoLead = new Set(lead.fotos ?? []);
  const invalidas = imgs.filter((src) => !fotosDoLead.has(src));
  if (invalidas.length) {
    problemas.push({
      tipo: "imagem-quebrada",
      descricao: `${invalidas.length} imagem(ns) apontam para URL externa não fornecida — provavelmente vão quebrar. Confira a prévia.`,
      corrigido: false,
    });
  }

  // --- Depoimento inventado (o pior erro possível) ---
  const depoimentos = detectarDepoimentos(saida);
  if (depoimentos.length) {
    problemas.push({
      tipo: "depoimento-inventado",
      descricao: `O site tem depoimento de cliente, e nenhum é real: "${depoimentos[0]}". Remova antes de enviar — citação assinada por pessoa inexistente queima a venda.`,
      corrigido: false,
    });
  }

  // --- Horário de funcionamento inventado ---
  // Nenhum lead traz horário. Se apareceu no site, o modelo criou — e entregar
  // "de terça a sábado" pra quem abre segunda queima você na frente do cliente.
  const horarios = lead.horarios?.trim() ? [] : detectarHorarios(saida);
  if (horarios.length) {
    problemas.push({
      tipo: "horario-inventado",
      descricao: `O site afirma horário/dias que você não tem: "${horarios[0]}". Confirme com o dono ou remova no editor.`,
      corrigido: false,
    });
  }

  // --- Cara de IA ---
  // O prompt proíbe esses tiques, mas prompt é pedido, não garantia. Aqui a
  // gente mede: você vê o aviso e manda regerar antes de mostrar pro cliente.
  const cliches = detectarCliches(saida);
  if (cliches.length) {
    problemas.push({
      tipo: "cara-de-ia",
      descricao: `Texto com jeitão de IA (${cliches.length}): ${cliches.slice(0, 4).join("; ")}${cliches.length > 4 ? "…" : ""}. Regere ou ajuste no editor.`,
      corrigido: false,
    });
  }

  // --- Tem call-to-action? ---
  if (!/wa\.me|whatsapp|tel:/i.test(saida)) {
    problemas.push({
      tipo: "sem-cta",
      descricao: "O site não tem nenhum botão de contato. Peça no editor para adicionar.",
      corrigido: false,
    });
  }

  return { html: saida, problemas };
}

export { detectarCliches, detectarHorarios } from "./deteccao";
