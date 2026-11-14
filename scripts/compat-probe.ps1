# 선택 감지 호환성 측정. 3초 뒤 "포커스된 컨트롤"을 한 번 읽어 JSON 한 줄을 출력한다.
# 선택된 텍스트의 내용과 창 제목은 출력하지 않는다(길이, 프로세스 이름, 컨트롤 클래스만).
param([int]$DelaySec = 3)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$DelaySec = [Math]::Min([Math]::Max($DelaySec, 0), 30)
for ($i = $DelaySec; $i -gt 0; $i--) { [Console]::Error.WriteLine("측정 대상 프로그램에서 텍스트를 선택하세요... $i"); Start-Sleep 1 }

$out = @{ proc = ''; version = ''; cls = ''; pattern = $false; password = $false; selLen = 0; ok = $false }
try {
  $el = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -ne $el) {
    $out.ok = $true
    $p = Get-Process -Id $el.Current.ProcessId
    $out.proc = $p.ProcessName
    try { $out.version = $p.MainModule.FileVersionInfo.ProductVersion } catch { }
    $cls = [string]$el.Current.ClassName
    $out.cls = $cls.Substring(0, [Math]::Min($cls.Length, 40))
    $out.password = [bool]$el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)
    if (-not $out.password) {
      $pat = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pat)) {
        $out.pattern = $true
        $len = 0
        foreach ($r in $pat.GetSelection()) { $len += ([string]$r.GetText(2000)).Length }
        $out.selLen = $len
      }
    }
  }
} catch { }
[Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))