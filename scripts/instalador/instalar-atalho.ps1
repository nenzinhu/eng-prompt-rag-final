<#
  Instalador do atalho de desktop do Engenharia de Prompt RAG (Windows).

  Cria um atalho na Area de Trabalho (e no Menu Iniciar) que roda o
  iniciar-tudo.bat em "modo app": sobe backend e frontend e abre o app numa
  janela propria (Edge/Chrome --app), sem barra de endereco.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\instalador\instalar-atalho.ps1
    ... -Remover            remove os atalhos
    ... -ModoNavegador      abre numa aba comum do navegador em vez da janela de app
    ... -SemMenuIniciar     cria so o atalho da Area de Trabalho
    ... -Destino <pasta>    grava o atalho em outra pasta (usado nos testes)

  Arquivo so com ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
#>
param(
    [switch]$Remover,
    [switch]$ModoNavegador,
    [switch]$SemMenuIniciar,
    [string]$Destino = ""
)

$ErrorActionPreference = "Stop"
$nome = "Engenharia de Prompt RAG"
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$iniciador = Join-Path $raiz "iniciar-tudo.bat"

$pastas = @()
if ($Destino) {
    $pastas += $Destino
} else {
    $pastas += [Environment]::GetFolderPath("Desktop")
    if (-not $SemMenuIniciar) {
        $pastas += Join-Path ([Environment]::GetFolderPath("Programs")) $nome
    }
}

if ($Remover) {
    foreach ($pasta in $pastas) {
        $lnk = Join-Path $pasta "$nome.lnk"
        if (Test-Path $lnk) {
            Remove-Item $lnk
            Write-Host "Removido: $lnk"
        }
        # A pasta do Menu Iniciar e criada por este instalador: sai junto se ficou vazia.
        if ((Split-Path -Leaf $pasta) -eq $nome -and (Test-Path $pasta) -and -not (Get-ChildItem $pasta)) {
            Remove-Item $pasta
        }
    }
    Write-Host "Atalhos removidos. Os arquivos do projeto nao foram alterados."
    exit 0
}

if (-not (Test-Path $iniciador)) {
    throw "Nao encontrei $iniciador. Rode o instalador de dentro da pasta do projeto."
}

# Pre-requisitos: so avisa, porque o iniciar-tudo.bat ja explica cada erro ao rodar.
$avisos = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $avisos += "Node.js nao encontrado (https://nodejs.org)." }
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $raiz ".venv\Scripts\python.exe"))) {
    $avisos += "Python nao encontrado (https://www.python.org, marque 'py launcher')."
}
if (-not (Test-Path (Join-Path $raiz ".env"))) {
    $avisos += "Arquivo .env ausente: copie .env.example para .env e preencha as chaves antes de abrir o app."
}

$shell = New-Object -ComObject WScript.Shell
foreach ($pasta in $pastas) {
    if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
    $lnk = Join-Path $pasta "$nome.lnk"
    $atalho = $shell.CreateShortcut($lnk)
    $atalho.TargetPath = $iniciador
    $atalho.Arguments = $(if ($ModoNavegador) { "" } else { "app" })
    $atalho.WorkingDirectory = $raiz
    $atalho.Description = "Abre o $nome (backend + frontend locais)"
    # Icone do proprio Windows (livro/documento), para nao depender de arquivo extra.
    $atalho.IconLocation = "$env:SystemRoot\System32\imageres.dll,112"
    $atalho.WindowStyle = 7  # janela do iniciador minimizada
    $atalho.Save()
    Write-Host "Atalho criado: $lnk"
}

foreach ($a in $avisos) { Write-Host "AVISO: $a" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Pronto. De dois cliques em '$nome' na Area de Trabalho para abrir o app."
