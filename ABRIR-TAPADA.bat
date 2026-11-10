@echo off
setlocal
title TAPADA
cd /d "%~dp0"

echo.
echo  Iniciando o TAPADA...
echo.

where node >nul 2>nul
if not errorlevel 1 (
  node server.js
  goto :done
)

where py >nul 2>nul
if not errorlevel 1 (
  echo  Node.js nao encontrado: usando Python.
  start "" http://127.0.0.1:8080/
  py -m http.server 8080 --bind 127.0.0.1
  goto :done
)

where python >nul 2>nul
if not errorlevel 1 (
  echo  Node.js nao encontrado: usando Python.
  start "" http://127.0.0.1:8080/
  python -m http.server 8080 --bind 127.0.0.1
  goto :done
)

echo  ERRO: este jogo precisa do Node.js ou do Python para rodar.
echo.
echo  Instale o Node.js em:  https://nodejs.org
echo  (e depois de instalar, clique de novo neste arquivo)
echo.
pause
exit /b 1

:done
echo.
echo  O servidor parou.
pause
