@echo off
REM ===================================================================
REM  Supervisor do worker de geracao por IA (Gemini).
REM
REM  Roda ESCONDIDO, chamado por servico-geracao.vbs no logon. Se o node
REM  cair, sobe de novo: oscilacao de rede nao pode exigir que voce abra
REM  terminal.
REM
REM  ESTE ARQUIVO NAO CONTEM SEGREDO NENHUM, e nao deve passar a conter.
REM  GEMINI_API_KEY e DATABASE_URL sao lidas do .env.local pelo proprio
REM  worker (loadEnvConfig), entao nao precisam aparecer aqui - diferente
REM  do servico.bat da bridge, que foi gerado com tokens embutidos.
REM
REM  O worker NAO ENVIA WHATSAPP. Ele so grava rascunho no banco. Quem
REM  envia e o worker da bridge, que continua desligado por padrao.
REM ===================================================================
cd /d "%~dp0"

set "NODE=C:\Program Files\nodejs\node.exe"
set "PING=%SystemRoot%\System32\ping.exe"

REM ------------------------------------------------------------------
REM  ESPERA entre uma queda e a proxima tentativa, em segundos.
REM
REM  Comeca em 5 e cresce ate 60, igual ao supervisor da bridge. Um
REM  supervisor que reinicia sem pausa e otimo quando a queda e
REM  passageira e pessimo quando o erro e permanente: vira laco apertado
REM  que enche o disco de log em minutos.
REM ------------------------------------------------------------------
set /a ESPERA=5

:loop
REM Chama o cli do tsx direto com node, em vez de "npx tsx".
REM Com npx a arvore virava cmd -> npx-cli -> cmd -> shim -> node: cinco
REM processos para rodar um script, e matar o servico deixava folha viva.
"%NODE%" "node_modules\tsx\dist\cli.mjs" src/scripts/worker-geracao.ts >> geracao.log 2>&1

echo [%date% %time%] worker de geracao saiu - nova tentativa em %ESPERA%s >> geracao.log
set /a SEGUNDOS=%ESPERA%+1
"%PING%" -n %SEGUNDOS% 127.0.0.1 >nul
set /a ESPERA=%ESPERA%*2
if %ESPERA% GTR 60 set /a ESPERA=60
goto loop
