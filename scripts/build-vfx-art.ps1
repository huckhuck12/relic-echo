$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'VfxAtlasBuilder.cs') -ReferencedAssemblies System.Drawing
[VfxAtlasBuilder]::Build((Split-Path $PSScriptRoot -Parent))
