$formats = @('*.epub', '*.pdf', '*.txt', '*.html', '*.fb2', '*.cbz')
$searchRoots = @('C:\Users\vasanth\Downloads', 'C:\Users\vasanth\Documents', 'C:\Users\vasanth\Desktop')
$excludePatterns = @('*mobile\test-fixtures*', '*node_modules*', '*\.git*', '*LiruneQA*', '*epub-short*', '*epub-long*', '*pdf-small*', '*cbz-small*', '*cbz-large*', '*corrupt.epub*', '*external_test*', '*Welcome to Lirune*')

foreach ($fmt in $formats) {
    Write-Host "=== FORMAT: $fmt ==="
    $found = @()
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            $files = Get-ChildItem -Path $root -Filter $fmt -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
                $p = $_.FullName
                $matched = $false
                foreach ($exc in $excludePatterns) {
                    if ($p -like $exc) { $matched = $true; break }
                }
                -not $matched
            }
            if ($files) { $found += $files }
        }
    }
    Write-Host "Total found for $fmt : $($found.Count)"
    $found | Select-Object -First 10 | ForEach-Object {
        Write-Host ('{0} | {1} bytes | {2}' -f $_.Name, $_.Length, $_.FullName)
    }
}
