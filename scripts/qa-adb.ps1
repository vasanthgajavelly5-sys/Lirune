# Lirune Reader Android QA helper
# Usage (from repo root):
#   .\scripts\qa-adb.ps1 shot <name>          capture a screenshot to temp
#   .\scripts\qa-adb.ps1 tap <x> <y>          tap
#   .\scripts\qa-adb.ps1 swipe <x1> <y1> <x2> <y2> [ms]
#   .\scripts\qa-adb.ps1 text <string>         type into the focused field
#   .\scripts\qa-adb.ps1 key <keycode>         e.g. BACK, ENTER, HOME
#   .\scripts\qa-adb.ps1 back                 press hardware back
#   .\scripts\qa-adb.ps1 launch                cold-start the app
#   .\scripts\qa-adb.ps1 stop                 force-stop the app
#   .\scripts\qa-adb.ps1 restart              force-stop then start
#   .\scripts\qa-adb.ps1 pidof                 is the app running?
#   .\scripts\qa-adb.ps1 errs [lines]         recent fatal/error log lines
#   .\scripts\qa-adb.ps1 clear-log            wipe logcat
#   .\scripts\qa-adb.ps1 devices              list devices

param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Cmd,
  [Parameter(Position = 1)][string]$A,
  [Parameter(Position = 2)][string]$B,
  [Parameter(Position = 3)][string]$C,
  [Parameter(Position = 4)][string]$D
)

$ErrorActionPreference = 'Continue'
$adb = 'C:\platform-tools\adb.exe'
$serial = 'emulator-5554'
$pkg = 'com.lirune.reader'
$shotDir = 'C:\Users\vasanth\AppData\Local\Temp\kilo\shots'

function Adb { & $adb -s $serial @args }

switch ($Cmd.ToLower()) {
  'devices' { & $adb devices -l }

  'shot' {
    if (-not (Test-Path $shotDir)) { New-Item -ItemType Directory -Path $shotDir | Out-Null }
    $name = if ($A) { $A } else { "shot-{0}" -f (Get-Date -Format 'HHmmss') }
    $out = Join-Path $shotDir "$name.png"
    # Use cmd.exe /c redirection to preserve raw binary stream in Windows PowerShell 5.1
    cmd.exe /c "`"$adb`" -s $serial exec-out screencap -p > `"$out`""
    $len = (Get-Item $out).Length
    Write-Output "$out ($len bytes)"
  }

  'tap'   { Adb shell input tap $A $B; Write-Output "tapped $A,$B" }
  'swipe' { $ms = if ($D) { $D } else { '300' }; Adb shell input swipe $A $B $C $ms; Write-Output "swiped $A,$B -> $C" }
  'text'  { Adb shell input text ($A -replace ' ', '%s'); Write-Output "typed" }
  'key'   { Adb shell input keyevent $A; Write-Output "key $A" }
  'back'  { Adb shell input keyevent 4; Write-Output "back" }

  'launch' {
    $act = (Adb shell cmd package resolve-activity --brief $pkg | Select-Object -Last 1).Trim()
    if (-not $act) { Write-Output "could not resolve activity"; break }
    Adb shell am start -n $act | Out-Null
    Write-Output "launched $act"
  }
  'stop'    { Adb shell am force-stop $pkg; Write-Output 'stopped' }
  'restart' {
    Adb shell am force-stop $pkg
    Start-Sleep -Milliseconds 800
    $act = (Adb shell cmd package resolve-activity --brief $pkg | Select-Object -Last 1).Trim()
    Adb shell am start -n $act | Out-Null
    Write-Output "restarted $act"
  }
  'pidof'   { $p = (Adb shell pidof $pkg 2>$null | Out-String).Trim(); if ($p) { Write-Output "ALIVE pid=$p" } else { Write-Output 'NOT RUNNING (not installed, or not running)' } }

  'clear-log' { Adb logcat -c; Write-Output 'log cleared' }
  'errs' {
    $n = if ($A) { $A } else { '60' }
    Adb logcat -d -t 400 | Select-String -Pattern 'FATAL|AndroidRuntime|ReactNativeJS|Exception|Error|Unable to load|ANR' | Select-Object -Last $n
  }
  default { Write-Output "unknown command: $Cmd" }
}
