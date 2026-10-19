$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA "Aerus SDM"
$exe = Join-Path $dest "Aerus SDM.exe"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Copying Aerus SDM to $dest"
Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force
$shell = New-Object -ComObject WScript.Shell
$icon = Join-Path $dest "Aeru.ico"
function New-AeruShortcut($path) {
  $link = $shell.CreateShortcut($path)
  $link.TargetPath = $exe
  $link.WorkingDirectory = $dest
  $link.WindowStyle = 1
  $link.Description = "Aerus SDM — Super Disk Management"
  if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
  $link.Save()
}
$desktop = [Environment]::GetFolderPath("Desktop")
$start = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
New-AeruShortcut (Join-Path $desktop "Aerus SDM.lnk")
New-AeruShortcut (Join-Path $start "Aerus SDM.lnk")
Write-Host "Installed. Look for Aerus SDM on the desktop and in the Start Menu."
Start-Process $exe
