@echo off
REM Cria o atalho "Engenharia de Prompt RAG" na Area de Trabalho e no Menu Iniciar.
REM O atalho abre o app numa janela propria. Para desfazer: desinstalar-desktop.bat
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\instalador\instalar-atalho.ps1" %*
echo.
pause
