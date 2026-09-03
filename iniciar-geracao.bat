@echo off
REM ===================================================================
REM  Sobe o worker de geracao AGORA, sem esperar o proximo logon.
REM
REM  Normalmente voce nao precisa disto: a tarefa agendada
REM  LeadSite-WorkerIA sobe sozinha quando o Windows entra. Serve para
REM  depois de um parar-geracao.bat, ou se voce quiser conferir na hora.
REM
REM  Nao sobe um segundo se ja houver um: servico-geracao.vbs checa o
REM  supervisor e o proprio worker checa a porta 8477.
REM ===================================================================
cd /d "%~dp0"
wscript.exe "%~dp0servico-geracao.vbs"
echo Worker de geracao iniciado (sem janela). Rode status.bat para conferir.
"%SystemRoot%\System32\ping.exe" -n 4 127.0.0.1 >nul
