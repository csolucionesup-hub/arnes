<#
  abrir-sesion.ps1 - abre la sesion de trabajo en UN proyecto (candado de foco).

  Fija el proyecto de la sesion en {{METAFOLDER}}/_sistema/harness/sesion-activa.json. Mientras este
  abierta, TODO el trabajo va a ese proyecto (lo vigila el policia: TRABAJO_FUERA_DE_FOCO). Para
  cambiar a otro proyecto SIN cerrar la sesion, hay que dar la clave {{KEY}}.

  Uso:
    .\abrir-sesion.ps1 -Proyecto mi-proyecto
    .\abrir-sesion.ps1 -Proyecto otro-proyecto -Modelo "Claude (Opus)"
    .\abrir-sesion.ps1 -Proyecto otro-id -Clave {{KEY}}   # cambiar de foco sin cerrar el anterior
#>
param(
  [Parameter(Mandatory = $true)][string]$Proyecto,
  [string]$Modelo,
  [string]$Clave
)
$ErrorActionPreference = 'Stop'
$claveOk = '{{KEY}}'
$vault = Split-Path -Parent $MyInvocation.MyCommand.Path
$harness = Join-Path $vault '{{METAFOLDER}}\_sistema\harness'
$sesPath = Join-Path $harness 'sesion-activa.json'

# --- resolver el proyecto en el manifest ---
$manifest = Get-Content (Join-Path $harness 'manifest.json') -Raw | ConvertFrom-Json
$proj = $manifest.projects | Where-Object { $_.id -eq $Proyecto } | Select-Object -First 1
if (-not $proj) {
  Write-Host "No existe el proyecto '$Proyecto' en el manifest." -ForegroundColor Red
  Write-Host ("Proyectos validos: " + (($manifest.projects | ForEach-Object { $_.id }) -join ', '))
  exit 1
}

# --- si ya hay una sesion abierta en OTRO proyecto, exige la clave (candado de foco) ---
if (Test-Path $sesPath) {
  try { $ses = Get-Content $sesPath -Raw | ConvertFrom-Json } catch { $ses = $null }
  if ($ses -and $ses.proyecto -and $ses.proyecto -ne $proj.id) {
    if ($Clave -ne $claveOk) {
      Write-Host "HAY UNA SESION ABIERTA en foco: '$($ses.proyecto)'." -ForegroundColor Yellow
      Write-Host "El candado de foco no te deja saltar a '$($proj.id)' sin tu clave." -ForegroundColor Yellow
      Write-Host "  - Recomendado: cierra primero   ->  .\cerrar-sesion.ps1 -Proyecto $($ses.proyecto)" -ForegroundColor DarkGray
      Write-Host "  - O cambia de foco con la clave  ->  .\abrir-sesion.ps1 -Proyecto $($proj.id) -Clave $claveOk" -ForegroundColor DarkGray
      exit 2
    }
    Write-Host "Cambio de foco autorizado con clave: '$($ses.proyecto)' -> '$($proj.id)'." -ForegroundColor Yellow
    Write-Host "OJO: registra/cierra lo del proyecto anterior si no lo hiciste." -ForegroundColor Yellow
  }
}

# --- escribir el estado de sesion (UTF-8 sin BOM para que node lo lea) ---
$stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
$mod = if ($Modelo) { $Modelo } else { 'modelo-no-declarado' }
$obj = [ordered]@{
  _comment = 'Estado de la sesion activa (candado de foco). Lo escribe abrir-sesion.ps1 y lo limpia cerrar-sesion.ps1. proyecto=null -> no hay sesion abierta. NO editar a mano.'
  proyecto = $proj.id
  cerebro  = $proj.cerebro
  modelo   = $mod
  inicio   = $stamp
}
[System.IO.File]::WriteAllText($sesPath, ($obj | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "== SESION ABIERTA: $($proj.name) [$($proj.id)] ==" -ForegroundColor Green
Write-Host "Foco fijado. TODO el trabajo de esta sesion va a '$($proj.cerebro)'."
Write-Host "Cambiar de proyecto sin cerrar: clave $claveOk. Cerrar: .\cerrar-sesion.ps1 -Proyecto $($proj.id)"

# --- mostrar el cerebro para arrancar en contexto ---
$idx = Join-Path (Join-Path $vault $proj.cerebro) 'index.md'
if (Test-Path $idx) {
  Write-Host ""
  Write-Host "--- $($proj.cerebro)\index.md (primeras lineas) ---" -ForegroundColor Cyan
  Get-Content $idx -TotalCount 18
}
exit 0
