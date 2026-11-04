$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'DirectionalEnemyAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
[DirectionalEnemyAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
