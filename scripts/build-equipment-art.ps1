$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'EquipmentAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
[EquipmentAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
