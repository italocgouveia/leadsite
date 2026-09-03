@echo off
REM ===================================================================
REM  Atalho para parar o worker de geracao. A logica esta no .ps1 ao
REM  lado - ver o comentario de la sobre por que nao e um one-liner.
REM ===================================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0parar-geracao.ps1"
