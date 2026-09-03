import { sql } from "drizzle-orm";
import { db, leads, buscas } from "@/lib/db";
import {
  buscarNoOsm,
  linkMapa,
  type BuscaOsmParams,
  type BuscaOsmResultado,
} from "@/lib/osm/search";
import { linkWhatsapp, formatarTelefone } from "@/lib/telefone";
import { siglaDoEstado } from "@/lib/categoria-nome";
import { auditarSite, calcularScore } from "@/lib/places/audit";

/**
 * Busca no OSM, audita cada site e grava no banco.
 *
 * Extraído de `/api/leads/search` para ter UM lugar só que faz isso — a rota
 * chama esta função, e qualquer coleta em lote (script, cron, o que vier)
 * chama a mesma. Duas cópias da mesma sequência busca→audita→grava é o tipo
 * de duplicação que diverge sem ninguém perceber: uma delas ganha um ajuste
 * de campo e a outra fica para trás, gravando lead incompleto em silêncio.
 */
export async function buscarEGravar(
  params: BuscaOsmParams & { cidade: string; estado: string },
  /**
   * Quem faz a consulta. Por padrão a busca por cidade.
   *
   * A busca por cachoeira injeta a dela aqui em vez de duplicar todo o
   * caminho auditar→pontuar→upsert, que é onde mora a lógica sensível
   * (preservar horário digitado à mão, não sobrescrever etapa do funil).
   */
  buscador: (p: BuscaOsmParams) => Promise<BuscaOsmResultado> = buscarNoOsm,
) {
  const resultado = await buscador(params);

  if (!resultado.lugares.length) {
    return {
      salvos: [] as (typeof leads.$inferSelect)[],
      buscaPorNome: resultado.buscaPorNome,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
    };
  }

  // A auditoria bate em cada site — paraleliza, senão 20 leads viram 20 x 8s.
  const auditados = await Promise.all(
    resultado.lugares.map(async (lugar) => {
      // false = OSM não afirma ausência de site (ver lib/places/audit.ts)
      const auditoria = await auditarSite(lugar.website, false);
      // Formata e DESCARTA número inválido: melhor sem telefone que com
      // um link de WhatsApp que abre em "número inexistente".
      const telefone = formatarTelefone(lugar.telefone);

      /**
       * Nota e avaliações só existem quando a fonte é o Google Places — o
       * OSM não tem avaliação nenhuma e deixa os dois `undefined`. Passar o
       * valor real aqui importa: a nota é o sinal mais forte da pontuação
       * (ver lib/pontuacao.ts) e é a ÚNICA prova social que a mensagem de
       * abordagem pode citar sem inventar (ver lib/gen/mensagem-prospeccao.ts).
       */
      const nota = lugar.nota ?? null;
      const avaliacoes = lugar.avaliacoes ?? null;

      const { score, temperatura } = calcularScore({
        status: auditoria.status,
        nota,
        avaliacoes,
        temTelefone: Boolean(telefone),
        cadastroCompleto: Boolean(lugar.endereco && lugar.categoria),
      });

      return {
        // `idExterno` vem preenchido pelo adaptador do Places; sem ele, OSM.
        placeId: lugar.idExterno ?? `osm:${lugar.osmId}`,
        nome: lugar.nome,
        categoria: lugar.categoria ?? params.nicho,
        endereco: lugar.endereco ?? null,
        // O município do próprio lead vence: numa busca por estado, cada um
        // fica numa cidade diferente. Ver `cidade` em LugarOsm.
        cidade: lugar.cidade ?? params.cidade,
        // Idem cidade: o raio da busca por cachoeira cruza divisa de estado.
        // Sempre como sigla — ver `siglaDoEstado`.
        estado: siglaDoEstado(lugar.estado ?? params.estado),
        bairro: lugar.bairro ?? params.bairro ?? null,
        telefone,
        whatsapp: linkWhatsapp(telefone),
        website: lugar.website ?? null,
        instagram: lugar.instagram ?? null,
        facebook: lugar.facebook ?? null,
        email: lugar.email ?? null,
        // Horário vindo do OSM já é dado real — alimenta a seção do site.
        horarios: lugar.horarios ?? null,
        dadosOsm: lugar.extras ?? {},
        nota,
        avaliacoes,
        lat: lugar.lat ?? null,
        lng: lugar.lng ?? null,
        // O Places já entrega a URL do mapa pronta; o OSM a gente monta.
        mapsUrl: lugar.mapsUrl ?? linkMapa(lugar) ?? null,
        fotos: lugar.fotos ?? ([] as string[]),
        statusSite: auditoria.status,
        score,
        temperatura,
      };
    }),
  );

  // Upsert por placeId: rodar a mesma busca de novo atualiza, não duplica.
  // Preserva etapa/notas do funil — você não perde trabalho já feito no CRM.
  const salvos = await db
    .insert(leads)
    .values(auditados)
    .onConflictDoUpdate({
      target: leads.placeId,
      set: {
        telefone: sql`excluded.telefone`,
        whatsapp: sql`excluded.whatsapp`,
        website: sql`excluded.website`,
        instagram: sql`excluded.instagram`,
        facebook: sql`excluded.facebook`,
        email: sql`excluded.email`,
        // Dados brutos do mapa: sempre atualiza, é só espelho do OSM.
        dadosOsm: sql`excluded.dados_osm`,
        // Horário NÃO sobrescreve: se você digitou o horário real do dono,
        // uma rebusca no OSM não pode apagar. Só preenche quando está vazio.
        horarios: sql`coalesce(${leads.horarios}, excluded.horarios)`,
        statusSite: sql`excluded.status_site`,
        score: sql`excluded.score`,
        temperatura: sql`excluded.temperatura`,
        atualizadoEm: new Date(),
      },
    })
    .returning();

  await db.insert(buscas).values({
    termo: params.nicho,
    cidade: `${params.cidade}/${params.estado}`,
    encontrados: salvos.length,
    novos: salvos.length,
    chamadasApi: 0, // OSM é grátis — nada a contabilizar
  });

  return {
    salvos,
    buscaPorNome: resultado.buscaPorNome,
    totalEncontrado: resultado.totalEncontrado,
    totalContatavel: resultado.totalContatavel,
  };
}
