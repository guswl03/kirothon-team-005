# 선택 감지 호환성 측정. 지연 시간이 끝나면 (1) 포커스된 컨트롤과 (2) 커서 아래 요소(상위 10단계까지)를
# 한 번 읽어 JSON 한 줄을 출력한다. 앱의 감지(selection.ps1)와 같은 순서다.
# 선택된 텍스트의 내용과 창 제목은 출력하지 않는다(길이, 프로세스 이름, 컨트롤 클래스만).
# 복사 대체 경로는 클립보드를 건드리므로 이 도구에서는 시험하지 않는다.
param([int]$DelaySec = 3)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -Name Dpi -Namespace CCProbe
[void][CCProbe.Dpi]::SetProcessDPIAware()
$DelaySec = [Math]::Min([Math]::Max($DelaySec, 0), 30)
for ($i = $DelaySec; $i -gt 0; $i--) { [Console]::Error.WriteLine("측정할 앱에서 텍스트를 드래그하고 커서를 선택한 글자 위에 두세요... $i"); Start-Sleep 1 }

function ProcInfo([int]$id) {
  $r = @{ name = ''; version = '' }
  try { $p = Get-Process -Id $id; $r.name = $p.ProcessName; try { $r.version = $p.MainModule.FileVersionInfo.ProductVersion } catch { } } catch { }
  return $r
}
function ShortCls($el) { try { $c = [string]$el.Current.ClassName; return $c.Substring(0, [Math]::Min($c.Length, 40)) } catch { return '' } }
# 선택 길이만 센다(내용은 버린다). 비밀번호란이면 -1
function SelLen($el) {
  try {
    if ([bool]$el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)) { return -1 }
    $pat = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pat)) {
      $len = 0
      foreach ($r in $pat.GetSelection()) { $len += ([string]$r.GetText(2000)).Trim().Length }
      return $len
    }
  } catch { }
  return $null
}

$out = @{ ok = $false; proc = ''; version = ''; cls = ''; pattern = $false; password = $false; selLen = 0
          pointOk = $false; pointProc = ''; pointCls = ''; pointPattern = $false; pointPassword = $false; pointSelLen = 0; pointDepth = -1 }
try {
  $el = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -ne $el) {
    $out.ok = $true
    $pi = ProcInfo $el.Current.ProcessId
    $out.proc = $pi.name; $out.version = $pi.version; $out.cls = ShortCls $el
    $n = SelLen $el
    if ($n -eq -1) { $out.password = $true } elseif ($null -ne $n) { $out.pattern = $true; $out.selLen = $n }
  }
} catch { }
try {
  $pos = [System.Windows.Forms.Cursor]::Position
  $pel = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($pos.X, $pos.Y)))
  if ($null -ne $pel) {
    $out.pointOk = $true
    $ppid = $pel.Current.ProcessId
    $pi = ProcInfo $ppid
    $out.pointProc = $pi.name; if (-not $out.version) { $out.version = $pi.version }
    $out.pointCls = ShortCls $pel
    $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
    $cur = $pel
    for ($d = 0; ($d -lt 10) -and ($null -ne $cur); $d++) {
      $n = SelLen $cur
      if ($n -eq -1) { $out.pointPassword = $true; break }
      if ($null -ne $n) {
        $out.pointPattern = $true
        if ($n -gt 0) { $out.pointSelLen = $n; $out.pointDepth = $d; break }
      }
      $next = $walker.GetParent($cur)
      if (($null -eq $next) -or ($next.Current.ProcessId -ne $ppid)) { break }
      $cur = $next
    }
  }
} catch { }
[Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
