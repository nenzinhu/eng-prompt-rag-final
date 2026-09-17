@echo off
REM Remove os atalhos criados pelo instalar-desktop.bat (nao apaga o projeto).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\instalador\instalar-atalho.ps1" -Remover
echo.
pause
