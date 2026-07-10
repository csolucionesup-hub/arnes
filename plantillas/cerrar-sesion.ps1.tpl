<#
  cerrar-sesion.ps1 - cierre de sesion de un proyecto en UN comando.

  Reduce los 7 pasos del protocolo de cierre a uno, preservando los candados:
    - graphify (GASTO) solo corre si pasas -Graph.
    - commit (PERMISO de {{OWNER}}) solo corre si pasas -Commit.
  Por defecto NO gasta ni commitea: valida y te deja todo listo.

  Uso:
    .\cerrar-sesion.ps1 -Proyecto mi-proyecto
    .\cerrar-sesion.ps1 -Proyecto mi-proyecto -Graph
    .\cerrar-sesion.ps1 -Proyecto mi-proyecto -Graph -Commit -Mensaje "sesion: mi-proyecto radar"
    .\cerrar-sesion.ps1 -Proyecto otro-proyecto -Modelo "Codex"   # cada modelo declara su identidad para el sello

  Cualquier modelo (Claude, Hermes, Gemini) lo corre igual. Antes de cerrar, REGISTRA el
  trabajo en el log.md del proyecto: el helper avisa si el log quedo atras pero no lo escribe
  por ti (eso es tuyo).
#>
param(
  [Parameter(Mandatory = $true)][string]$Proyecto,
  [switch]$Graph,
  [switch]$Commit,
  [string]$Mensaje,
  # Identidad del modelo que cierra (Claude, Codex, Gemini, Hermes, DeepSeek...). Sin default hacia
  # ningún modelo: cada uno se declara. Si se omite, el sello del policía dira "modelo-no-declarado".
  [string]$Modelo
)
# NO usar 'Stop' global: graphify/node escriben progreso en stderr y PowerShell 5.1 lo
# trataría como error fatal. Se valida por $LASTEXITCODE explícito en cada paso nativo.
$ErrorActionPreference = 'Continue'
$vault = Split-Path -Parent $MyInvocation.MyCommand.Path
$harness = Join-Path $vault '{{METAFOLDER}}\_sistema\harness'

# --- resolver proyecto en el manifest ---
$manifest = Get-Content (Join-Path $harness 'manifest.json') -Raw | ConvertFrom-Json
$proj = $manifest.projects | Where-Object { $_.id -eq $Proyecto } | Select-Object -First 1
if (-not $proj) {
  Write-Host "No existe el proyecto '$Proyecto' en el manifest." -ForegroundColor Red
  $ids = ($manifest.projects | ForEach-Object { $_.id }) -join ', '
  Write-Host "Proyectos validos: $ids"
  exit 1
}
$cerebro = Join-Path $vault $proj.cerebro
Write-Host "== Cierre de sesion: $($proj.name) [$($proj.id)] ==" -ForegroundColor Cyan

# --- candado de foco: coherencia con la sesion abierta ---
$sesPath = Join-Path $harness 'sesion-activa.json'
if (Test-Path $sesPath) {
  try { $ses = Get-Content $sesPath -Raw | ConvertFrom-Json } catch { $ses = $null }
  if ($ses -and $ses.proyecto -and $ses.proyecto -ne $proj.id) {
    Write-Host "AVISO: la sesion abierta era '$($ses.proyecto)', pero cierras '$($proj.id)'." -ForegroundColor Yellow
    Write-Host "       Si trabajaste fuera del foco, revisa el parte del policia antes de cerrar." -ForegroundColor Yellow
  }
}

# --- 0. Registra antes de cerrar: log.md quedo atras? ---
$logPath = Join-Path $cerebro 'log.md'
if (Test-Path $logPath) {
  $logTime = (Get-Item $logPath).LastWriteTime
  $newest = Get-ChildItem $cerebro -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'log.md' -and $_.FullName -notmatch '\\(node_modules|dist|\.git|_sistema)\\' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($newest -and $newest.LastWriteTime -gt $logTime) {
    Write-Host "AVISO: hay archivos mas nuevos que log.md (ej.: $($newest.Name))." -ForegroundColor Yellow
    Write-Host "       Registra el trabajo de hoy en $($proj.cerebro)\log.md ANTES de cerrar." -ForegroundColor Yellow
  }
  else {
    Write-Host "log.md al dia." -ForegroundColor Green
  }
}
else {
  Write-Host "AVISO: no hay log.md en $($proj.cerebro)." -ForegroundColor Yellow
}

Push-Location $vault
try {
  Write-Host ""
  Write-Host "[1/5] link-index..." -ForegroundColor Cyan
  node (Join-Path $harness 'link-index.js')
  if ($LASTEXITCODE -ne 0) {
    Write-Host "link-index falló (exit $LASTEXITCODE). No cierro." -ForegroundColor Red
    exit 1
  }

  Write-Host ""
  Write-Host "[2/5] harness-check..." -ForegroundColor Cyan
  & (Join-Path $vault 'harness-check.ps1')
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ARNES ROTO - no cierro. Arregla lo que marca el validador y reintenta." -ForegroundColor Red
    exit 1
  }

  Write-Host ""
  if ($Graph) {
    Write-Host "[3/5] graphify-update (regenera el grafo)..." -ForegroundColor Cyan
    if (Test-Path (Join-Path $vault 'graphify-update.ps1')) { & (Join-Path $vault 'graphify-update.ps1') } else { Write-Host '  (graphify no instalado; se omite - opcional)' -ForegroundColor DarkGray }
  }
  else {
    Write-Host "[3/5] graphify OMITIDO. Es gasto; pasa -Graph para regenerar el grafo." -ForegroundColor DarkGray
  }

  # El policía sella el cierre en el log del arnés (una línea [ronda]). Aquí, antes del commit,
  # para que el sello quede incluido en él. Su exit 1/2 (avisos/deriva) NO aborta: el cierre ya
  # pasó harness-check; el sello solo informa el veredicto de la ronda.
  Write-Host ""
  Write-Host "[4/5] Sello del policia en el log del arnes..." -ForegroundColor Cyan
  $auditArgs = @('--registrar-cierre')
  if ($Modelo) { $auditArgs += "--modelo=$Modelo" }
  node (Join-Path $harness 'auditar.js') @auditArgs
  if ($LASTEXITCODE -eq 2) { Write-Host "  (policia: DERIVA detectada - revisa el parte en _sistema/harness/auditorias/)" -ForegroundColor Yellow }
  elseif ($LASTEXITCODE -eq 1) { Write-Host "  (policia: avisos - revisa el parte en _sistema/harness/auditorias/)" -ForegroundColor Yellow }

  if (-not $Mensaje) { $Mensaje = "sesion: $($proj.id) - $(Get-Date -Format yyyy-MM-dd)" }

  # --- liberar el foco: la sesion queda cerrada (sesion-activa.json = sin sesion) ---
  if (Test-Path $sesPath) {
    $libre = [ordered]@{
      _comment = 'Estado de la sesion activa (candado de foco). Lo escribe abrir-sesion.ps1 y lo limpia cerrar-sesion.ps1. proyecto=null -> no hay sesion abierta. NO editar a mano.'
      proyecto = $null; cerebro = $null; modelo = $null; inicio = $null
    }
    [System.IO.File]::WriteAllText($sesPath, ($libre | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Foco liberado: sesion-activa.json sin sesion." -ForegroundColor DarkGray
  }

  # --- Nivel 3: freno pre-commit. Si el arbol tiene trabajo de MAS DE UN proyecto, no dejamos que
  # 'git add -A' selle un commit mezclado (COMMIT_MEZCLADO). Impide el error en el momento; el candado
  # del policia solo lo caza despues. ---
  Write-Host ""
  Write-Host "[pre-commit] Chequeo de commit atomico (Nivel 3)..." -ForegroundColor Cyan
  node (Join-Path $harness 'auditar.js') --precommit
  $mezcla = ($LASTEXITCODE -ne 0)

  Write-Host ""
  Write-Host "[5/5] git status:" -ForegroundColor Cyan
  git status --short
  Write-Host ""
  if ($Commit) {
    if ($mezcla) {
      Write-Host "COMMIT BLOQUEADO (Nivel 3): hay trabajo de mas de un proyecto sin commitear." -ForegroundColor Red
      Write-Host "  No hago 'git add -A' porque mezclaria proyectos en un commit." -ForegroundColor Red
      Write-Host "  Commitea cada proyecto por separado y reintenta:" -ForegroundColor Yellow
      Write-Host "    git add <rutas-del-proyecto> ; git commit -m `"$Mensaje`"" -ForegroundColor Yellow
      exit 1
    }
    Write-Host "Commiteando (-Commit)..." -ForegroundColor Cyan
    git add -A
    git commit -m $Mensaje
  }
  else {
    if ($mezcla) {
      Write-Host "OJO: hay trabajo de mas de un proyecto sin commitear (ver arriba)." -ForegroundColor Yellow
      Write-Host "     NO uses 'git add -A': commitea cada proyecto por separado." -ForegroundColor Yellow
    }
    $sugerido = 'git add <rutas-del-proyecto> ; git commit -m "' + $Mensaje + '"'
    Write-Host "Commit OMITIDO. Para cerrarlo en git (con permiso de {{OWNER}}):" -ForegroundColor DarkGray
    Write-Host "  $sugerido" -ForegroundColor DarkGray
    Write-Host "  (o repite el comando con -Commit; se bloquea si hay mezcla)." -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "Cierre listo para $($proj.id)." -ForegroundColor Green
}
finally {
  Pop-Location
}
