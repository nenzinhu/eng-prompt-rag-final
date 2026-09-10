@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Engenharia de Prompt - RAG (Vercel + Supabase)
echo   Backend : http://localhost:8000   (FastAPI)
echo   Frontend: http://localhost:3000   (Next.js)
echo ============================================================
echo.

set "RAIZ=%~dp0"
if "%RAIZ:~-1%"=="\" set "RAIZ=%RAIZ:~0,-1%"

REM ---------------------------------------------------------------
REM [1/6] Arquivo de credenciais (.env)
REM ---------------------------------------------------------------
echo [1/6] Verificando credenciais (.env)
if not exist ".env" (
    if exist ".env.prod.completo" (
        copy /y ".env.prod.completo" ".env" >nul
        echo       .env criado a partir de .env.prod.completo
    ) else (
        echo.
        echo  ERRO: arquivo .env nao encontrado.
        echo  Copie .env.example para .env e preencha:
        echo    SUPABASE_URL, SUPABASE_ANON_KEY      ^(leitura^)
        echo    SUPABASE_SERVICE_ROLE_KEY             ^(escrita e Storage^)
        echo    ADMIN_TOKEN                           ^(protege upload/ingestao^)
        echo    NOUS_API_KEY / GROQ_API_KEY / ...     ^(geracao de texto^)
        echo.
        echo  Detalhes em CORRECOES-2026-09-10.md.
        echo.
        pause
        exit /b 1
    )
) else (
    echo       .env encontrado
)

REM ---------------------------------------------------------------
REM [1b/6] Avisos de configuracao que quebram funcionalidades
REM ---------------------------------------------------------------
findstr /b /c:"ADMIN_TOKEN=" ".env" | findstr /r /c:"ADMIN_TOKEN=$" >nul && (
    echo       AVISO: ADMIN_TOKEN vazio - upload e ingestao responderao 503
)
findstr /b /c:"SUPABASE_SERVICE_ROLE_KEY=" ".env" | findstr /r /c:"SERVICE_ROLE_KEY=$" >nul && (
    echo       AVISO: SUPABASE_SERVICE_ROLE_KEY vazia - escrita usando a chave publica
    echo              ^(rode a migracao de RLS so depois de preencher esta chave^)
)

REM ---------------------------------------------------------------
REM [2/6] Ambiente Python do backend
REM ---------------------------------------------------------------
echo [2/6] Verificando ambiente Python do backend
if not exist ".venv\Scripts\python.exe" (
    echo       Criando ambiente virtual .venv
    py -3.11 -m venv .venv
    if errorlevel 1 (
        echo  ERRO: nao foi possivel criar o ambiente virtual.
        echo  Verifique se o Python 3.11 esta instalado ^(py -3.11 --version^).
        pause
        exit /b 1
    )
)
echo       Instalando/atualizando dependencias Python
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo  ERRO ao instalar as dependencias Python.
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM [3/6] Dependencias do frontend
REM ---------------------------------------------------------------
echo [3/6] Verificando dependencias do frontend
if not exist "node_modules" (
    echo       Instalando dependencias do Node ^(pode demorar^)
    call npm install
    if errorlevel 1 (
        echo  ERRO no npm install. Verifique se o Node.js esta instalado.
        pause
        exit /b 1
    )
) else (
    echo       node_modules ja presente
)

REM ---------------------------------------------------------------
REM [4/6] Liberar as portas 8000 e 3000
REM       Evita o erro "Port 3000 is in use ... using port 3001"
REM       e dev servers orfaos de execucoes anteriores.
REM ---------------------------------------------------------------
echo [4/6] Liberando as portas 8000 e 3000
for %%P in (8000 3000) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        echo       encerrando processo %%A na porta %%P
        taskkill /F /PID %%A >nul 2>&1
    )
)

REM ---------------------------------------------------------------
REM [5/6] Iniciar os servidores
REM ---------------------------------------------------------------
echo [5/6] Iniciando BACKEND  ^(porta 8000^)
start "RAG Cloud - Backend (8000)" cmd /k "cd /d "%RAIZ%" && .venv\Scripts\python.exe -m uvicorn api.index:app --host 127.0.0.1 --port 8000 --env-file .env"

echo [5/6] Iniciando FRONTEND ^(porta 3000^)
start "RAG Cloud - Frontend (3000)" cmd /k "cd /d "%RAIZ%" && npm run dev"

REM ---------------------------------------------------------------
REM [6/6] Aguardar subir e abrir o navegador
REM ---------------------------------------------------------------
echo [6/6] Aguardando os servidores subirem...
echo.
set /a TENTATIVAS=0

:AGUARDAR
timeout /t 2 /nobreak >nul
set /a TENTATIVAS+=1
curl -s -o nul -m 3 http://127.0.0.1:8000/api/status && (
    set "BACKEND_OK=1"
) else (
    set "BACKEND_OK="
)
curl -s -o nul -m 5 http://localhost:3000/ && (
    set "FRONTEND_OK=1"
) else (
    set "FRONTEND_OK="
)

if defined BACKEND_OK if defined FRONTEND_OK goto PRONTO
if !TENTATIVAS! GEQ 30 goto PARCIAL
goto AGUARDAR

:PRONTO
echo.
echo  OK - Ambos os servidores estao respondendo.
echo     Backend : http://localhost:8000
echo     Frontend: http://localhost:3000
start "" http://localhost:3000
echo.
echo  Para encerrar, feche as duas janelas abertas ou pressione Ctrl+C nelas.
echo.
pause
exit /b 0

:PARCIAL
echo.
echo  ATENCAO: nem tudo respondeu no tempo esperado.
if defined BACKEND_OK (echo   Backend  : OK) else (echo   Backend  : SEM RESPOSTA - veja a janela do backend)
if defined FRONTEND_OK (echo   Frontend : OK) else (echo   Frontend : SEM RESPOSTA - veja a janela do frontend)
echo.
echo  Erros comuns ficam visiveis na propria janela de cada servidor.
echo.
pause
exit /b 1
