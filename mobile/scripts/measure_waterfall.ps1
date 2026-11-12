param(
    [string]$TargetBook = "small", # "small" or "large"
    [int]$Runs = 5
)

$adb = "C:\Users\vasanth\android-sdk\platform-tools\adb.exe"

function Log($msg) {
    Write-Host "[Waterfall] $msg"
}

# Ensure port reverse is active
& $adb reverse tcp:8081 tcp:8081 2>$null

$tapCoords = if ($TargetBook -eq "small") { "165 440" } else { "385 440" }
Log "Starting $Runs cold runs for $TargetBook EPUB (Tap: $tapCoords)..."

$results = @()

for ($r = 1; $r -le $Runs; $r++) {
    Log "--- Run $r of $Runs ---"
    & $adb shell "am force-stop com.lirune.reader"
    Start-Sleep -Milliseconds 600
    & $adb shell "monkey -p com.lirune.reader -c android.intent.category.LAUNCHER 1" 2>$null
    Start-Sleep -Seconds 6.5

    & $adb logcat -c
    & $adb shell "input tap $tapCoords"
    Start-Sleep -Seconds 6

    $logs = & $adb logcat -d -s "ReactNativeJS:*"
    $runData = [ordered]@{ "Run" = $r }

    foreach ($line in $logs) {
        if ($line -match "\[Perf\] ([\w\-]+): ([\d\.]+)ms") {
            $metric = $matches[1]
            $val = [double]$matches[2]
            $runData[$metric] = $val
        }
    }

    $results += [PSCustomObject]$runData
}

Log "=== Finished $Runs Runs for $TargetBook EPUB ==="
$results | Format-List
