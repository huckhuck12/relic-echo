$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'EnemyAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
[EnemyAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
