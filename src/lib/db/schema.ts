import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Resultado do teste de cliente oculto. Ver lib/teste-oculto.ts. */
export type TesteOcultoSalvo = {
  enviadoEm: string;
  resultado: "sem-resposta" | "demorou" | "rapida" | null;
  minutos?: number;
  observacao?: string;
};

/** Sócio como fica salvo no lead — o que veio do QSA da Receita. */
export type SocioSalvo = {
  nome: string;
  qualificacao: string;
  /** Sócio-administrador, presidente, diretor: quem decide de fato. */
  decide: boolean;
};

/**
 * Um lead = um estabelecimento vindo do Google Places.
 * `placeId` é a chave natural do Google — usamos pra nunca duplicar
 * o mesmo negócio entre buscas diferentes.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: text("place_id").notNull(),

    nome: text("nome").notNull(),
    categoria: text("categoria"),
    endereco: text("endereco"),
    cidade: text("cidade"),
    estado: text("estado"),
    bairro: text("bairro"),

    telefone: text("telefone"),
    whatsapp: text("whatsapp"),
    website: text("website"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    email: text("email"),

    nota: real("nota"),
    avaliacoes: integer("avaliacoes"),

    lat: real("lat"),
    lng: real("lng"),
    mapsUrl: text("maps_url"),
    fotos: jsonb("fotos").$type<string[]>().default([]),
    /**
     * Tudo que o OSM traz e não cabe numa coluna: cuisine, brand, operator,
     * formas de pagamento, acessibilidade, CEP. Guardar tudo custa nada e é o
     * que te deixa conhecer o negócio antes de gerar o site.
     */
    dadosOsm: jsonb("dados_osm").$type<Record<string, string>>().default({}),

    // Resultado da auditoria de presença online (ver lib/places/audit.ts)
    statusSite: text("status_site").$type<StatusSite>().notNull(),
    score: integer("score").notNull().default(0),
    temperatura: text("temperatura").$type<Temperatura>().notNull().default("frio"),

    /**
     * Dados que a fonte NÃO fornece e que só o dono do negócio sabe.
     * Enquanto vazios, o site gerado omite a seção correspondente — em vez de
     * inventar preço, horário ou depoimento, que é o que estraga a venda.
     */
    precos: text("precos"),
    horarios: text("horarios"),
    pagamento: text("pagamento"),
    diferenciais: text("diferenciais"),

    /**
     * Dados públicos da Receita Federal.
     *
     * Existem por um motivo só: chegar no DONO. Falar com a recepção e pedir
     * "o responsável" mata a ligação; pedir a pessoa pelo nome, não.
     *
     * `socios` guarda o quadro societário já ordenado (quem administra
     * primeiro). Fica em jsonb porque a forma varia — de sócio único a sete —
     * e nada aqui é consultado por coluna.
     */
    cnpj: text("cnpj"),
    razaoSocial: text("razao_social"),
    socios: jsonb("socios").$type<SocioSalvo[]>(),
    /** Quando a consulta foi feita — dado da Receita envelhece. */
    receitaEm: timestamp("receita_em", { withTimezone: true }),

    /**
     * Teste de cliente oculto: você mandou uma pergunta de cliente e anotou o
     * que aconteceu. É o que autoriza a abordagem a AFIRMAR que o atendimento
     * demorou — sem este registro, o sistema se recusa a gerar essa mensagem.
     */
    testeOculto: jsonb("teste_oculto").$type<TesteOcultoSalvo>(),

    /** Você já abriu/analisou este lead. Serve pra separar novo de repetido. */
    visto: boolean("visto").notNull().default(false),
    /**
     * Entrou no funil por escolha sua.
     * Antes, TODO lead buscado aparecia no CRM e o funil virava lixo — a busca
     * traz 20 de uma vez e você só quer trabalhar alguns.
     */
    noCrm: boolean("no_crm").notNull().default(false),

    // Funil
    etapa: text("etapa").$type<Etapa>().notNull().default("novo"),
    notas: text("notas"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_place_id_idx").on(t.placeId),
    index("leads_etapa_idx").on(t.etapa),
    index("leads_no_crm_idx").on(t.noCrm),
    index("leads_status_site_idx").on(t.statusSite),
  ],
);

/**
 * Um site gerado para um lead. O HTML mora no banco — publicar é só
 * marcar `publicado` e servir em /s/[slug].
 */
export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    slug: text("slug").notNull(),
    html: text("html").notNull(),
    publicado: boolean("publicado").notNull().default(false),
    // "animado" virou um caso de `modelo`; mantido pra não quebrar linhas antigas.
    animado: boolean("animado").notNull().default(false),
    modelo: text("modelo").$type<ModeloSite>().notNull().default("completo"),
    // Domínio próprio apontado pra este site (null = usa /s/[slug])
    dominio: text("dominio"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sites_slug_idx").on(t.slug), index("sites_lead_idx").on(t.leadId)],
);

/**
 * Append-only: cada edição vira uma versão nova, nunca sobrescreve.
 * É o que permite o "Histórico de versões" com voltar atrás.
 */
export const siteVersions = pgTable(
  "site_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    versao: integer("versao").notNull(),
    html: text("html").notNull(),
    // O que foi pedido no chat pra gerar esta versão (null = geração inicial)
    prompt: text("prompt"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_versions_site_idx").on(t.siteId, t.versao)],
);

/** Scripts de abordagem gerados por lead (WhatsApp, ligação, objeção). */
export const scripts = pgTable(
  "scripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<TipoScript>().notNull(),
    conteudo: text("conteudo").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scripts_lead_idx").on(t.leadId)],
);

/** Logos gerados por IA. SVG porque escala sem perder qualidade e é editável. */
export const logos = pgTable(
  "logos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    svg: text("svg").notNull(),
    conceito: text("conceito"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("logos_lead_idx").on(t.leadId)],
);

/**
 * Configuração global do painel (linha única, id fixo = "default").
 * Marca d'água, pixels de rastreamento e domínio — tudo que é injetado
 * em TODO site gerado.
 */
export const configuracoes = pgTable("configuracoes", {
  id: text("id").primaryKey().default("default"),

  marcaDaguaAtiva: boolean("marca_dagua_ativa").notNull().default(true),
  marcaDaguaTexto: text("marca_dagua_texto").default("Feito com LeadSite"),
  marcaDaguaUrl: text("marca_dagua_url"),

  pixelFacebook: text("pixel_facebook"),
  googleAnalytics: text("google_analytics"),
  googleAds: text("google_ads"),

  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Log de consumo da Places API — pra você saber quanto está gastando. */
export const buscas = pgTable("buscas", {
  id: uuid("id").primaryKey().defaultRandom(),
  termo: text("termo").notNull(),
  cidade: text("cidade").notNull(),
  encontrados: integer("encontrados").notNull().default(0),
  novos: integer("novos").notNull().default(0),
  chamadasApi: integer("chamadas_api").notNull().default(0),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type StatusSite =
  // Só existe quando a FONTE afirma que não há site (ex: Google Places).
  // O OpenStreetMap não afirma nada — a ausência da tag vira "nao-verificado".
  | "sem-site"
  | "nao-verificado"
  | "so-rede-social"
  | "so-agregador"
  | "site-fora-do-ar"
  | "sem-ssl"
  | "tem-site";

/**
 * Modelo do site. Muda o prompt e o custo de geração:
 *  - simples: menos seções, raciocínio baixo. Rápido — é o único que costuma
 *    caber nos 60s do plano Hobby da Vercel.
 *  - completo: o padrão, com todas as seções e raciocínio alto.
 *  - animado: completo + movimento ao rolar. O mais lento.
 */
export type ModeloSite = "simples" | "completo" | "animado";

export const MODELOS: { valor: ModeloSite; rotulo: string; descricao: string }[] = [
  {
    valor: "simples",
    rotulo: "Site simples",
    descricao: "Rápido e direto. Hero, serviços e contato. Gera em menos de 1 minuto.",
  },
  {
    valor: "completo",
    rotulo: "Site completo",
    descricao: "Todas as seções, mapa e mais capricho no texto. Leva mais tempo.",
  },
  {
    valor: "animado",
    rotulo: "Site animado",
    descricao: "Igual ao completo, com movimento conforme a pessoa rola a página.",
  },
];

export type Temperatura = "quente" | "morno" | "frio";
/**
 * Status enxuto, na ordem do funil real de prospecção.
 * "reuniao" e "fechado" foram renomeados (não removidos): viraram "respondeu"
 * e "cliente", que é a linguagem de quem está prospectando, não de CRM.
 */
export type Etapa =
  | "novo"
  | "contatado"
  | "respondeu"
  | "proposta"
  | "cliente"
  | "perdido";
export type TipoScript = "whatsapp" | "ligacao" | "reuniao" | "objecao";

export type Lead = typeof leads.$inferSelect;
export type NovoLead = typeof leads.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type SiteVersion = typeof siteVersions.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type Logo = typeof logos.$inferSelect;
export type Configuracao = typeof configuracoes.$inferSelect;

export const ETAPAS: { valor: Etapa; rotulo: string }[] = [
  { valor: "novo", rotulo: "Novo" },
  { valor: "contatado", rotulo: "Contatado" },
  { valor: "respondeu", rotulo: "Respondeu" },
  { valor: "proposta", rotulo: "Proposta enviada" },
  { valor: "cliente", rotulo: "Cliente" },
  { valor: "perdido", rotulo: "Perdido" },
];
