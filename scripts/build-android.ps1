# Build and install Lirune Android app
$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Users\vasanth\jdk17"
$env:ANDROID_HOME = "C:\Users\vasanth\android-sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\vasanth\android-sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Write-Host "JAVA_HOME: $env:JAVA_HOME"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

Set-Location "$PSScriptRoot\..\mobile\android"

Write-Host "Running gradlew.bat assembleDebug..."
cmd.exe /c "gradlew.bat assembleDebug"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle build failed with exit code $LASTEXITCODE"
}

Write-Host "Build complete! Checking APK..."
$apkPath = "$PSScriptRoot\..\mobile\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $apkItem = Get-Item $apkPath
    Write-Host "APK built successfully: $apkPath ($($apkItem.Length) bytes)"
} else {
    Write-Error "APK not found at $apkPath"
}
