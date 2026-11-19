# =========================================================
# Runs the automated tests in a hidden Microsoft Edge window.
#
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -Only phase3
#   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1 -Phone
#
# Each test runs on a COPY of the app in a temporary folder, with its own
# empty browser profile, so your real data is never touched.
# =========================================================
param(
  [string]$Only = "",        # run only test files whose name contains this
  [switch]$Phone             # narrow window + "reduce motion" turned on
)

$ErrorActionPreference = "Stop"
$project = Split-Path $PSScriptRoot -Parent
$work = Join-Path $env:TEMP "personal-dashboard-tests"
New-Item -ItemType Directory -Force $work | Out-Null

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "Microsoft Edge was not found." -ForegroundColor Red; exit 2 }

$size = if ($Phone) { "390,844" } else { "1400,900" }
$extra = if ($Phone) { @("--force-prefers-reduced-motion") } else { @() }
$tests = Get-ChildItem (Join-Path $PSScriptRoot "*.test.js") | Where-Object { $_.Name -like "*$Only*" } | Sort-Object Name
$totalPass = 0; $totalFail = 0

foreach ($test in $tests) {
  $name = $test.BaseName

  # 1. Copy the app and inject an error catcher + the test file
  $site = Join-Path $work "site-$name"
  if (Test-Path $site) { Remove-Item -Recurse -Force $site }
  New-Item -ItemType Directory $site | Out-Null
  $appFiles = @("index.html", "css", "js", "icons", "manifest.webmanifest", "sw.js") | ForEach-Object { Join-Path $project $_ } | Where-Object { Test-Path $_ }
  Copy-Item $appFiles -Destination $site -Recurse
  Copy-Item $test.FullName (Join-Path $site "test.js")
  $html = [IO.File]::ReadAllText((Join-Path $site "index.html"))
  $html = $html.Replace('<head>', '<head><script>window.__errors=[];addEventListener("error",e=>__errors.push(e.message+" @"+(e.filename||"").split("/").pop()+":"+e.lineno));addEventListener("unhandledrejection",e=>__errors.push("promise: "+e.reason));</script>')
  $html = $html.Replace('<script src="js/app.js"></script>', '<script src="js/app.js"></script><script src="test.js"></script>')
  [IO.File]::WriteAllText((Join-Path $site "index.html"), $html)

  # 2. A "seed" page fills the browser with version-1 data, then opens the app.
  #    A test with "@serve" at the top runs from a local web server (http://localhost)
  #    instead of a file, for features that need a web address (service worker).
  $head = (Get-Content $test.FullName -TotalCount 5) -join "`n"
  $server = $null
  if ($head -match '@serve') {
    $webPort = Get-Random -Minimum 8100 -Maximum 8199
    $server = Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $project 'serve.ps1')`"", "-Port", $webPort, "-Root", "`"$site`"") -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 1500
    $siteUrl = "http://localhost:$webPort/index.html"
    [IO.File]::WriteAllText((Join-Path $site "seed.html"), [IO.File]::ReadAllText((Join-Path $PSScriptRoot "seed-v1.html")).Replace("__SITE__", $siteUrl))
    $seedUrl = "http://localhost:$webPort/seed.html"
  } else {
    $siteUrl = "file:///" + ((Join-Path $site "index.html") -replace '\\', '/')
    $seedFile = Join-Path $work "seed-$name.html"
    [IO.File]::WriteAllText($seedFile, [IO.File]::ReadAllText((Join-Path $PSScriptRoot "seed-v1.html")).Replace("__SITE__", $siteUrl))
    $seedUrl = "file:///" + ($seedFile -replace '\\', '/')
  }

  # 3. Run Edge without a window and save the final page
  $profileDir = Join-Path $work "profile-$name"
  if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir }
  $out = Join-Path $work "$name-dom.html"
  # Most tests use a fast "fake clock" (virtual time) and Edge saves the page at the end.
  # A test that uses IndexedDB (which doesn't work with the fake clock) asks for the
  # real clock with a "// @real-time 30000" line at the top. Then Edge runs normally
  # and we read the result from the page title through Edge's local debugging port.
  $realTime = [regex]::Match($head, '@real-time\s+(\d+)')

  if ($realTime.Success) {
    $port = Get-Random -Minimum 9300 -Maximum 9399
    $edgeArgs = @("--headless=new", "--disable-gpu", "--user-data-dir=`"$profileDir`"", "--window-size=$size",
                  "--remote-debugging-port=$port", "--remote-allow-origins=http://127.0.0.1:$port") + $extra + @($seedUrl)
    $null = Start-Process -FilePath $edge -ArgumentList $edgeArgs -PassThru -RedirectStandardError (Join-Path $work "$name.log")
    $deadline = (Get-Date).AddMilliseconds([int]$realTime.Groups[1].Value)
    $title = ""
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 1000
      try {
        $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json" -TimeoutSec 2
        $title = ($pages | Where-Object { $_.type -eq "page" } | Select-Object -First 1).title
        if ($title -like "TEST-DONE*") { break }
      } catch {}
    }
    # Close this test's Edge (only the processes using this test's own profile folder) and its web server
    Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -like "*$profileDir*" } |
      ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
    if ($server) { try { Stop-Process -Id $server.Id -Force -ErrorAction Stop } catch {} }

    if ($title -notlike "TEST-DONE*") {
      Write-Host "=== $name : NO RESULTS (the test did not finish in time) ===" -ForegroundColor Red
      if ($title) { Write-Host "  Last progress: $title" }
      $totalFail++
      continue
    }
    # Title format: "TEST-DONE <passed> <failed> || failure 1 || failure 2 ..."
    $parts = $title.Substring(10) -split " \|\| "
    $counts = $parts[0].Trim() -split " "
    $pass = [int]$counts[0]; $fail = [int]$counts[1]
    $totalPass += $pass; $totalFail += $fail
    $color = if ($fail) { "Red" } else { "Green" }
    Write-Host "=== $name : $pass passed, $fail failed ===" -ForegroundColor $color
    $parts | Select-Object -Skip 1 | ForEach-Object { Write-Host "  $_" }
    continue
  }

  $edgeArgs = @("--headless=new", "--disable-gpu", "--user-data-dir=`"$profileDir`"", "--window-size=$size", "--virtual-time-budget=30000") + $extra +
              @("--dump-dom", $seedUrl)
  Start-Process -FilePath $edge -ArgumentList $edgeArgs -RedirectStandardOutput $out -RedirectStandardError (Join-Path $work "$name.log") -Wait -NoNewWindow
  if ($server) { try { Stop-Process -Id $server.Id -Force -ErrorAction Stop } catch {} }

  # 4. Read the results the test wrote into the page
  $dom = [IO.File]::ReadAllText($out)
  $match = [regex]::Match($dom, '<pre id="test-output">([\s\S]*?)</pre>')
  if (-not $match.Success) {
    Write-Host "=== $name : NO RESULTS (the test did not finish) ===" -ForegroundColor Red
    # Show how far it got, if the test reports progress
    $partial = [regex]::Match($dom, '<pre id="test-progress">([\s\S]*?)</pre>')
    if ($partial.Success) {
      $done = [System.Net.WebUtility]::HtmlDecode($partial.Groups[1].Value) -split "`n"
      Write-Host "  Last steps before it stopped:"
      $done | Select-Object -Last 4 | ForEach-Object { Write-Host "    $_" }
    }
    $totalFail++
    continue
  }
  $lines = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value) -split "`n"
  $pass = ($lines | Where-Object { $_ -like "PASS*" }).Count
  $fail = ($lines | Where-Object { $_ -like "FAIL*" -or $_ -like "CRASH*" }).Count
  $errorsLine = $lines | Where-Object { $_ -like "JS ERRORS:*" }
  if ($errorsLine -and $errorsLine -notlike "*none") { $fail++ }
  $totalPass += $pass; $totalFail += $fail
  $color = if ($fail) { "Red" } else { "Green" }
  Write-Host "=== $name : $pass passed, $fail failed ===" -ForegroundColor $color
  $lines | Where-Object { $_ -like "FAIL*" -or $_ -like "CRASH*" -or $_ -like "  at*" -or $_ -like "JS ERRORS:*" -or $_ -like "VIEWPORT*" } | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
$summaryColor = if ($totalFail) { "Red" } else { "Green" }
Write-Host "TOTAL: $totalPass passed, $totalFail failed" -ForegroundColor $summaryColor
if ($totalFail) { exit 1 } else { exit 0 }
