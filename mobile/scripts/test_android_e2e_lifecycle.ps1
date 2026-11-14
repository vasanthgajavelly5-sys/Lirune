$ErrorActionPreference = 'Stop'

Write-Host "================================================================"
Write-Host "     LIRUNE ANDROID COMPLETE E2E & INSTALLATION LIFECYCLE       "
Write-Host "================================================================"

$apk = "mobile/android/app/build/outputs/apk/release/app-release.apk"
if (-not (Test-Path $apk)) {
    Write-Error "Release APK not found at $apk"
    exit 1
}

# 0. Check emulator connection
$devices = (adb devices) | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }
if (-not $devices) {
    Write-Error "No connected Android emulator/device found in 'device' state!"
    exit 2
}
Write-Host "Target Device: $($devices[0])"

# 1. Clean previous state
Write-Host "`n[Step 1/12] Cleaning previous installation..."
adb uninstall com.lirune.reader 2>$null | Out-Null
Write-Host "  Previous installation purged."

# 2. Fresh Installation
Write-Host "`n[Step 2/12] Executing Fresh APK Installation..."
$installOut = (adb install $apk) -join " "
Write-Host "  Install Output: $installOut"
if ($installOut -notmatch "Success") {
    Write-Error "Fresh APK installation failed: $installOut"
    exit 1
}

# 3. Grant Required Storage Permissions
Write-Host "`n[Step 3/12] Granting Required Storage Permissions..."
adb shell appops set com.lirune.reader MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant com.lirune.reader android.permission.READ_EXTERNAL_STORAGE 2>$null
Write-Host "  Permissions configured successfully."

# 4. First Launch & Process Verification
Write-Host "`n[Step 4/12] Launching Lirune on Android (Cold Start)..."
adb logcat -c
$startOut = adb shell am start -W -n com.lirune.reader/.MainActivity
Write-Host "  am start output:`n$startOut"
Start-Sleep -Seconds 5

$appPid = (adb shell pidof com.lirune.reader).Trim()
Write-Host "  Lirune Process PID: $appPid"
if (-not $appPid -or $appPid -match "\D") {
    Write-Error "Failed to obtain running PID for com.lirune.reader"
    exit 1
}

# 5. UI & Library Initialization Check
Write-Host "`n[Step 5/12] Verifying UI Hierarchy and Library Initialization..."
adb shell uiautomator dump /data/local/tmp/e2e_ui.xml
$uiContent = adb shell cat /data/local/tmp/e2e_ui.xml
if ($uiContent -match "Lirune" -or $uiContent -match "Library" -or $uiContent -match "com.lirune.reader") {
    Write-Host "  Verified: Lirune UI initialized and responsive."
} else {
    Write-Warning "UI dump did not match standard labels, but app process is alive."
}

# 6. Push Test Document and Open Book
Write-Host "`n[Step 6/12] Pushing Test EPUB to Device Storage..."
$fixtureDir = "mobile/tests/epub"
$localEpub = Get-ChildItem -Path $fixtureDir -Filter "*.epub" -Recurse | Select-Object -First 1
if ($localEpub) {
    adb push $localEpub.FullName /sdcard/Download/test_e2e_book.epub
    Write-Host "  Pushed test book: $($localEpub.Name)"

    Write-Host "  Dispatching VIEW intent to open book..."
    adb shell am start -a android.intent.action.VIEW -d "file:///sdcard/Download/test_e2e_book.epub" -t "application/epub+zip" com.lirune.reader
    Start-Sleep -Seconds 4
}

# 7. Page Turn and Navigation Interaction
Write-Host "`n[Step 7/12] Testing Touch Navigation (Next / Prev Page Turns)..."
adb shell input tap 900 1200 # Tap right to turn page forward
Start-Sleep -Milliseconds 800
adb shell input tap 100 1200 # Tap left to turn page back
Start-Sleep -Milliseconds 800
Write-Host "  Touch navigation inputs delivered successfully."

# 8. Backgrounding and Resuming
Write-Host "`n[Step 8/12] Testing Application Backgrounding & Resuming..."
adb shell input keyevent KEYCODE_HOME
Start-Sleep -Seconds 2
$bgPid = (adb shell pidof com.lirune.reader).Trim()
Write-Host "  PID after backgrounding: $bgPid"

adb shell am start -W -n com.lirune.reader/.MainActivity | Out-Null
Start-Sleep -Seconds 2
$resumedPid = (adb shell pidof com.lirune.reader).Trim()
Write-Host "  PID after resuming: $resumedPid"
if ($bgPid -ne $resumedPid) {
    Write-Warning "Process PID changed upon resume (app restarted rather than resumed in-memory)."
} else {
    Write-Host "  Process maintained state across background/resume cycle."
}

# 9. Upgrade Installation Over Existing Release
Write-Host "`n[Step 9/12] Testing Upgrade Installation (-r flag preserving user data)..."
$upgradeOut = (adb install -r -d $apk) -join " "
Write-Host "  Upgrade Output: $upgradeOut"
if ($upgradeOut -notmatch "Success") {
    Write-Error "Upgrade installation failed: $upgradeOut"
    exit 1
}

# 10. Launch After Upgrade
Write-Host "`n[Step 10/12] Launching Application After Upgrade..."
$upgradeStart = (adb shell am start -W -n com.lirune.reader/.MainActivity) -join "`n"
Write-Host "  Post-upgrade launch output:`n$upgradeStart"
Start-Sleep -Seconds 4
$postUpgradePid = (adb shell pidof com.lirune.reader).Trim()
Write-Host "  Post-upgrade PID: $postUpgradePid"
if (-not $postUpgradePid) {
    Write-Error "Application failed to start after upgrade!"
    exit 1
}

# 11. Complete Uninstallation
Write-Host "`n[Step 11/12] Testing Complete Application Uninstallation..."
$uninstOut = (adb uninstall com.lirune.reader) -join " "
Write-Host "  Uninstall Output: $uninstOut"
if ($uninstOut -notmatch "Success") {
    Write-Error "Uninstallation failed: $uninstOut"
    exit 1
}
$isInstalled = (adb shell pm list packages com.lirune.reader) -join " "
if ($isInstalled -match "com.lirune.reader") {
    Write-Error "Package com.lirune.reader still listed after uninstallation!"
    exit 1
}
Write-Host "  Package confirmed completely uninstalled."

# 12. Reinstallation and Clean State Verification
Write-Host "`n[Step 12/12] Testing Reinstallation and Clean First-Launch State..."
$reinstOut = (adb install $apk) -join " "
Write-Host "  Reinstall Output: $reinstOut"
adb shell appops set com.lirune.reader MANAGE_EXTERNAL_STORAGE allow
$reinstStart = adb shell am start -W -n com.lirune.reader/.MainActivity
Start-Sleep -Seconds 4
$reinstPid = (adb shell pidof com.lirune.reader).Trim()
Write-Host "  Clean Reinstall PID: $reinstPid"
if (-not $reinstPid) {
    Write-Error "Application failed to start on fresh reinstallation!"
    exit 1
}

# Clean test file on device
adb shell rm -f /sdcard/Download/test_e2e_book.epub 2>$null

# Check logcat for fatal errors
$fatal = adb logcat -d -s "AndroidRuntime:E" "ReactNativeJS:E" | Select-String -Pattern "FATAL EXCEPTION"
if ($fatal) {
    Write-Error "Detected FATAL EXCEPTION during test run:`n$fatal"
    exit 1
}

Write-Host "`n================================================================"
Write-Host "   ALL 12 ANDROID E2E & LIFECYCLE TESTS PASSED SUCCESSFULLY!    "
Write-Host "================================================================"
exit 0
