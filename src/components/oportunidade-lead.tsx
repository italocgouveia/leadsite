"use client";

import Link from "next/link";
import type { Lead } from "@/lib/db/schema";
import { avaliarOportunidadeComercial } from "@/lib/oportunidade-comercial";
import { probabilidadeComercial, ROTULO_CLASSIFICACAO } from "@/lib/probabilidade";
import { avaliarSistema, modulosLegiveis } from "@/lib/sistemas";
import { instagramDoLead, temSiteProprio, ROTULO_CANAL, canalDoLead } from "@/lib/canais";
import { alcanceDoLead, ROTULO_ALCANCE } from "@/lib/territorio";
import { linkWhatsapp, telefoneDoLead, validarTelefone } from "@/lib/telefone";
import { validarComProcedencia, type OrigemTelefone } from "@/lib/telefone-procedencia";
import { Etiqueta, FatoEInferencia } from "@/components/central";
import PrepararAbordagem from "@/components/preparar-abordagem";
import AssistenteLead from "@/components/assistente-lead";
import AnaliseSite from "@/components/analise-site";

/**
 * O BLOCO COMERCIAL DO LEAD — §28 da operação.
 *
 * Responde, num lugar só: o que eu vendo para esta empresa, por que ela, o que
 * me impede, e qual é o próximo passo.
 *
 * POR QUE ELE USA `avaliarOportunidadeComercial`
 *
 * A página do lead calculava seu próprio veredito com `avaliar()` de
 * `lib/oportunidade.ts`, que é a régua antiga. Duas réguas sobre o mesmo lead
 * é como o painel e a campanha divergiram antes: a tela dizia uma coisa e a
 * fila fazia outra. Aqui só se LÊ o veredito — nenhuma regra nova nasce nesta
 * pasta.
 *
 * A avaliação roda sem contexto de funil (sem histórico e sem configuração),
 * então os bloqueios de recontato e de mensagem viva não aparecem. É
 * deliberado: esta tela responde "esta empresa vale a pena?", e a pergunta
 * "posso mandar agora?" é da fila, que a revalida no servidor de qualquer
 * jeito.
 */
export default function OportunidadeLead({ lead }: { lead: Lead }) {
  const o = avaliarOportunidadeComercial(lead);
  const prob = probabilidadeComercial(lead);
  const encaixe = avaliarSistema(lead);
  const ig = instagramDoLead(lead);
  const tel = telefoneDoLead(lead);
  const validado = validarTelefone(tel);
  const procedencia = validarComProcedencia(tel, {
    origem: (lead.telefoneOrigem as OrigemTelefone | null) ?? "cadastro",
    uf: lead.estado,
  });
  const wa = linkWhatsapp(tel);
  const site = temSiteProprio(lead) ? lead.website : null;

  const fatos = prob.positivos.filter((m) => m.tipo === "fato").map((m) => m.texto);
  const inferencias = prob.positivos.filter((m) => m.tipo === "inferencia").map((m) => m.texto);

  /**
   * O PRÓXIMO PASSO, e ele é uma consequência do que já foi apurado — não um
   * palpite. A ordem importa: canal automático antes de manual, manual antes
   * de enriquecimento, e nada antes de haver o que vender.
   */
  const proximoPasso = !encaixe.serve
    ? "Nada a vender aqui: nenhuma solução da ICG Tech se encaixa neste ramo."
    : o.canal === "nenhum"
      ? "Enriquecer antes de abordar — a empresa é boa, mas não há por onde falar com ela."
      : o.canal === "site"
        ? "Abrir o site e procurar WhatsApp ou Instagram. É por aí que o canal aparece."
        : o.canal === "instagram"
          ? "Abordar pelo Instagram, à mão. Este lead não entra em campanha automática."
          : o.elegivel
            ? "Pronto para campanha de WhatsApp, ou aborde à mão agora mesmo."
            : `Resolver antes: ${o.bloqueios[0]}`;

  return (
    <section className="cartao surgir mb-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
          Oportunidade comercial
        </p>
        <span className="text-[12.5px] tabular-nums text-[var(--texto-3)]">
          prioridade <strong className="text-[var(--acao)]">{prob.pontos}/100</strong>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Etiqueta tom={o.classificacao === "quero-vender" ? "bom" : "neutro"}>
          {ROTULO_CLASSIFICACAO[o.classificacao]}
        </Etiqueta>
        <Etiqueta tom={o.elegivel ? "acao" : "neutro"}>{ROTULO_CANAL[canalDoLead(lead)]}</Etiqueta>
        <Etiqueta>{ROTULO_ALCANCE[alcanceDoLead(lead)]}</Etiqueta>
        {validado && (
          <Etiqueta
            tom={procedencia.possivelWhatsapp ? "acao" : "neutro"}
            titulo={procedencia.motivos.join(" · ")}
          >
            {validado.tipo === "celular" ? "📱 possível celular" : "📞 telefone fixo"} ·{" "}
            {procedencia.confianca}% de confiança
          </Etiqueta>
        )}
      </div>

      {/* ───────────────── o que eu vendo ───────────────── */}
      {encaixe.serve ? (
        <div className="mt-4">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            💰 O que eu vendo
          </p>
          <p className="mt-1 text-[15px] font-medium">{encaixe.sistema}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--texto-3)]">
            {modulosLegiveis(encaixe.modulos)}
          </p>
          {/**
           * Faixa de preço NÃO aparece: não existe tabela de preço por solução
           * no sistema. Mostrar um valor aqui seria inventá-lo, e um número
           * inventado numa proposta é pior que nenhum.
           */}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-[var(--texto-3)]">
          Nenhuma solução da ICG Tech se encaixa neste ramo.
        </p>
      )}

      {/* ───────────────── a dor ───────────────── */}
      {prob.dor.tipo !== "nenhuma" && (
        <div className="mt-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            💡 {prob.dor.tipo === "confirmada" ? "Dor confirmada pelo cliente" : "Dor provável"}
          </p>
          <p
            className={`mt-1 text-[13px] ${
              prob.dor.tipo === "confirmada" ? "text-[var(--verde)]" : "text-[var(--texto-2)]"
            }`}
          >
            {prob.dor.texto}
          </p>
          {prob.dor.tipo === "provavel" && (
            <p className="mt-0.5 text-[11.5px] text-[var(--texto-3)]">
              hipótese sustentada por: {prob.dor.sinais.join(", ")} — não afirme isso antes de
              perguntar
            </p>
          )}
        </div>
      )}

      {/* ─────────── por que abordar: fato × inferência ─────────── */}
      <div className="mt-4">
        <FatoEInferencia fatos={fatos} inferencias={inferencias} />
      </div>

      {/* ───────────────── o que impede ───────────────── */}
      {o.bloqueios.length > 0 && (
        <div className="mt-3.5">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
            {o.bloqueioTemporario ? "⏳ Bloqueio temporário" : "🚫 Bloqueios"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {o.bloqueios.map((b) => (
              <li key={b} className="text-[12px] text-[var(--texto-3)]">
                • {b}
              </li>
            ))}
          </ul>
          {o.bloqueioTemporario && (
            <p className="mt-1 text-[11.5px] text-[var(--texto-3)]">
              Nada aqui é sobre a qualidade da empresa — ela volta à fila sozinha.
            </p>
          )}
        </div>
      )}

      {/* ───────────────── próximo passo ───────────────── */}
      <div className="mt-4 rounded-[10px] bg-[var(--superficie)] px-3.5 py-3">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--texto-3)]">
          Próximo passo
        </p>
        <p className="mt-1 text-[13px] text-[var(--texto-2)]">{proximoPasso}</p>
      </div>

      {/* ───────────────── ações ───────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primario">
            ABRIR WHATSAPP
          </a>
        )}
        {ig && (
          <a href={ig.url} target="_blank" rel="noopener noreferrer" className="btn-secundario">
            @{ig.username}
          </a>
        )}
        {site && (
          <a href={site} target="_blank" rel="noopener noreferrer" className="btn-secundario">
            ABRIR SITE
          </a>
        )}
        <Link href="/prospeccao" className="btn-secundario">
          COMO ABORDAR
        </Link>
        <PrepararAbordagem lead={lead} />
        <AssistenteLead leadId={lead.id} />
        <AnaliseSite leadId={lead.id} temSite={Boolean(site)} />
        <Link href="/cacada" className="btn-secundario">
          ENCONTRAR CLIENTES
        </Link>
      </div>
    </section>
  );
}
