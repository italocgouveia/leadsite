# Bridge WhatsApp do Leadsite

Serviço Node persistente para manter a sessão do WhatsApp e encaminhar mensagens aprovadas pelo CRM. Não rode dentro de função serverless da Vercel.

## Preparar no Railway

1. Crie um projeto Railway conectado ao repositório `italocgouveia/leadsite` e adicione um serviço apontando para essa mesma origem.
2. Em **Settings → Source**, configure o diretório raiz como `/whatsapp-bridge` e o arquivo de configuração Railway como `/whatsapp-bridge/railway.json`. O serviço usa o Dockerfile desta pasta.
3. Em **Volumes**, anexe um volume ao serviço no caminho `/data`. A sessão fica em `/data/auth` e sobrevive a novos deploys e reinicializações.
4. Em **Networking → Public Networking**, gere um domínio Railway. A Railway provisiona HTTPS para o domínio. Aponte o domínio do CRM para essa URL.
5. Cadastre as variáveis abaixo e faça o primeiro deploy. O endpoint `/healthz` é o health check e só informa se o processo está respondendo.

O arquivo `railway.json` configura o Dockerfile, health check e reinicialização em falha. A Railway informa que a política `ALWAYS` não está disponível no plano Free; o arquivo usa até 10 tentativas automáticas para ser compatível. Em um plano que permita `ALWAYS`, altere a política no painel para manter reinícios contínuos. Sem domínio público, volume e variáveis, a bridge não fica pronta para o CRM.

Configure no serviço:

| Variável | Valor |
| --- | --- |
| `BRIDGE_API_TOKEN` | Segredo aleatório, igual ao token salvo no CRM para o provedor `custom` |
| `WEBHOOK_URL` | `https://leads-eosin.vercel.app/api/automacao/status` |
| `WEBHOOK_SECRET` | Mesmo valor de `WEBHOOK_SECRET` na Vercel |
| `AUTH_DIR` | `/data/auth` |
| `BIND_HOST` | `0.0.0.0` |
| `PORT` | Fornecida pelo host; localmente pode usar `API_PORT=8081` |

Não publique a porta 8082 de pareamento. O QR é entregue ao painel por `GET /pairing`, protegido com o token da bridge. Os tokens trafegam em cabeçalhos, nunca na URL.

## Configuração no CRM

Em Configurações → WhatsApp, escolha **API personalizada** e informe a URL HTTPS do serviço, endpoint `/send` e `BRIDGE_API_TOKEN`. Salve e teste a conexão. Quando o painel indicar que está aguardando pareamento, leia o QR exibido ali. A sessão permanece no volume após reinicializações.

Mantenha o n8n desativado até o teste de conexão e o teste controlado de ponta a ponta. O workflow existente chama uma vez a cada dois minutos; as regras de horário, intervalo, consentimento e teto diário continuam no CRM. A automação permanece pausada por padrão.

## Limites

Esta bridge usa Baileys para automatizar uma sessão vinculada do WhatsApp Web; ela não é a WhatsApp Business Platform oficial. A estabilidade, disponibilidade e compatibilidade dependem do host e do WhatsApp. Não há como prometer funcionamento permanente. A conexão real só fica confirmada quando o CRM recebe estado `conectado` da bridge.

> **Configuração Railway:** o arquivo JSON de configuração como código está previsto para descontinuação pela Railway em 1º de dezembro de 2026. Use-o para o primeiro deploy enquanto está disponível; mantenha root directory, health check e política de reinício conferidos no painel. O volume e o domínio são sempre anexados/configurados no painel.
