$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# Default public IP connection. No SSH dependency.
Remove-Item Env:MEOW_LOCAL_MODE -ErrorAction SilentlyContinue
Remove-Item Env:MEOW_API_URL -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& '.\node_modules\.bin\electron.cmd' .
