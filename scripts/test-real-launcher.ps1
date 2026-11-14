$ErrorActionPreference = 'Stop'

Write-Host "================================================================"
Write-Host "       REAL WINDOWS LAUNCHER EXECUTION & LIFECYCLE TEST         "
Write-Host "================================================================"

$root = (Get-Location).Path
$bat = Join-Path $root 'Launch-Lirune.bat'
$version = (Get-Content (Join-Path $root 'package.json') | ConvertFrom-Json).version
$installer = Join-Path $root "dist\Lirune Reader-$version-Setup.exe"
$targetDir = Join-Path $env:LOCALAPPDATA 'Programs\Lirune Reader'
$installedExe = Join-Path $targetDir 'Lirune Reader.exe'
$uninstaller = Join-Path $targetDir 'Uninstall Lirune Reader.exe'

if (-not (Test-Path $installer)) {
    Write-Error "Installer not found at $installer"
    exit 1
}

# 1. Fresh Installation
Write-Host "`n[Scenario 1/6] Fresh Silent Installation to path with spaces..."
Write-Host "  Target: $targetDir"
$p = Start-Process -FilePath $installer -ArgumentList "/S", "/D=$targetDir" -Wait -PassThru
if ($p.ExitCode -ne 0) {
    Write-Error "Installer exited with failure: $($p.ExitCode)"
    exit 1
}
if (-not (Test-Path $installedExe)) {
    Write-Error "Installed executable not found: $installedExe"
    exit 1
}
Write-Host "  Installed executable verified: $installedExe (Size: $((Get-Item $installedExe).Length) bytes)"

# Temporarily move unpacked build if present so BAT exercises Priority 2 (installed user app)
$unpackedDir = Join-Path $root 'dist\win-unpacked'
$unpackedBak = Join-Path $root 'dist\win-unpacked.bak'
if (Test-Path $unpackedDir) {
    Rename-Item $unpackedDir $unpackedBak
}

try {
    # 2. Real BAT Launch from Unrelated Working Directory
    Write-Host "`n[Scenario 2/6] Real BAT Launch from Unrelated Working Directory (C:\)..."
    $unrelatedCwd = [System.IO.Path]::GetTempPath()
    
    # We execute cmd.exe /c "<path-to-bat>" from the temp working directory
    $batProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$bat`"" -WorkingDirectory $unrelatedCwd -PassThru
    Start-Sleep -Seconds 4

    # Find the real process
    $found = Get-Process | Where-Object { $_.Path -and $_.Path.Equals($installedExe, [System.StringComparison]::OrdinalIgnoreCase) }
    if (-not $found) {
        # Check by ProcessName
        $found = Get-Process -Name "Lirune Reader" -ErrorAction SilentlyContinue
    }

    if (-not $found) {
        Write-Error "Launch-Lirune.bat failed to launch installed application from unrelated CWD!"
        exit 1
    }

    Write-Host "  SUCCESS: Real Process Verified:"
    foreach ($proc in $found) {
        Write-Host "    PID: $($proc.Id), Name: $($proc.ProcessName), Path: $($proc.Path), WorkingSet: $([math]::Round($proc.WorkingSet64/1MB, 2)) MB"
    }

    # Terminate the test process
    $found | Stop-Process -Force
    Start-Sleep -Seconds 2

    # 3. Upgrade Installation
    Write-Host "`n[Scenario 3/6] Upgrade Installation over Existing App..."
    $upgradeProc = Start-Process -FilePath $installer -ArgumentList "/S", "/D=$targetDir" -Wait -PassThru
    if ($upgradeProc.ExitCode -ne 0) {
        Write-Error "Upgrade installer failed: $($upgradeProc.ExitCode)"
        exit 1
    }
    Write-Host "  Upgrade installation completed with exit code 0."

    # 4. Real BAT Launch After Upgrade
    Write-Host "`n[Scenario 4/6] Real BAT Launch After Upgrade..."
    $batProc2 = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$bat`"" -WorkingDirectory $root -PassThru
    Start-Sleep -Seconds 4

    $found2 = Get-Process -Name "Lirune Reader" -ErrorAction SilentlyContinue
    if (-not $found2) {
        Write-Error "Launch-Lirune.bat failed to launch application after upgrade!"
        exit 1
    }
    Write-Host "  SUCCESS: Post-upgrade Process Verified: PID $($found2[0].Id)"
    $found2 | Stop-Process -Force
    Start-Sleep -Seconds 2

} finally {
    if (Test-Path $unpackedBak) {
        Rename-Item $unpackedBak $unpackedDir
        Write-Host "  Restored dist\win-unpacked."
    }
}

# 5. Clean Uninstallation
Write-Host "`n[Scenario 5/6] Clean Uninstallation via NSIS Uninstaller..."
$uninstProc = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
Start-Sleep -Seconds 4
if (Test-Path $installedExe) {
    Write-Error "Installed executable still exists after uninstallation!"
    exit 1
}
Write-Host "  Executable successfully removed."

# 6. Missing Executable Fallback Behavior
Write-Host "`n[Scenario 6/6] Testing Missing Executable Handling..."
# With uninstalled app, validate-only verifies finding available target
$valResult = (& cmd.exe /c "`"$bat`"" --validate-only) -join " "
Write-Host "  Validate output: $valResult"
if ($valResult -notmatch "verified") {
    Write-Error "Launcher did not handle fallback validation properly!"
    exit 1
}
Write-Host "  Verified fallback and error handling."

Write-Host "`n================================================================"
Write-Host "    ALL 6 REAL WINDOWS LAUNCHER SCENARIOS PASSED CLEANLY!       "
Write-Host "================================================================"
exit 0
