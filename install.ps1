<#
  VaelMail Desktop installer for Windows.

    irm https://raw.githubusercontent.com/vaelmail/vaelmail-desktop/main/install.ps1 | iex

  Options (use the scriptblock form to pass them):

    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/vaelmail/vaelmail-desktop/main/install.ps1))) -Quiet

    -Quiet       install without showing the setup window
    -Uninstall   open the uninstaller
    -NoLaunch    don't open VaelMail after a quiet install
#>
param(
  [switch]$Quiet,
  [switch]$Uninstall,
  [switch]$NoLaunch
)

function Install-VaelMail {
  param([switch]$Quiet, [switch]$Uninstall, [switch]$NoLaunch)

  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

  $Repo = 'vaelmail/vaelmail-desktop'
  $Product = 'VaelMail'
  $Download = "https://github.com/$Repo/releases/latest/download"
  $UninstallKey = "Software\Microsoft\Windows\CurrentVersion\Uninstall\$Product"

  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}
  try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

  $esc = [char]27
  $ansi = $false
  if ($env:WT_SESSION -or $env:TERM_PROGRAM -eq 'vscode' -or ($PSVersionTable.PSVersion.Major -ge 7 -and $Host.UI.SupportsVirtualTerminal)) { $ansi = $true }
  if ($env:NO_COLOR) { $ansi = $false }

  $block = [string][char]0x2588
  $heavy = [string][char]0x2501
  $light = [string][char]0x2500
  $dot = [string][char]0x00B7
  $check = if ($ansi) { [string][char]0x2713 } else { '+' }
  $cross = if ($ansi) { [string][char]0x2717 } else { 'x' }
  $spinner = if ($ansi) { @(0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F) | ForEach-Object { [string][char]$_ } } else { @('|', '/', '-', '\') }

  function Paint([string]$text, [string]$rgb, [ConsoleColor]$fallback, [switch]$Bold, [switch]$NoNewline) {
    if ($ansi) {
      $parts = $rgb.Split(',')
      $weight = if ($Bold) { "$esc[1m" } else { '' }
      Write-Host "$weight$esc[38;2;$($parts[0]);$($parts[1]);$($parts[2])m$text$esc[0m" -NoNewline:$NoNewline
    } else {
      Write-Host $text -ForegroundColor $fallback -NoNewline:$NoNewline
    }
  }

  $Accent = '185,215,120'
  $Soft = '232,237,228'
  $Dim = '120,138,128'
  $Logo = '214,201,168'
  $Red = '240,110,100'
  $Yellow = '240,200,100'

  function Say([string]$text) { Write-Host "  $text" }
  function Ok([string]$text) { Write-Host '  ' -NoNewline; Paint $check $Accent Green -NoNewline; Write-Host " $text" }
  function Warn([string]$text) { Write-Host '  ' -NoNewline; Paint '!' $Yellow Yellow -NoNewline; Write-Host " $text" }
  function Fail([string]$text) { Write-Host '  ' -NoNewline; Paint $cross $Red Red -NoNewline; Write-Host " $text" }
  function Muted([string]$text) { Write-Host '  ' -NoNewline; Paint $text $Dim DarkGray }
  function Row([string]$name, [string]$value) {
    Write-Host '  ' -NoNewline
    Paint $name.PadRight(12) $Dim DarkGray -NoNewline
    Write-Host $value
  }
  function Rule { Write-Host '  ' -NoNewline; Paint ($light * 58) $Dim DarkGray }

  function Banner {
    Write-Host ''
    $b2 = $block * 2
    Write-Host '  ' -NoNewline; Paint $b2 $Logo DarkYellow -NoNewline; Write-Host '    ' -NoNewline; Paint $b2 $Soft White -NoNewline; Write-Host '   ' -NoNewline; Paint 'VaelMail Desktop' $Soft White -Bold
    Write-Host '   ' -NoNewline; Paint $b2 $Logo DarkYellow -NoNewline; Write-Host '  ' -NoNewline; Paint $b2 $Soft White -NoNewline; Write-Host '    ' -NoNewline; Paint 'private email, at home' $Accent Green
    Write-Host '    ' -NoNewline; Paint $b2 $Logo DarkYellow -NoNewline; Paint $b2 $Soft White
    Write-Host '     ' -NoNewline; Paint $b2 $Soft White
    Write-Host ''
  }

  function Stop-WithError([string]$text) {
    Write-Host ''
    Fail $text
    Write-Host ''
    throw [System.OperationCanceledException]::new($text)
  }

  function Get-Installed {
    foreach ($hive in @('HKCU', 'HKLM')) {
      $path = "${hive}:\$UninstallKey"
      if (Test-Path $path) {
        $item = Get-ItemProperty $path
        return [pscustomobject]@{
          Version   = $item.DisplayVersion
          Location  = ($item.InstallLocation -replace '"', '')
          Uninstall = ($item.UninstallString -replace '"', '')
        }
      }
    }
    return $null
  }

  function Get-LatestVersion {
    try {
      $request = [Net.WebRequest]::Create("https://github.com/$Repo/releases/latest")
      $request.Method = 'HEAD'
      $request.AllowAutoRedirect = $true
      $request.UserAgent = 'VaelMail-Installer'
      $response = $request.GetResponse()
      $url = $response.ResponseUri.AbsoluteUri
      $response.Close()
      if ($url -match '/tag/v([^/]+)$') { return $Matches[1] }
    } catch {}
    return $null
  }

  function Format-Size([long]$bytes) {
    if ($bytes -ge 1MB) { return '{0:N1} MB' -f ($bytes / 1MB) }
    return '{0:N0} KB' -f ($bytes / 1KB)
  }

  function Save-File([string]$url, [string]$path, [string]$label) {
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(30)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('VaelMail-Installer')
    $response = $null
    $source = $null
    $target = $null
    try {
      $response = $client.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      if (-not $response.IsSuccessStatusCode) { throw "HTTP $([int]$response.StatusCode)" }
      $total = $response.Content.Headers.ContentLength
      $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $target = [IO.File]::Open($path, [IO.FileMode]::Create)
      $buffer = New-Object byte[] 131072
      $done = [long]0
      $tick = 0
      $width = 28
      $last = [DateTime]::MinValue
      try { [Console]::CursorVisible = $false } catch {}
      while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $target.Write($buffer, 0, $read)
        $done += $read
        if (([DateTime]::UtcNow - $last).TotalMilliseconds -ge 90) {
          $last = [DateTime]::UtcNow
          $spin = $spinner[$tick % $spinner.Count]
          $tick++
          Write-Host "`r  " -NoNewline
          Paint $spin $Accent Green -NoNewline
          Write-Host " $label  " -NoNewline
          if ($total -and $total -gt 0) {
            $filled = [Math]::Min($width, [int][Math]::Floor($done * $width / $total))
            $percent = [int][Math]::Floor($done * 100 / $total)
            if ($ansi) {
              Paint ($heavy * $filled) $Accent Green -NoNewline
              Paint ($light * ($width - $filled)) $Dim DarkGray -NoNewline
            } else {
              Paint ('#' * $filled) $Accent Green -NoNewline
              Paint ('-' * ($width - $filled)) $Dim DarkGray -NoNewline
            }
            Paint ('  {0,3}%  {1}    ' -f $percent, (Format-Size $done)) $Dim DarkGray -NoNewline
          } else {
            Paint ("{0}    " -f (Format-Size $done)) $Dim DarkGray -NoNewline
          }
        }
      }
      $target.Close()
      $target = $null
      Write-Host ("`r" + (' ' * ([Math]::Max(20, $label.Length + 60)))) -NoNewline
      Write-Host "`r" -NoNewline
      Ok "$label  $(Format-Size $done)"
    } finally {
      try { [Console]::CursorVisible = $true } catch {}
      if ($target) { $target.Close() }
      if ($source) { $source.Dispose() }
      if ($response) { $response.Dispose() }
      $client.Dispose()
    }
  }

  function Wait-Process-WithSpinner([System.Diagnostics.Process]$process, [string]$label) {
    $null = $process.Handle
    $tick = 0
    try { [Console]::CursorVisible = $false } catch {}
    try {
      while (-not $process.HasExited) {
        Write-Host "`r  " -NoNewline
        Paint $spinner[$tick % $spinner.Count] $Accent Green -NoNewline
        Write-Host " $label" -NoNewline
        $tick++
        Start-Sleep -Milliseconds 100
      }
    } finally {
      try { [Console]::CursorVisible = $true } catch {}
    }
    Write-Host ("`r" + (' ' * ($label.Length + 6)) + "`r") -NoNewline
  }

  Banner

  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    Stop-WithError 'This script is for Windows. On Linux and macOS, use install.sh from the same place.'
  }

  $build = [Environment]::OSVersion.Version.Build
  if ([Environment]::OSVersion.Version.Major -lt 10) {
    Stop-WithError 'VaelMail needs Windows 10 or 11.'
  }

  $machine = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($machine) {
    'AMD64' { $arch = 'x64'; $archLabel = 'x64' }
    'ARM64' {
      $arch = 'arm64'; $archLabel = 'arm64'
      if ($build -lt 22000) { $arch = 'x64'; $archLabel = 'arm64, using the x64 build' }
    }
    default { Stop-WithError "VaelMail is built for x64 and arm64. This PC is $machine." }
  }

  $windowsName = if ($build -ge 22000) { 'Windows 11' } else { 'Windows 10' }
  $installed = Get-Installed
  $latest = if ($Uninstall) { $null } else { Get-LatestVersion }

  Row 'System' "$windowsName $dot $archLabel"
  if ($installed) {
    Row 'Installed' "$($installed.Version)"
  } else {
    Write-Host '  ' -NoNewline; Paint 'Installed'.PadRight(12) $Dim DarkGray -NoNewline; Paint 'not installed' $Dim DarkGray
  }
  if (-not $Uninstall) {
    if ($latest) { Row 'Latest' $latest } else { Write-Host '  ' -NoNewline; Paint 'Latest'.PadRight(12) $Dim DarkGray -NoNewline; Paint 'unknown' $Dim DarkGray }
  }
  Write-Host ''

  if ($Uninstall) {
    if (-not $installed -or -not (Test-Path $installed.Uninstall)) {
      Say 'VaelMail isn''t installed. Nothing to remove.'
      Write-Host ''
      return
    }
    $process = Start-Process -FilePath $installed.Uninstall -PassThru
    Wait-Process-WithSpinner $process 'Waiting for the uninstaller'
    $tick = 0
    while ((Get-Process -Name 'Un_A', 'Un_B', 'Un_C', 'Au_' -ErrorAction SilentlyContinue) -and $tick -lt 36000) {
      Start-Sleep -Milliseconds 200
      $tick++
    }
    if (Get-Installed) {
      Say 'VaelMail is still installed. Nothing was changed.'
    } else {
      Ok 'VaelMail was removed.'
      Muted 'Your mail is still waiting at vaelmail.com.'
    }
    Write-Host ''
    return
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ("vaelmail-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $setup = Join-Path $work "VaelMail-setup.exe"

  try {
    $label = if ($latest) { "Downloading VaelMail $latest" } else { 'Downloading VaelMail' }
    try {
      Save-File "$Download/VaelMail-windows-$arch-setup.exe" $setup $label
    } catch {
      Write-Host ''
      Stop-WithError "The download failed: $($_.Exception.Message). Check your connection and try again."
    }

    $signature = Get-AuthenticodeSignature -FilePath $setup -ErrorAction SilentlyContinue
    if ($signature -and $signature.Status -eq 'HashMismatch') {
      Stop-WithError 'The download is damaged. Try again.'
    }

    if ($Quiet) {
      $arguments = @('/S')
      $process = Start-Process -FilePath $setup -ArgumentList $arguments -PassThru
      Wait-Process-WithSpinner $process 'Installing VaelMail'
    } else {
      Say 'The VaelMail setup window is open. Finish there.'
      Muted 'It doesn''t need administrator rights.'
      Write-Host ''
      $process = Start-Process -FilePath $setup -PassThru
      Wait-Process-WithSpinner $process 'Waiting for setup'
    }

    $after = Get-Installed
    if ($process.ExitCode -ne 0 -or -not $after) {
      Say 'Setup was closed before it finished. Nothing was changed.'
      Write-Host ''
      return
    }

    Write-Host ''
    Rule
    Write-Host '  ' -NoNewline; Paint $check $Accent Green -NoNewline; Paint " VaelMail $($after.Version) is ready." $Soft White -Bold
    Muted 'Sign in with your account number and pick up where you left off.'
    Muted 'It updates itself. Run this again any time to repair or remove it.'
    Rule
    Write-Host ''

    if ($Quiet -and -not $NoLaunch -and $after.Location) {
      $exe = Join-Path $after.Location 'vaelmail-desktop.exe'
      if (Test-Path $exe) { Start-Process -FilePath $exe }
    }
  } finally {
    Remove-Item -Recurse -Force -Path $work -ErrorAction SilentlyContinue
  }
}

try {
  Install-VaelMail -Quiet:$Quiet -Uninstall:$Uninstall -NoLaunch:$NoLaunch
} catch [System.OperationCanceledException] {
} catch {
  Write-Host ''
  Write-Host "  x $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ''
}
