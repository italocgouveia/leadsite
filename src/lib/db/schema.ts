import { sql } from "drizzle-orm";
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

/**
 * Ciclo de vida de uma mensagem de automação.
 *
 * `rascunho` e `aprovada` são estados SEUS: nada sai sem você aprovar.
 * `na-fila` em diante é o worker. `respondida` é terminal e trava novos
 * contatos para aquele lead.
 */
export const STATUS_MENSAGEM = [
  "rascunho",
  "aprovada",
  "na-fila",
  "enviada",
  "entregue",
  "respondida",
  "erro",
  "cancelada",
] as const;
export type StatusMensagem = (typeof STATUS_MENSAGEM)[number];

/**
 * Ciclo de vida de uma campanha.
 *
 * `rodando` é o único estado em que a fila entrega mensagem dessa campanha.
 * Pausar não perde nada: as mensagens ficam aprovadas, esperando.
 */
export const STATUS_CAMPANHA = [
  "rascunho",
  "rodando",
  "pausada",
  "concluida",
  "cancelada",
] as const;
export type StatusCampanha = (typeof STATUS_CAMPANHA)[number];

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
     * Pediu para não ser mais contatado, ou você decidiu não contatar.
     *
     * É uma trava DURA: a fila pula esse lead sem nem montar mensagem. Existe
     * porque respeitar "não me manda mais" é obrigação legal e a única coisa
     * que separa prospecção de spam.
     */
    naoContatar: boolean("nao_contatar").notNull().default(false),

    /**
     * Um humano assumiu a conversa deste lead.
     *
     * Trava dura para a RESPOSTA AUTOMÁTICA (ver lib/resposta-automatica.ts) —
     * diferente de `naoContatar`, não impede campanha nem fila, só impede o
     * sistema de responder sozinho por WhatsApp. Setado pelo botão "Assumir
     * conversa" na central de Conversas.
     */
    atendimentoHumano: boolean("atendimento_humano").notNull().default(false),

    /**
     * Teste de cliente oculto: você mandou uma pergunta de cliente e anotou o
     * que aconteceu. É o que autoriza a abordagem a AFIRMAR que o atendimento
     * demorou — sem este registro, o sistema se recusa a gerar essa mensagem.
     */
    testeOculto: jsonb("teste_oculto").$type<TesteOcultoSalvo>(),

    /** Última classificação da resposta deste lead. Ver lib/classificar.ts. */
    intencao: text("intencao"),
    confiancaIntencao: integer("confianca_intencao"),
    /** Quando o lead falou com você pela última vez. */
    ultimaInteracao: timestamp("ultima_interacao", { withTimezone: true }),
    /** Valor estimado do negócio, preenchido por você. Alimenta o pipeline. */
    valorPotencial: integer("valor_potencial"),

    /**
     * O que VOCÊ decidiu vender para este lead.
     *
     * Diferente de `avaliar(lead).produto`, que é um palpite do sistema a
     * partir do ramo e da presença online. Este campo é a sua escolha, e ela
     * vence: o motor pode sugerir site para uma oficina, mas se na conversa
     * apareceu que o problema é ordem de serviço, quem manda é o que você
     * marcou aqui.
     *
     * Nulo = ainda não decidido; a tela mostra a sugestão do sistema.
     */
    servico: text("servico"),

    /**
     * Quando falar de novo. É o campo que responde "o que eu faço hoje?".
     *
     * Sem ele o painel só mostra o passado (último contato) e você precisa
     * lembrar de cabeça quem prometeu retorno para quinta.
     */
    proximoContato: timestamp("proximo_contato", { withTimezone: true }),

    /** O que a conversa revelou, em campos. Ver MemoriaComercial. */
    memoriaComercial: jsonb("memoria_comercial").$type<MemoriaComercial>(),

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
 * Mensagens da automação de contato.
 *
 * Uma linha por mensagem, não por lead: o histórico completo fica aqui, e é
 * ele que responde "já falei com essa empresa? quando? o que eu disse?".
 *
 * O índice único em `leadId` + `status` não existe de propósito — o mesmo lead
 * pode ter vários contatos ao longo do tempo. A trava contra duplicata é de
 * REGRA (ver lib/fila.ts), porque "duplicado" aqui é "mensagem pendente ou
 * enviada nos últimos N dias", coisa que índice não expressa.
 */
export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    texto: text("texto").notNull(),
    status: text("status").$type<StatusMensagem>().notNull().default("rascunho"),

    /** Qual produto esta abordagem oferece — site, chatbot ou sistema. */
    produto: text("produto"),
    /** Como o texto nasceu: modelo pronto, gerado por IA, ou resposta automática. */
    /**
     * `manual` existe para a IA não sobrescrever o que você reescreveu à mão.
     * Sem essa marca, uma regeneração de lote apagaria em silêncio o texto que
     * você ajustou — e você só descobriria pelo que chegou no cliente.
     */
    origem: text("origem")
      .$type<"modelo" | "ia" | "manual" | "resposta-automatica">()
      .notNull()
      .default("modelo"),

    tentativas: integer("tentativas").notNull().default(0),
    /** Última falha, em texto — para você entender por que não foi. */
    erro: text("erro"),
    /** Id que o provedor devolveu, para casar webhook de status depois. */
    provedorId: text("provedor_id"),

    /** A qual campanha pertence. Null = mensagem avulsa, fora de campanha. */
    campanhaId: uuid("campanha_id").references(() => campanhas.id, { onDelete: "set null" }),
    /** 0 = primeiro contato, 1 = primeiro follow-up, e assim por diante. */
    rodada: integer("rodada").notNull().default(0),

    /**
     * Quem sai primeiro. Maior vai antes. Guarda a pontuação do lead.
     *
     * Existe porque `criadoEm` NÃO desempata: um insert em lote de 132 linhas
     * grava o mesmo `now()` em todas — `now()` é constante dentro de um
     * statement no Postgres. A fila ordenava por `criadoEm`, então a ordem
     * real virava a que o banco quisesse devolver, e o cuidado de ordenar os
     * leads por pontuação antes de inserir era jogado fora em silêncio.
     *
     * O efeito prático era o pior possível: o teto diário corta o disparo no
     * fim do dia, e quem ficava para depois era sorteado em vez de ser o
     * lead mais fraco.
     */
    prioridade: integer("prioridade").notNull().default(0),

    aprovadaEm: timestamp("aprovada_em", { withTimezone: true }),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    entregueEm: timestamp("entregue_em", { withTimezone: true }),
    respondidaEm: timestamp("respondida_em", { withTimezone: true }),

    /**
     * Quando esta mensagem foi RESERVADA para envio (virou `na-fila`).
     *
     * É o que permite distinguir "outro processo está enviando isto agora"
     * (recente) de "um processo morreu no meio do envio" (antigo demais).
     * Ver a trava atômica em lib/fila.ts (`reservarMensagem`).
     */
    processandoDesde: timestamp("processando_desde", { withTimezone: true }),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mensagens_lead_idx").on(t.leadId),
    index("mensagens_status_idx").on(t.status),
    index("mensagens_enviada_idx").on(t.enviadaEm),
    /**
     * No máximo UMA mensagem viva por (campanha, lead).
     *
     * "Viva" = ainda pode sair: rascunho, aprovada ou na-fila. É a única
     * garantia que segura duas gerações simultâneas do mesmo lead — checar
     * antes de inserir não segura, porque em READ COMMITTED os dois processos
     * leem "não existe" antes de qualquer um gravar. Sem esta linha, o mesmo
     * número recebia dois WhatsApp.
     *
     * PARCIAL de propósito, e não único total: existe campanha antiga com
     * várias mensagens `respondida` do mesmo lead, que é uma conversa e não
     * uma duplicata. Protege a fila de saída sem recusar histórico.
     */
    uniqueIndex("mensagens_viva_por_lead_idx")
      .on(t.campanhaId, t.leadId)
      .where(sql`${t.campanhaId} is not null and ${t.status} in ('rascunho','aprovada','na-fila')`),
  ],
);

/**
 * Campanha: um lote de contatos com começo, meio e fim.
 *
 * Existe para o botão "Iniciar campanha" significar alguma coisa. Sem ela, a
 * fila é um balde único e você não consegue responder "quantos daquele lote
 * de oficinas responderam?" — que é a pergunta que decide o próximo lote.
 *
 * Pausar/parar é por AQUI, não mensagem a mensagem: quando algo dá errado no
 * meio de um disparo, você precisa de um botão só.
 */
export const campanhas = pgTable(
  "campanhas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    status: text("status").$type<StatusCampanha>().notNull().default("rascunho"),

    /** O que estava filtrado quando você montou — para repetir depois. */
    filtro: jsonb("filtro").$type<Record<string, unknown>>(),
    /** Qual produto esta campanha oferece. */
    produto: text("produto"),

    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campanhas_status_idx").on(t.status)],
);

/** Categorias de intenção que podem disparar uma resposta automática. */
export const INTENCOES_COM_RESPOSTA_AUTOMATICA = [
  "orcamento",
  "interessado",
  "depois",
  "agendamento",
] as const;
export type IntencaoComRespostaAutomatica = (typeof INTENCOES_COM_RESPOSTA_AUTOMATICA)[number];

/**
 * Texto de resposta automática por categoria de intenção.
 *
 * Uma linha por categoria (não por regra): o motor de detecção continua em
 * lib/classificar.ts, calibrado por ordem e peso. Aqui só mora o TEXTO que
 * sai quando aquela categoria é detectada com confiança suficiente — editável
 * pelo painel, sem risco de destravar a ordem das regras.
 */
export const respostasAutomaticas = pgTable("respostas_automaticas", {
  id: uuid("id").primaryKey().defaultRandom(),
  intencao: text("intencao").$type<IntencaoComRespostaAutomatica>().notNull(),
  texto: text("texto").notNull().default(""),
  /** Desligada até você escrever o texto e ligar de propósito. */
  ativa: boolean("ativa").notNull().default(false),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("respostas_automaticas_intencao_idx").on(t.intencao)]);

/**
 * Conversas: cada mensagem recebida do lead.
 *
 * Guardar o texto original importa por dois motivos: a classificação pode
 * errar e você precisa conferir contra o que a pessoa realmente escreveu, e
 * `provedorMsgId` com índice único é o que torna o webhook IDEMPOTENTE — o
 * provedor reenvia o mesmo evento quando não recebe 200 rápido, e sem essa
 * trava a mesma resposta viraria três conversas e três classificações.
 */
export const conversas = pgTable(
  "conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** Quem escreveu: o lead ou você. */
    direcao: text("direcao").$type<"recebida" | "enviada">().notNull(),
    texto: text("texto").notNull(),

    /** Id da mensagem no provedor. Único: é a trava contra webhook repetido. */
    provedorMsgId: text("provedor_msg_id"),

    /** Não lida ainda na central de Conversas. Enviada nasce sempre lida. */
    lida: boolean("lida").notNull().default(true),
    /** Quem mandou, quando `direcao="enviada"`. Nulo em mensagens recebidas. */
    autor: text("autor").$type<"automatico" | "humano" | "campanha">(),

    intencao: text("intencao"),
    confianca: integer("confianca"),
    motivoClassificacao: text("motivo_classificacao"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversas_lead_idx").on(t.leadId),
    uniqueIndex("conversas_provedor_msg_idx").on(t.provedorMsgId),
  ],
);

/**
 * Log de eventos da automação.
 *
 * Append-only. Serve para responder "o que aconteceu às 14h32?" quando um
 * disparo se comporta de forma estranha — sem isso, erro em fila é caixa
 * preta e você só descobre o problema pelo resultado.
 */
export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: text("tipo").notNull(),
    descricao: text("descricao").notNull(),
    campanhaId: uuid("campanha_id").references(() => campanhas.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    dados: jsonb("dados").$type<Record<string, unknown>>(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_criado_idx").on(t.criadoEm), index("eventos_campanha_idx").on(t.campanhaId)],
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

  /**
   * Automação de WhatsApp.
   *
   * `provedorUrl` é proposital: não chumbamos Evolution, WAHA nem Cloud API.
   * O sistema faz um POST no endpoint que você apontar — assim ele serve para
   * o que você já tem rodando, e continua servindo quando você migrar.
   */
  automacaoAtiva: boolean("automacao_ativa").notNull().default(false),

  /**
   * Chave-mestra da resposta automática (ver lib/resposta-automatica.ts).
   * Mesma filosofia de `automacaoAtiva`: desligada até você ligar de propósito.
   */
  respostaAutomaticaAtiva: boolean("resposta_automatica_ativa").notNull().default(false),

  /**
   * Configuração do provedor, em partes.
   *
   * `provedorUrl` (URL inteira montada à mão) saiu porque era exatamente onde
   * o webhook acabava colado por engano. Agora o sistema monta a URL a partir
   * de base + instância, e o usuário nunca precisa escrever o caminho.
   * A coluna antiga fica para a migração e como histórico.
   */
  provedorTipo: text("provedor_tipo").$type<"evolution" | "waha" | "custom">(),
  provedorBaseUrl: text("provedor_base_url"),
  provedorInstancia: text("provedor_instancia"),
  provedorEndpointCustom: text("provedor_endpoint_custom"),
  /** Cifrado com AES-256-GCM quando SEGREDO_CHAVE existe. Nunca sai na API. */
  provedorToken: text("provedor_token"),
  /** Última verificação de conexão bem-sucedida. */
  provedorTestadoEm: timestamp("provedor_testado_em", { withTimezone: true }),
  provedorEstado: text("provedor_estado"),
  /** Quando o webhook recebeu evento pela última vez. Prova que está ligado. */
  webhookUltimoEm: timestamp("webhook_ultimo_em", { withTimezone: true }),

  /** @deprecated Migrado para os campos acima. Mantido como backup. */
  provedorUrl: text("provedor_url"),
  /** Segundos entre um envio e o próximo. Abaixo de 30 o número vira alvo. */
  intervaloSegundos: integer("intervalo_segundos").notNull().default(90),
  /** Teto por dia. Disparo em volume é o que faz a Meta banir o número. */
  limiteDiario: integer("limite_diario").notNull().default(30),
  /** Dias antes de poder contatar o mesmo lead de novo. */
  janelaRecontatoDias: integer("janela_recontato_dias").notNull().default(30),

  /**
   * Janela de horário permitido para envio automático, em America/Sao_Paulo.
   * Desligada por padrão (envia a qualquer hora, comportamento de sempre).
   * Não cruza meia-noite — janela tipo 22:00–06:00 não é suportada.
   */
  horarioEnvioAtivo: boolean("horario_envio_ativo").notNull().default(false),
  horarioInicio: text("horario_inicio").notNull().default("08:00"),
  horarioFim: text("horario_fim").notNull().default("20:00"),

  /** Pequena variação aleatória no intervalo entre envios (0–20% a mais). */
  variacaoAleatoriaAtiva: boolean("variacao_aleatoria_ativa").notNull().default(false),

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
/**
 * Funil de 9 etapas — o caminho normal, do primeiro contato ao fechamento.
 *
 * Os nomes antigos ("contatado", "cliente", "perdido") saíram, mas os dados
 * NÃO foram perdidos: `migrarEtapa` converte cada um para o equivalente novo,
 * e a migração roda uma vez sobre a base existente.
 */
export type EtapaFunil =
  | "novo"
  | "analisado"
  | "qualificado"
  | "mensagem-enviada"
  | "respondeu"
  | "interessado"
  | "reuniao"
  | "proposta"
  | "fechado";

/**
 * Status PARALELOS: saídas do funil, não etapas dele.
 *
 * Ficam separados de propósito. Misturar "sem interesse" no meio das nove
 * colunas do funil faz a coluna de descarte crescer e esconder o trabalho que
 * está andando — e o funil deixa de responder "onde o processo empacou?".
 *
 * Nenhum deles apaga o lead. Histórico se preserva sempre.
 */
export type EtapaParalela =
  | "sem-interesse"
  | "nao-respondeu"
  | "ja-tem-sistema"
  | "opt-out"
  | "necessita-analise"
  | "contato-invalido"
  | "campanha-cancelada";

export type Etapa = EtapaFunil | EtapaParalela;

/** Converte os nomes antigos para os novos, preservando o significado. */
export function migrarEtapa(antiga: string): Etapa {
  const mapa: Record<string, Etapa> = {
    novo: "novo",
    contatado: "mensagem-enviada",
    respondeu: "respondeu",
    proposta: "proposta",
    cliente: "fechado",
    perdido: "sem-interesse",
  };
  return mapa[antiga] ?? (antiga as Etapa);
}
export type TipoScript = "whatsapp" | "ligacao" | "reuniao" | "objecao";

export type Lead = typeof leads.$inferSelect;
export type NovoLead = typeof leads.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type SiteVersion = typeof siteVersions.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type Logo = typeof logos.$inferSelect;
export type Configuracao = typeof configuracoes.$inferSelect;
export type RespostaAutomatica = typeof respostasAutomaticas.$inferSelect;
export type Conversa = typeof conversas.$inferSelect;

/** As nove colunas do funil, na ordem. É esta lista que o kanban desenha. */
export const ETAPAS_FUNIL: { valor: EtapaFunil; rotulo: string; cor: string }[] = [
  { valor: "novo", rotulo: "Novo lead", cor: "#0060c0" },
  { valor: "analisado", rotulo: "Analisado", cor: "#3f6fd8" },
  { valor: "qualificado", rotulo: "Qualificado", cor: "#6b4ec7" },
  { valor: "mensagem-enviada", rotulo: "Mensagem enviada", cor: "#8a4bb8" },
  { valor: "respondeu", rotulo: "Respondeu", cor: "#c2410c" },
  { valor: "interessado", rotulo: "Interessado", cor: "#d97706" },
  { valor: "reuniao", rotulo: "Reunião", cor: "#b45309" },
  { valor: "proposta", rotulo: "Proposta", cor: "#8a6100" },
  { valor: "fechado", rotulo: "Fechado", cor: "#128c4a" },
];

/** Saídas do funil. Aparecem fora do kanban, numa faixa própria. */
export const ETAPAS_PARALELAS: { valor: EtapaParalela; rotulo: string; emoji: string }[] = [
  { valor: "sem-interesse", rotulo: "Sem interesse", emoji: "❄️" },
  { valor: "nao-respondeu", rotulo: "Não respondeu", emoji: "💤" },
  { valor: "ja-tem-sistema", rotulo: "Já possui sistema", emoji: "🏢" },
  { valor: "opt-out", rotulo: "Não contactar", emoji: "🚫" },
  { valor: "necessita-analise", rotulo: "Necessita análise", emoji: "⚠️" },
  { valor: "contato-invalido", rotulo: "Contato inválido", emoji: "❌" },
  { valor: "campanha-cancelada", rotulo: "Campanha cancelada", emoji: "🛑" },
];

/** Compatibilidade: telas antigas continuam importando ETAPAS. */
export const ETAPAS: { valor: Etapa; rotulo: string }[] = [
  ...ETAPAS_FUNIL.map((e) => ({ valor: e.valor as Etapa, rotulo: e.rotulo })),
  ...ETAPAS_PARALELAS.map((e) => ({ valor: e.valor as Etapa, rotulo: `${e.emoji} ${e.rotulo}` })),
];

export function ehEtapaDoFunil(e: Etapa): e is EtapaFunil {
  return ETAPAS_FUNIL.some((x) => x.valor === e);
}

/**
 * Ciclo de vida de UM item da fila de geração por IA.
 *
 * `pronta` significa "a mensagem existe no banco", não "foi enviada" — quem
 * envia é o worker da bridge, muito depois, e só sobre mensagem aprovada.
 */
export const STATUS_GERACAO = [
  "pendente",
  "processando",
  "pronta",
  "pulada",
  "erro",
] as const;
export type StatusGeracao = (typeof STATUS_GERACAO)[number];

/**
 * Fila PERSISTENTE de geração de mensagem por IA — um item por lead.
 *
 * POR QUE UMA TABELA, E NÃO UM CAMPO JSON NA CAMPANHA
 *
 * A versão anterior guardava a lista de pendentes dentro de `campanhas.filtro`
 * e quem processava era um laço no NAVEGADOR, pedindo lote atrás de lote.
 * Funcionava enquanto a aba estivesse aberta — ou seja, não funcionava. Fechar
 * o notebook parava a geração, e geração que só anda enquanto você olha não é
 * automação, é digitação assistida.
 *
 * Com tabela, cada lead vira uma LINHA com estado próprio, e a linha é a
 * unidade de trabalho: dá para reservar atomicamente (dois processos nunca
 * pegam o mesmo lead), dá para adiar um item sem travar os outros, e dá para
 * saber o que aconteceu com cada um sem depender de quem estava com a tela
 * aberta na hora.
 *
 * DUAS CONTAGENS SEPARADAS, DE PROPÓSITO
 *
 * `tentativas` conta FALHA DE VERDADE (modelo devolveu lixo, JSON quebrado,
 * rede caiu) e tem teto: no terceiro, o item vira `erro` e para de tentar.
 * É o que impede retry infinito.
 *
 * `esperas` conta ADIAMENTO POR COTA (429), que não é culpa do lead nenhum —
 * é o relógio. Adiamento NÃO queima tentativa e NUNCA vira `erro`: o item
 * volta para `pendente` com `proximaTentativaEm` no futuro e é gerado quando a
 * cota voltar. Misturar as duas coisas era o que fazia uma campanha de 40
 * leads perder 35 num dia de cota apertada.
 */
export const geracaoFila = pgTable(
  "geracao_fila",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campanhaId: uuid("campanha_id")
      .notNull()
      .references(() => campanhas.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    status: text("status").$type<StatusGeracao>().notNull().default("pendente"),
    /** Maior primeiro — mesma pontuação do lead que ordena a fila de envio. */
    prioridade: integer("prioridade").notNull().default(0),

    /** Falhas reais. Teto em GERACAO_MAX_TENTATIVAS; depois vira `erro`. */
    tentativas: integer("tentativas").notNull().default(0),
    /** Adiamentos por cota do Gemini. Não têm teto e não queimam o lead. */
    esperas: integer("esperas").notNull().default(0),

    /** Antes disto, o item nem é olhado. É como o backoff de cota acontece. */
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Quando ESTE item foi reservado. Distingue "alguém está gerando agora"
     * (recente) de "o processo morreu no meio" (antigo) — a recuperação de
     * item preso usa exatamente isto.
     */
    processandoDesde: timestamp("processando_desde", { withTimezone: true }),

    /** A mensagem que saiu daqui. Preenchido quando o item vira `pronta`. */
    mensagemId: uuid("mensagem_id").references(() => mensagens.id, { onDelete: "set null" }),
    /** Solução que a IA escolheu — para a tela explicar a abordagem. */
    solucao: text("solucao"),
    /**
     * A oportunidade que a IA enxergou neste lead, na frase dela.
     *
     * Era gerada e jogada fora — só a solução ficava salva. Mas quem revisa
     * precisa saber POR QUE aquela solução foi escolhida antes de aprovar uma
     * mensagem que vai para o WhatsApp de um estranho; sem isso a revisão vira
     * leitura de texto solto.
     */
    oportunidade: text("oportunidade"),
    /** Último motivo de falha ou de pulo, em texto legível. */
    erro: text("erro"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * A trava mais importante da tabela: um lead entra UMA vez por campanha.
     *
     * É o que faz "iniciar a mesma campanha duas vezes" ser inofensivo — o
     * segundo enfileiramento colide e não cria nada — sem depender de o código
     * lembrar de checar antes.
     */
    uniqueIndex("geracao_fila_campanha_lead_idx").on(t.campanhaId, t.leadId),
    index("geracao_fila_proxima_idx").on(t.status, t.proximaTentativaEm),
    index("geracao_fila_campanha_idx").on(t.campanhaId),
  ],
);

/**
 * Memória comercial do lead: o que a conversa revelou, em campos.
 *
 * Fica em jsonb numa coluna do próprio lead, e não em tabela nova, porque é
 * sempre lido junto com o lead e nunca consultado por si só. O que ele evita é
 * concreto: sem isso o vendedor reabre a conversa inteira para lembrar que o
 * cliente usa planilha e reclamou de preço.
 */
export type MemoriaComercial = {
  /** Como o cliente faz hoje, na palavra dele. */
  processoAtual?: string;
  /** A dor, depois de confirmada pelo cliente — não a hipótese. */
  dorConfirmada?: string;
  /** Última objeção levantada (id de lib/objecoes). */
  objecao?: string;
  /** Perguntas de diagnóstico já respondidas. */
  respostas?: { pergunta: string; resposta: string; insight: string; em: string }[];
  /** Resumo da conversa, gerado sob demanda. Nunca a cada mensagem. */
  resumo?: { texto: string; em: string };
};

/** Ciclo de vida de um negócio: da proposta ao cliente ativo. */
export const STATUS_NEGOCIO = [
  "rascunho",
  "enviada",
  "negociacao",
  "fechada",
  "perdida",
  "implantacao",
  "ativo",
  "pausado",
  "cancelado",
] as const;
export type StatusNegocio = (typeof STATUS_NEGOCIO)[number];

/**
 * O negócio: proposta, setup, mensalidade e o que vem depois de fechar.
 *
 * UMA tabela para todo o ciclo, não três (proposta / contrato / assinatura).
 * O motivo é que os três seriam sempre a mesma linha da vida real com nomes
 * diferentes, e separar obrigaria a copiar valor e solução entre elas a cada
 * mudança de estado — que é exatamente onde os números começam a divergir.
 *
 * Valores em REAIS inteiros, não centavos: os preços daqui são cheios
 * (R$ 2.000 de setup, R$ 400/mês) e centavos só acrescentariam zeros e uma
 * conversão a mais para errar.
 *
 * Nada aqui é preenchido por IA sozinha. A IA sugere texto; setup e
 * mensalidade só existem quando alguém digitou — `null` significa "ainda não
 * definido", e a tela mostra assim, em vez de inventar um número.
 */
export const negocios = pgTable(
  "negocios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    status: text("status").$type<StatusNegocio>().notNull().default("rascunho"),

    /** Solução do catálogo (lib/catalogo-solucoes) e os módulos do escopo. */
    solucao: text("solucao"),
    modulos: jsonb("modulos").$type<string[]>().default([]),
    /** O problema como o CLIENTE contou. Base do resumo da proposta. */
    problema: text("problema"),

    /** Em reais. `null` = ainda não definido — a tela nunca chuta. */
    setup: integer("setup"),
    mensalidade: integer("mensalidade"),

    /** Texto da proposta, quando gerado. Editável antes de enviar. */
    textoProposta: text("texto_proposta"),
    observacoes: text("observacoes"),

    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    fechadaEm: timestamp("fechada_em", { withTimezone: true }),
    /** Quando a mensalidade começou a valer — a data que o MRR usa. */
    inicioEm: timestamp("inicio_em", { withTimezone: true }),

    /**
     * Follow-up MANUAL: uma data e um motivo. Nada dispara sozinho — o CRM
     * mostra que venceu e quem manda é você.
     */
    proximoFollowUp: timestamp("proximo_follow_up", { withTimezone: true }),
    motivoFollowUp: text("motivo_follow_up"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("negocios_lead_idx").on(t.leadId),
    index("negocios_status_idx").on(t.status),
    index("negocios_follow_up_idx").on(t.proximoFollowUp),
  ],
);
