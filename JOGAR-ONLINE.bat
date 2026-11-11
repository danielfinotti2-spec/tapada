@echo off
setlocal
title TAPADA - Jogar Online
cd /d "%~dp0"

echo.
echo   ================================================
echo     TAPADA - leilao de futebol online
echo   ================================================
echo.
echo   Vou subir o jogo e criar um LINK publico.
echo   Mande esse link no grupo: qualquer pessoa, de
echo   qualquer lugar, entra e joga junto.
echo.

set PORT=8130
where node >nul 2>nul
if errorlevel 1 (
  echo   ERRO: instale o Node.js em https://nodejs.org
  pause
  exit /b 1
)
node server.js
echo.
echo   O jogo foi encerrado.
pause
