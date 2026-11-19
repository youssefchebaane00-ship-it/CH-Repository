# =========================================================
# A tiny local web server for PersonalDashboard.
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#   then open  http://localhost:8080
#
# Why? Installing the app and offline mode only work from a web address,
# not from a double-clicked file. This serves the folder ONLY to your own
# computer (localhost). Nothing goes on the internet. Press Ctrl+C to stop.
#
# Note: http://localhost:8080 and the double-clicked file keep SEPARATE data.
# Move your data once with Settings → Export JSON, then Import JSON.
# =========================================================
param([int]$Port = 8080, [string]$Root = $PSScriptRoot)

$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".json" = "application/json"; ".webmanifest" = "application/manifest+json"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
}
$rootFull = [IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Couldn't start on port $Port (is it already in use?). Try: serve.ps1 -Port 8081" -ForegroundColor Red; exit 1 }
Write-Host "PersonalDashboard is running at http://localhost:$Port  (Ctrl+C to stop)" -ForegroundColor Green

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
    if (-not $path) { $path = "index.html" }
    $file = [IO.Path]::GetFullPath((Join-Path $rootFull $path))
    $response = $context.Response
    # Only serve files inside the project folder, never anything else on the computer
    if ($file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
      $response.Headers.Add("Cache-Control", "no-cache")
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
    }
    $response.Close()
  }
} finally {
  $listener.Stop()
}
