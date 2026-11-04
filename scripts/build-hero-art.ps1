$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'EquipmentAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'HeroAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
[HeroAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
[EquipmentAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
