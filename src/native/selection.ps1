# Windows UI Automation으로 현재 포커스된 컨트롤의 "선택된 텍스트"만 읽는다.
# - 선택 영역이 없으면 아무것도 출력하지 않는다. 전체 화면/문서/클립보드는 읽지 않는다.
# - 비밀번호 입력란(IsPassword)은 건너뛴다.
# - 같은 선택이 연속 2회 폴링 동안 유지될 때(드래그 종료) 한 번만 JSON 한 줄로 출력한다.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$candidate = ''
$stable = 0
$emitted = ''

while ($true) {
  Start-Sleep -Milliseconds 350
  $text = ''
  $procId = 0
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) {
      $isPw = $el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)
      if (-not $isPw) {
        $pat = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pat)) {
          $ranges = $pat.GetSelection()
          $parts = @()
          foreach ($r in $ranges) { $parts += $r.GetText(2000) }
          $text = ($parts -join ' ').Trim()
          $procId = $el.Current.ProcessId
        }
      }
    }
  } catch { $text = '' }

  if ([string]::IsNullOrWhiteSpace($text)) { $candidate = ''; $stable = 0; $emitted = ''; continue }
  if ($text -eq $candidate) { $stable++ } else { $candidate = $text; $stable = 1 }
  if ($stable -ge 2 -and $text -ne $emitted) {
    $emitted = $text
    $obj = @{ text = $text; pid = $procId }
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  }
}