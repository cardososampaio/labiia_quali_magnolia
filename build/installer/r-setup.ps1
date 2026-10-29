# R for labiia_quali's statistical tests, run by the Windows installer.
#
#   check      Prints "status|version|rscript": ok (R 4.5 or newer found),
#              old (only an older R), or none. Looks where labiia_lex looks.
#   install-r  Downloads the official R from CRAN (SHA-256 checked), installs
#              it for the current user only, then installs the packages.
#   packages   Installs every CRAN package the tests need into labiia_quali's
#              own library (%LOCALAPPDATA%\labiia_quali\R\library\<x.y>).
#
# Exit codes: 0 done; 2 R could not be downloaded; 3 R did not install;
# 4 some packages failed; 5 no usable R. The app stays installed in every
# case and offers the missing packages itself.
# Written for Windows PowerShell 5.1, which every Windows 10/11 has.
[CmdletBinding()]
param(
    [ValidateSet('check', 'install-r', 'packages')]
    [string]$Action = 'check',
    # Folder with r_runtime.json, r_packages.txt and install_r_packages.R.
    [string]$Resources = '',
    # Testing: behave as if this computer had no R.
    [switch]$SimulateNoR
)

$ErrorActionPreference = 'Stop'
if (-not $Resources) { $Resources = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ProgressPreference = 'SilentlyContinue'
$MinVersion = [version]'4.5.0'

$DataDir = Join-Path $env:LOCALAPPDATA 'labiia_quali'
$LogDir = Join-Path $DataDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir 'instalador-r.log'

# The installer reads this script's output in Windows' ANSI code page; R writes
# UTF-8. So R's output is read as UTF-8 and every line is written as ANSI.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), [System.Text.Encoding]::Default)
$Out.AutoFlush = $true

function Say([string]$Text) {
    # Shown in the installer's details window and kept in the log. Written to the
    # console, not the pipeline, so it never mixes with a function's result.
    $Out.WriteLine($Text)
    Add-Content -Path $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text) -Encoding UTF8
}

function Get-RscriptsInHome([string]$HomeDir) {
    @((Join-Path $HomeDir 'bin\Rscript.exe'), (Join-Path $HomeDir 'bin\x64\Rscript.exe'))
}

function Get-RCandidates {
    $list = New-Object System.Collections.Generic.List[string]
    foreach ($v in @($env:LABIIA_RSCRIPT_PATH, $env:RSCRIPT_PATH)) { if ($v) { $list.Add($v) } }
    if ($env:R_HOME) { Get-RscriptsInHome $env:R_HOME | ForEach-Object { $list.Add($_) } }
    foreach ($hive in @('HKLM:', 'HKCU:')) {
        foreach ($key in @('SOFTWARE\R-core\R64', 'SOFTWARE\R-core\R', 'SOFTWARE\WOW6432Node\R-core\R')) {
            try {
                $p = (Get-ItemProperty -Path "$hive\$key" -Name InstallPath -ErrorAction Stop).InstallPath
                if ($p) { Get-RscriptsInHome $p | ForEach-Object { $list.Add($_) } }
            } catch { }
        }
    }
    $roots = @()
    foreach ($pf in @($env:ProgramFiles, $env:ProgramW6432, ${env:ProgramFiles(x86)})) { if ($pf) { $roots += (Join-Path $pf 'R') } }
    if ($env:LOCALAPPDATA) { $roots += (Join-Path $env:LOCALAPPDATA 'Programs\R'); $roots += (Join-Path $env:LOCALAPPDATA 'R') }
    $roots += 'C:\R'; $roots += 'C:\tools\R'
    foreach ($root in $roots) {
        if (Test-Path $root) {
            Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                Get-RscriptsInHome $_.FullName | ForEach-Object { $list.Add($_) }
            }
        }
    }
    try { (& where.exe Rscript.exe 2>$null) | ForEach-Object { if ($_) { $list.Add($_.Trim()) } } } catch { }
    $seen = @{}
    foreach ($c in $list) {
        $k = $c.ToLowerInvariant()
        if (-not $seen.ContainsKey($k) -and (Test-Path $c)) { $seen[$k] = $true; $c }
    }
}

function Get-RVersion([string]$Rscript) {
    try {
        $out = (& $Rscript --version 2>&1 | Out-String)
        $m = [regex]::Match($out, 'version\s+(\d+\.\d+\.\d+)')
        if ($m.Success) { return [version]$m.Groups[1].Value }
    } catch { }
    return $null
}

# The newest R on the computer: @{ Status; Version; Rscript }.
function Find-R {
    if ($SimulateNoR) { return @{ Status = 'none'; Version = ''; Rscript = '' } }
    $best = $null; $bestVersion = $null
    foreach ($c in Get-RCandidates) {
        $v = Get-RVersion $c
        if ($v -and (-not $bestVersion -or $v -gt $bestVersion)) { $best = $c; $bestVersion = $v }
    }
    if (-not $best) { return @{ Status = 'none'; Version = ''; Rscript = '' } }
    $status = if ($bestVersion -ge $MinVersion) { 'ok' } else { 'old' }
    return @{ Status = $status; Version = $bestVersion.ToString(); Rscript = $best }
}

function Install-R {
    $manifest = Get-Content -Raw -Path (Join-Path $Resources 'r_runtime.json') | ConvertFrom-Json
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $target = Join-Path $env:TEMP $manifest.file_name
    $downloaded = $false
    foreach ($url in $manifest.urls) {
        try {
            Say "Baixando o R $($manifest.version) do CRAN (cerca de 90 MB)..."
            (New-Object System.Net.WebClient).DownloadFile($url, $target)
            $hash = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
            if ($hash -ne $manifest.sha256.ToLowerInvariant()) {
                Say "O arquivo baixado não confere (SHA-256 diferente); tentando outro endereço."
                Remove-Item -Force $target -ErrorAction SilentlyContinue
                continue
            }
            $downloaded = $true
            break
        } catch {
            Say "Falha no download: $($_.Exception.Message)"
        }
    }
    if (-not $downloaded) { Say 'Não foi possível baixar o R. Verifique a internet ou instale o R em https://cran.r-project.org/bin/windows/base/'; exit 2 }

    $dir = Join-Path $env:LOCALAPPDATA ("Programs\R\R-" + $manifest.version)
    Say "Instalando o R $($manifest.version) só para este usuário (cerca de um minuto)..."
    Add-Content -Path $LogFile -Value "Pasta do R: $dir; endereço: $url" -Encoding UTF8
    $p = Start-Process -FilePath $target -ArgumentList ($manifest.silent_args + ' /DIR="' + $dir + '"') -Wait -PassThru
    Remove-Item -Force $target -ErrorAction SilentlyContinue
    $rscript = Join-Path $dir 'bin\Rscript.exe'
    if (-not (Test-Path $rscript)) { Say "O instalador do R terminou (código $($p.ExitCode)), mas o R não ficou instalado."; exit 3 }
    Say "R $($manifest.version) instalado."
    return $rscript
}

function Install-Packages([string]$Rscript) {
    $script = Join-Path $Resources 'install_r_packages.R'
    $packages = Join-Path $Resources 'r_packages.txt'
    $libBase = Join-Path $DataDir 'R\library'
    Say "Instalando os pacotes R dos testes (alguns minutos)..."
    & $Rscript --vanilla $script $libBase $packages $LogFile 2>&1 | ForEach-Object { Say ([string]$_) }
    return $LASTEXITCODE
}

switch ($Action) {
    'check' {
        $r = Find-R
        $Out.WriteLine(("{0}|{1}|{2}" -f $r.Status, $r.Version, $r.Rscript))
        exit 0
    }
    'install-r' {
        $rscript = Install-R
        $code = Install-Packages $rscript
        if ($code -ne 0) { exit 4 }
        exit 0
    }
    'packages' {
        $r = Find-R
        if ($r.Status -ne 'ok') { Say 'Nenhum R 4.5 ou mais novo foi encontrado; os pacotes não foram instalados.'; exit 5 }
        Say "Usando o R $($r.Version) em $($r.Rscript)."
        $code = Install-Packages $r.Rscript
        if ($code -ne 0) { exit 4 }
        exit 0
    }
}
