# harness-check.ps1 - valida la estructura del arnes contra el contrato (manifest.json).
# Correr antes de cerrar cada sesion. Exit 0 = ARNES OK.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $root '{{METAFOLDER}}\_sistema\harness\validate.js')
exit $LASTEXITCODE
