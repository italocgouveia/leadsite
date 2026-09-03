@echo off
REM ===================================================================
REM  Estado dos tres servicos e das duas filas, numa tela so.
REM  SO LE. Nao liga, nao desliga, nao envia, nao altera nada.
REM ===================================================================
cd /d "%~dp0"
call "C:\Program Files\nodejs\npx.cmd" tsx src/scripts/diagnostico.ts
pause
