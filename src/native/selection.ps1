# Windows UI Automation으로 현재 포커스된 컨트롤의 "선택된 텍스트"만 읽는다.
# - 선택 영역이 없으면 아무것도 출력하지 않는다. 전체 화면/문서/클립보드는 읽지 않는다.
# - 비밀번호 입력란(IsPassword)은 건너뛴다.
# - 같은 선택이 StableCount회 연속 유지될 때 한 번만 JSON 한 줄로 출력한다.
# - 텍스트 컨트롤 안에서 시작한 마우스 드래그가 끝났는데 그 컨트롤이 TextPattern을 제공하지 않으면
#   텍스트 없이 {"type":"unsupported"}만 프로세스당 한 번 보고한다.
param(
  [int]$IntervalMs = 350,
  [int]$StableCount = 2
)
$ErrorActionPreference = 'SilentlyContinue'
$IntervalMs = [Math]::Min([Math]::Max($IntervalMs, 100), 2000)
$StableCount = [Math]::Min([Math]::Max($StableCount, 1), 10)
$TickMs = 50   # 마우스 버튼 샘플링 주기(짧은 드래그를 놓치지 않기 위해 읽기 주기보다 촘촘하게)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$sig = '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);'
Add-Type -MemberDefinition $sig -Name Native -Namespace CC
# 주 버튼: 버튼 교체(왼손잡이) 설정이면 오른쪽 버튼(0x02), 아니면 왼쪽(0x01)
$PrimaryVk = 1
if ([CC.Native]::GetSystemMetrics(23) -ne 0) { $PrimaryVk = 2 }

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$candidate = ''
$stable = 0
$emitted = ''
$wasDown = $false
$moved = $false
$startPos = [System.Windows.Forms.Cursor]::Position
$reported = @{}
$elapsed = 0

while ($true) {
  Start-Sleep -Milliseconds $TickMs
  $elapsed += $TickMs

  # 드래그 감지: 주 버튼을 누른 채 8px 이상 움직인 뒤 뗀 순간
  $down = ([CC.Native]::GetAsyncKeyState($PrimaryVk) -band 0x8000) -ne 0
  $pos = [System.Windows.Forms.Cursor]::Position
  if ($down -and -not $wasDown) { $startPos = $pos; $moved = $false }
  if ($down -and ([Math]::Abs($pos.X - $startPos.X) + [Math]::Abs($pos.Y - $startPos.Y)) -gt 8) { $moved = $true }
  $dragEnded = (-not $down) -and $wasDown -and $moved
  $wasDown = $down
  if ($down) { continue }                                  # 드래그 중에는 읽지 않는다
  if ((-not $dragEnded) -and ($elapsed -lt $IntervalMs)) { continue }
  $elapsed = 0

  $text = ''
  $procId = 0
  $hasPattern = $true
  $isPw = $false
  $startInside = $false
  try {
    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($null -ne $el) {
      $procId = $el.Current.ProcessId
      $isPw = [bool]$el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)
      if (-not $isPw) {
        $pat = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pat)) {
          $ranges = $pat.GetSelection()
          $parts = @()
          foreach ($r in $ranges) { $parts += $r.GetText(2000) }
          $text = ($parts -join ' ').Trim()
        } else {
          $hasPattern = $false
          # 드래그가 포커스된 컨트롤 영역 안에서 시작했을 때만 "텍스트 선택 시도"로 본다(제목 표시줄 이동 등 제외)
          $rect = $el.Current.BoundingRectangle
          $startInside = (-not $rect.IsEmpty) -and $rect.Contains($startPos.X, $startPos.Y)
        }
      }
    }
  } catch { $text = '' }

  if ($dragEnded -and (-not $isPw) -and (-not $hasPattern) -and $startInside -and ($procId -gt 0) -and (-not $reported.ContainsKey($procId))) {
    $reported[$procId] = $true
    $name = ''
    try { $name = (Get-Process -Id $procId).ProcessName } catch { }
    Emit @{ type = 'unsupported'; pid = $procId; proc = $name }
  }

  if ([string]::IsNullOrWhiteSpace($text)) { $candidate = ''; $stable = 0; $emitted = ''; continue }
  if ($text -eq $candidate) { $stable++ } else { $candidate = $text; $stable = 1 }
  if (($stable -ge $StableCount) -and ($text -ne $emitted)) {
    $emitted = $text
    Emit @{ type = 'selection'; text = $text; pid = $procId }
  }
}
