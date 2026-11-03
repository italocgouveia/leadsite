# n8n: acionar a fila do Leadsite

Importe `leadsite-fila.json` no n8n. O fluxo vem desativado e chama a fila a cada dois minutos; cada chamada tenta enviar no máximo uma mensagem aprovada. A API do Leadsite continua aplicando pausa, intervalo, limite diário, opt-out e consentimento registrado.

## Credencial HTTP

No nó **Processar próxima mensagem aprovada**, selecione **Generic Credential Type → Header Auth** e crie uma credencial:

- **Name:** `Authorization`
- **Value:** `Bearer SEU_API_TOKEN`

Guarde o valor como credencial do n8n; não o cole no JSON do workflow.

## Configuração necessária

1. Configure o mesmo `API_TOKEN` nas variáveis do projeto Vercel e na credencial acima.
2. Configure e teste o provedor de WhatsApp em **Leadsite → Configurações**.
3. Registre no cadastro do lead a evidência de consentimento para WhatsApp. Sem ela, a mensagem permanece em rascunho.
4. Revise e aprove a campanha no Leadsite.
5. Ative o fluxo no n8n somente depois desses passos.

O n8n Community é gratuito quando auto-hospedado, mas o computador/servidor precisa permanecer ligado e conectado à internet. O envio não é garantido quando a bridge ou o túnel estiverem fora do ar.
