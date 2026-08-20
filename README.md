# LeadSite

**Ferramenta de prospecção B2B que encontra empresas com problema de presença digital, prova o problema e monta a abordagem.**

Feita para vender dois produtos: **site** e **atendente de WhatsApp com IA**. Roda inteira em serviços gratuitos — sem Google Places API, sem plano pago de lugar nenhum.

> 12.280 linhas · 93 arquivos TypeScript · 23 rotas de API · 14 telas · 82 casos de teste

---

## O problema

Prospecção local é garimpo. Você abre o Google Maps, procura "oficina mecânica em Uberlândia", clica em cada resultado, vê se tem site, anota o telefone, escreve uma mensagem, repete. Duas horas depois você tem quinze contatos e nenhuma venda.

As três coisas que fazem isso doer:

1. **Achar quem tem o problema** — a maioria das empresas listadas já tem site, ou não tem telefone.
2. **Escrever a abordagem** — mensagem genérica não é respondida, e personalizar uma a uma leva o dia.
3. **Falar com quem decide** — a recepção não passa a ligação.

O LeadSite resolve os três.

---

## O que ele faz

### Encontra os leads certos

Busca por ramo e cidade em qualquer um dos **5.571 municípios brasileiros**, usando OpenStreetMap. Para cada empresa, audita a presença digital de forma determinística:

| Status | O que significa |
|---|---|
| `sem-site` | A fonte confirma que não há site |
| `so-rede-social` | Só Instagram/Facebook |
| `so-agregador` | Linktree, iFood — depende de terceiro |
| `site-fora-do-ar` | O site cadastrado não responde |
| `sem-ssl` | Sem HTTPS, o navegador marca como inseguro |
| `nao-verificado` | **A fonte não afirma nada. Só não sabe.** |
| `tem-site` | Site próprio funcionando |

Aquele último status antes de `tem-site` é o coração do projeto, e está explicado mais abaixo.

### Decide o que vender, por lead

Um negócio sem site precisa de site. Um negócio com site bom e 200 avaliações no Google não precisa de site nenhum — o gargalo dele é **responder**. São vendas diferentes, e o motor separa:

```
falta site + movimento comprovado  →  Site + chatbot
falta site                          →  Site
site pronto + WhatsApp + movimento  →  Chatbot com IA
```

Regra que vive no código, não no texto: **chatbot só é oferecido se o lead tem WhatsApp.** O produto roda em cima do número; sem número não existe o que vender.

### Monta a abordagem na hora

Sem chamar IA. A mensagem é montada por template em milissegundos, com quatro peças:

1. **Elogio ancorado** em algo verificável (a nota do Google, não "vi que vocês são ótimos")
2. **A falta específica daquele ramo** — 39 ramos mapeados com a dor real de cada um
3. **Credencial + a tarefa chata que o produto elimina**
4. **Pergunta de 30 segundos**

```
Boa!

Vi as avaliações da Auto Center Silva no Google (4.7 com 80 avaliações)
e o trabalho de vocês é muito bem falado. Com esse movimento todo,
imagino que chegue bastante mensagem no WhatsApp de vocês.

Sou desenvolvedor e montei um atendente de WhatsApp com IA para oficinas
mecânicas: ele responde na hora, chama vocês quando o assunto precisa de
gente e assume a parte de repetir os mesmos valores de revisão e troca de
óleo em cada conversa.

Posso te mostrar funcionando em 30 segundos?
```

### Cliente oculto: prova o problema antes de vender

O recurso de que mais me orgulho. Em vez de **supor** que o atendimento é lento, você **mede**:

1. O sistema monta a pergunta que um cliente daquele ramo faria — 29 ramos com pergunta própria.
2. Você manda pelo WhatsApp. **O servidor carimba a hora.**
3. Você anota o que aconteceu: não responderam / demorou / responderam rápido.
4. Só então a abordagem é gerada, citando o fato real.

E o mesmo teste vira duas vendas diferentes:

**Chatbot** — o ângulo é o tempo:
> Mandei uma mensagem aqui ontem às 13:11 perguntando preço, como cliente, e até agora não chegou resposta.

**Site** — o ângulo é ter precisado perguntar, e aí **resposta rápida é o melhor gancho**:
> Vocês responderam em 4 minutos. Rápido, e isso é justamente o ponto: alguém aí parou o que estava fazendo pra digitar um preço.

Se responderam rápido e você está vendendo chatbot, o sistema **se recusa a montar a mensagem** e explica por quê. Detalhe abaixo.

### Descobre quem decide

Consulta o quadro societário público da Receita Federal e mostra os sócios, com quem **administra** em primeiro lugar:

```
CLIMA Clínica de Imagem
  ADRIANA RODRIGUES DA CUNHA   [Sócio-Administrador]  ← decide
  LUCIANO MARTINS MESSIAS      [Sócio-Administrador]  ← decide
  ELMAR GONZAGA GONCALVES      [Sócio]
```

Pedir "o responsável" mata a ligação. Pedir "a Adriana" é outra conversa. A abordagem passa a abrir com o primeiro nome de quem administra.

### Gera o site demonstrativo

Cria uma página real para o lead, publicada em `/s/[slug]`, para você mandar junto com a proposta. Três modelos, histórico de versões e edição por chat.

### O resto

- **Pipeline** kanban com seis etapas e arraste entre colunas
- **Exportação CSV** com BOM e separador `;` (abre no Excel brasileiro com acento certo)
- **API externa** com autenticação por token, para n8n / Make / Zapier
- **Login com Google** restrito a e-mails autorizados

---

## As decisões que definem o projeto

Esta seção é o motivo do repositório ser público. O código é o de menos — o que interessa é o porquê.

### 1. Ausência de dado nunca vira afirmação

É o princípio que atravessa tudo.

Quando o OpenStreetMap não traz o campo `website`, isso **não significa** que a empresa não tem site. Significa que ninguém preencheu. Chamar isso de "sem site" faria você mandar mensagem dizendo "vi que vocês não têm site" para uma empresa que tem — e a venda morre na primeira resposta.

Por isso existe o status `nao-verificado`, separado de `sem-site`. A auditoria recebe um parâmetro explícito:

```ts
auditarSite(url, fonteAfirmaAusencia = true)
// OSM passa false: ele não afirma ausência, só não sabe.
```

O mesmo princípio aparece:

- **No site gerado** — seção sem dado não existe, em vez de inventar preço ou horário
- **No validador** — telefones e e-mails inventados pelo modelo são neutralizados por código
- **No cliente oculto** — sem teste registrado, a mensagem de revelação **não é gerada**, nem com texto "provável"

### 2. A ferramenta se recusa a mentir

No cliente oculto, se o teste mostrou que responderam em 4 minutos e você está vendendo chatbot, o argumento de demora não existe. O sistema devolve:

> *Responderam rápido (4 minutos). O argumento de demora não se sustenta aqui — mas serve para vender SITE: alguém digitou aquela resposta à mão.*

Uma ferramenta que diz "esse ângulo não serve" vale mais do que uma que produz um texto bonito e o dono desmente na primeira resposta.

### 3. Medir antes de construir

Antes de escrever o buscador de CNPJ em sites, rodei o padrão em 25 sites reais da base:

```
6 sequências de 14 dígitos encontradas
5 eram lixo — valores de CSS, ids concatenados
3 CNPJs de verdade
```

**Cinco dos seis eram falso positivo.** Sem validação de dígito verificador, o sistema consultaria a Receita com número inventado e mostraria "não encontrado" — como se a empresa não existisse. O validador roda **antes** de qualquer requisição.

A mesma medição definiu a busca. Uberlândia tem 1.263 estabelecimentos mapeados no OSM, mas só ~10% com telefone. A solução foi pedir 600 resultados e filtrar para os contatáveis, em vez de pedir 20 e entregar 2. Restaurantes com telefone saíram de ~10% para **94%**.

### 4. Validação de telefone brasileiro, dígito por dígito

Um número real da base gerava `wa.me/5534007710522` — link morto. O validador tem lista branca de DDD, exige que celular comece com 9 e fixo comece entre 2 e 5. 13 casos de teste.

### 5. Concordância de gênero nas mensagens

Cada um dos 39 ramos carrega o gênero gramatical do substantivo:

```ts
{ pagina: "menu digital", genero: "m", ... }
{ pagina: "página de serviços", genero: "f", ... }
```

Sem isso, saíam mensagens como *"não têm catálogo próprio"* (faltando artigo) e *"deixar página de serviços bem mais prático"* (concordância errada). Detalhe pequeno que denuncia automação na hora.

### 6. Zero custo, de propósito

| Serviço | Para quê | Limite real |
|---|---|---|
| Overpass (OSM) | Encontrar empresas | 2 consultas simultâneas, sem cota diária |
| Nominatim | Cidade → coordenada | 1 req/s, com cache de 7 dias por cidade |
| IBGE | 5.571 municípios | Sem limite |
| Receita (MinhaReceita / BrasilAPI) | Quadro societário | Sem chave |
| Gemini | Gerar o site demo | Cota gratuita por minuto/dia |
| Neon | Postgres | Plano gratuito |
| Vercel | Hospedagem | Hobby |

Buscar lead é ilimitado. O único recurso com cota é a geração de site.

---

## O que ele NÃO faz

Achei mais honesto listar do que deixar você descobrir usando.

- **Não devolve o telefone do sócio.** O quadro societário da Receita não tem contato de pessoa física. Você recebe o **nome**, que é o que passa pela recepção.
- **O CNPJ automático acerta pouco.** 12% dos sites publicam CNPJ, e a maioria dos leads nem tem site. O caminho principal é colar o número na mão.
- **Arraste do Pipeline não funciona no celular.** HTML5 drag-and-drop não responde a toque. No aparelho, a troca de etapa se faz pela lista.
- **Dados do OSM são incompletos.** A cobertura varia muito por ramo: restaurante e oficina passam de 90% com telefone, salão de beleza fica perto de 8%. A tela avisa quantos foram encontrados e quantos têm contato, em vez de esconder.

---

## Stack

- **Next.js 16.3** (App Router, Turbopack) · React 19 · TypeScript
- **Tailwind CSS v4** (Lightning CSS)
- **Drizzle ORM** + **Neon** (Postgres serverless)
- **Auth.js v5** (Google OAuth, sessão em JWT assinado)
- **Google Gemini** (`@google/genai`) para gerar os sites
- **Vercel** para deploy

### Estrutura

```
src/
├─ app/
│  ├─ api/              23 rotas
│  ├─ vender-site/      fila de leads de site
│  ├─ vender-chatbot/   fila de leads de chatbot
│  ├─ pipeline/         kanban do funil
│  ├─ lead/[id]/        painel do lead
│  ├─ sites/            sites gerados
│  └─ s/[slug]/         página pública do cliente
├─ lib/
│  ├─ produto.ts        decide site x chatbot x pacote
│  ├─ oportunidade.ts   traduz score em "vale a pena?"
│  ├─ proposta.ts       monta a mensagem
│  ├─ teste-oculto.ts   cliente oculto
│  ├─ receita.ts        quadro societário
│  ├─ cnpj.ts           validação de dígito verificador
│  ├─ telefone.ts       validação de telefone BR
│  ├─ nichos.ts         39 ramos com dor específica
│  ├─ osm/              busca no OpenStreetMap
│  ├─ places/audit.ts   auditoria de presença digital
│  └─ gen/              geração e validação dos sites
└─ components/
```

---

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run db:push              # cria as tabelas
npm run dev
```

### Variáveis

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Postgres (Neon) |
| `AUTH_SECRET` | sim | Assinatura da sessão |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | não | Login com Google |
| `GOOGLE_EMAILS_PERMITIDOS` | não | Lista branca, separada por vírgula |
| `APP_PASSWORD` | não | Senha simples, se o Google não estiver configurado |
| `GEMINI_API_KEY` | não | Gerar sites demonstrativos |
| `API_TOKEN` | não | API externa para automação |

Sem `GOOGLE_CLIENT_ID`, o painel cai no modo senha — de propósito, para você não ficar trancado para fora se o OAuth quebrar.

### Testes

```bash
npm run test:produto    # 16 casos — motor de produto e mensagens
npm run test:oculto     # 18 casos — cliente oculto
npm run test:receita    # 13 casos — CNPJ e quadro societário
npm run test:telefone   # 13 casos — validação de telefone BR
npm run test:deteccao   # 22 casos — clichês de IA no site gerado
```

82 casos no total. São testes manuais em TypeScript, sem framework — rodam com `tsx`, imprimem o que passou e saem com código 1 se algo quebrou.

---

## Sobre os dados

Tudo que a ferramenta usa é público: OpenStreetMap (ODbL), dados abertos de CNPJ da Receita Federal e municípios do IBGE. O quadro societário é registro público, e usá-lo para abordagem B2B é prática comum.

O que fica salvo é nome, qualificação e dados de contato do negócio — nada além do que os registros publicam.

---

## Autor

Feito por Italo Gouveia — [ICG Tech](https://icgtech.site)

Licença MIT.
