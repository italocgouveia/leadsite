import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, leads, buscas } from "@/lib/db";
import { buscarNoOsm, linkMapa } from "@/lib/osm/search";
import { linkWhatsapp, formatarTelefone } from "@/lib/telefone";
import { auditarSite, calcularScore } from "@/lib/places/audit";

export const maxDuration = 120;

const Body = z.object({
  nicho: z.string().min(2),
  cidade: z.string().min(2),
  estado: z.string().min(2),
  bairro: z.string().optional(),
  quantidade: z.number().int().min(1).max(60).default(20),
});

export async function POST(request: Request) {
  let params;
  try {
    params = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Parâmetros inválidos" }, { status: 400 });
  }

  let resultado;
  try {
    resultado = await buscarNoOsm(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na busca";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  if (!resultado.lugares.length) {
    return NextResponse.json({
      leads: [],
      buscaPorNome: resultado.buscaPorNome,
      totalEncontrado: resultado.totalEncontrado,
      totalContatavel: resultado.totalContatavel,
      aviso: resultado.totalEncontrado
        ? `Achei ${resultado.totalEncontrado} estabelecimento(s) desse nicho, mas nenhum tem telefone, Instagram ou e-mail no OpenStreetMap — não daria pra abordar. Tente outro nicho ou outra cidade.`
        : "Nenhum negócio mapeado no OpenStreetMap para esse nicho/cidade. Tente um nicho mais comum, a cidade inteira sem bairro, ou cadastre o lead manualmente.",
    });
  }

  // A auditoria bate em cada site — paraleliza, senão 20 leads viram 20 x 8s.
  const auditados = await Promise.all(
    resultado.lugares.map(async (lugar) => {
      // false = OSM não afirma ausência de site (ver lib/places/audit.ts)
      const auditoria = await auditarSite(lugar.website, false);
      // Formata e DESCARTA número inválido: melhor sem telefone que com
      // um link de WhatsApp que abre em "número inexistente".
      const telefone = formatarTelefone(lugar.telefone);

      const { score, temperatura } = calcularScore({
        status: auditoria.status,
        nota: null, // OSM não tem avaliação
        avaliacoes: null,
        temTelefone: Boolean(telefone),
        cadastroCompleto: Boolean(lugar.endereco && lugar.categoria),
      });

      return {
        placeId: `osm:${lugar.osmId}`,
        nome: lugar.nome,
        categoria: lugar.categoria ?? params.nicho,
        endereco: lugar.endereco ?? null,
        cidade: params.cidade,
        estado: params.estado,
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
        nota: null,
        avaliacoes: null,
        lat: lugar.lat ?? null,
        lng: lugar.lng ?? null,
        mapsUrl: linkMapa(lugar) ?? null,
        fotos: [] as string[],
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

  return NextResponse.json({
    leads: salvos,
    buscaPorNome: resultado.buscaPorNome,
    totalEncontrado: resultado.totalEncontrado,
    totalContatavel: resultado.totalContatavel,
    // Explica o número: você pediu 20 e recebeu 4 porque só 4 dos 51 mapeados
    // têm contato. Sem isso, parece que a busca falhou.
    aviso: resultado.buscaPorNome
      ? "Esse nicho não tem categoria própria no OpenStreetMap, então busquei pelo nome do estabelecimento. O resultado costuma vir menor."
      : salvos.length < params.quantidade
        ? `${resultado.totalEncontrado} estabelecimento(s) desse nicho estão mapeados na cidade, mas só ${resultado.totalContatavel} têm telefone, Instagram ou e-mail. Mostro apenas os que dá pra abordar.`
        : null,
  });
}
