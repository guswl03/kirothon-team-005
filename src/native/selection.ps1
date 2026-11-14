# 사용자가 선택한 텍스트만 읽어 JSON 한 줄로 알린다. 전체 화면/문서는 읽지 않는다.
# 1) UI Automation: 포커스된 컨트롤의 TextPattern 선택 범위를 읽는다.
#    드래그가 끝났는데 포커스 쪽에 선택이 없으면 커서 아래 요소부터 상위로 올라가며 다시 찾는다
#    (메신저 말풍선처럼 포커스를 받지 않는 영역).
# 2) 복사 대체 경로(-CopyFallback, 사용자가 켠 경우만): 1)이 실패한 드래그가 허용 목록(-CopyApps)의
#    앱에서 끝났으면 Ctrl+C를 한 번 보내 클립보드로 받고, 원래 클립보드를 되돌린다.
#    주기적 폴링에서는 절대 복사하지 않는다. 클립보드가 바뀌지 않으면 아무것도 하지 않는다.
# - 비밀번호 입력란(IsPassword)은 어느 경로에서도 건너뛴다.
# - 텍스트 컨트롤 안에서 시작한 드래그가 모든 경로에서 실패하면 텍스트 없이
#   {"type":"unsupported"}만 프로세스당 한 번 보고한다.
# - 출력은 Emit 하나로만 한다(파일, 콘솔 오류, 로그에 텍스트를 남기지 않는다).
param(
  [int]$IntervalMs = 350,
  [int]$StableCount = 2,
  [switch]$CopyFallback,
  [string]$CopyApps = ''
)
$ErrorActionPreference = 'SilentlyContinue'
$IntervalMs = [Math]::Min([Math]::Max($IntervalMs, 100), 2000)
$StableCount = [Math]::Min([Math]::Max($StableCount, 1), 10)
$TickMs = 50   # 마우스 버튼 샘플링 주기(짧은 드래그를 놓치지 않기 위해 읽기 주기보다 촘촘하게)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
$sig = '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId); [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
Add-Type -MemberDefinition $sig -Name Native -Namespace CC
# 커서 좌표와 UI Automation 좌표를 같은 물리 픽셀 기준으로 맞춘다(화면 배율 125% 이상에서 어긋나지 않게).
[void][CC.Native]::SetProcessDPIAware()
# 주 버튼: 버튼 교체(왼손잡이) 설정이면 오른쪽 버튼(0x02), 아니면 왼쪽(0x01)
$PrimaryVk = 1
if ([CC.Native]::GetSystemMetrics(23) -ne 0) { $PrimaryVk = 2 }

# 복사 대체 경로 허용 앱(프로세스 이름, 대소문자 무시)
$AllowedCopyApps = @()
foreach ($a in ($CopyApps -split ',')) {
  $n = $a.Trim()
  if ($n -match '^[\p{L}\p{N}_.\- ]{1,64}$') { $AllowedCopyApps += $n.ToLowerInvariant() }
}

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Get-ProcName([int]$id) {
  if ($id -le 0) { return '' }
  try { return [string](Get-Process -Id $id).ProcessName } catch { return '' }
}

# 한 요소의 선택 범위를 읽는다. 비밀번호란이면 읽지 않고 password만 표시한다.
function Read-Selection($el) {
  $res = @{ pattern = $false; text = ''; password = $false }
  if ($null -eq $el) { return $res }
  try {
    if ([bool]$el.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsPasswordProperty)) { $res.password = $true; return $res }
    $pat = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pat)) {
      $res.pattern = $true
      $parts = @()
      foreach ($r in $pat.GetSelection()) { $parts += $r.GetText(2000) }
      $res.text = ($parts -join ' ').Trim()
    }
  } catch { }
  return $res
}

# 커서 아래 요소부터 상위로 최대 10단계 올라가며, 선택이 비어 있지 않은 TextPattern을 찾는다.
# 다른 프로세스(바탕화면 등)로 넘어가면 멈춘다.
function Read-SelectionAtPoint($pt) {
  $res = @{ pattern = $false; text = ''; password = $false; pid = 0; rect = [System.Windows.Rect]::Empty }
  $el = $null
  try { $el = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point($pt.X, $pt.Y))) } catch { }
  if ($null -eq $el) { return $res }
  try { $res.pid = $el.Current.ProcessId; $res.rect = $el.Current.BoundingRectangle } catch { }
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $cur = $el
  for ($i = 0; ($i -lt 10) -and ($null -ne $cur); $i++) {
    $r = Read-Selection $cur
    if ($r.password) { $res.password = $true; return $res }
    if ($r.pattern) {
      $res.pattern = $true
      if ($r.text) { $res.text = $r.text; return $res }
    }
    $next = $null
    try { $next = $walker.GetParent($cur) } catch { }
    if ($null -eq $next) { break }
    $samePid = $false
    try { $samePid = ($next.Current.ProcessId -eq $res.pid) } catch { }
    if (-not $samePid) { break }
    $cur = $next
  }
  return $res
}

# 복사 대체 경로를 써도 되는지 판단한다. 옵션이 켜져 있고, 드래그가 끝난 앱과 전면 창이 모두
# 허용 목록의 같은 앱이며, 사용자가 수정키(Shift/Ctrl/Alt/Win)를 누르고 있지 않을 때만 true.
function Test-CopyAllowed([int]$pointPid) {
  if (-not $CopyFallback) { return $false }
  if ($AllowedCopyApps.Count -eq 0) { return $false }
  $pointName = (Get-ProcName $pointPid).ToLowerInvariant()
  if ((-not $pointName) -or ($AllowedCopyApps -notcontains $pointName)) { return $false }
  [uint32]$fgPid = 0
  [void][CC.Native]::GetWindowThreadProcessId([CC.Native]::GetForegroundWindow(), [ref]$fgPid)
  if ((Get-ProcName ([int]$fgPid)).ToLowerInvariant() -ne $pointName) { return $false }
  foreach ($vk in 0x10, 0x11, 0x12, 0x5B, 0x5C) {
    if (([CC.Native]::GetAsyncKeyState($vk) -band 0x8000) -ne 0) { return $false }
  }
  return $true
}

# 클립보드의 텍스트, HTML, RTF, 이미지, 파일 목록을 백업한다. 클립보드를 못 열거나
# 되돌릴 수 없는 형식만 있으면 실패로 보고 복사하지 않는다(원래 내용을 잃지 않기 위해).
function Backup-Clipboard {
  $b = @{ ok = $false; items = @{} }
  for ($t = 0; $t -lt 3; $t++) {
    try {
      $formats = @([System.Windows.Forms.Clipboard]::GetDataObject().GetFormats())
      # 텍스트 형식은 빈 문자열이면 되돌릴 때 예외가 나므로 내용이 있을 때만 담는다.
      foreach ($kind in @(@('text', 'UnicodeText'), @('html', 'Html'), @('rtf', 'Rtf'))) {
        $fmt = [System.Windows.Forms.TextDataFormat]$kind[1]
        if ([System.Windows.Forms.Clipboard]::ContainsText($fmt)) {
          $v = [string][System.Windows.Forms.Clipboard]::GetText($fmt)
          if ($v.Length -gt 0) { $b.items[$kind[0]] = $v }
        }
      }
      if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $b.items.image = [System.Windows.Forms.Clipboard]::GetImage() }
      if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) { $b.items.files = [System.Windows.Forms.Clipboard]::GetFileDropList() }
      $b.ok = ($formats.Count -eq 0) -or ($b.items.Count -gt 0)
      return $b
    } catch { Start-Sleep -Milliseconds 30 }
  }
  return $b
}

function Restore-Clipboard($b) {
  for ($t = 0; $t -lt 5; $t++) {
    try {
      if ($b.items.Count -eq 0) { [System.Windows.Forms.Clipboard]::Clear(); return $true }
      $do = New-Object System.Windows.Forms.DataObject
      if ($b.items.ContainsKey('text')) { $do.SetText($b.items.text, [System.Windows.Forms.TextDataFormat]::UnicodeText) }
      if ($b.items.ContainsKey('html')) { $do.SetText($b.items.html, [System.Windows.Forms.TextDataFormat]::Html) }
      if ($b.items.ContainsKey('rtf')) { $do.SetText($b.items.rtf, [System.Windows.Forms.TextDataFormat]::Rtf) }
      if ($b.items.ContainsKey('image')) { $do.SetImage($b.items.image) }
      if ($b.items.ContainsKey('files')) { $do.SetFileDropList($b.items.files) }
      [System.Windows.Forms.Clipboard]::SetDataObject($do, $true)
      return $true
    } catch { Start-Sleep -Milliseconds 30 }
  }
  return $false
}

# 허용된 경우에만 Ctrl+C를 한 번 보내고, 클립보드가 실제로 바뀌었을 때만 텍스트를 돌려준다.
function Invoke-CopyFallback([int]$pointPid) {
  if (-not (Test-CopyAllowed $pointPid)) { return @{ tried = $false; text = '' } }
  $b = Backup-Clipboard
  if (-not $b.ok) { return @{ tried = $false; text = '' } }
  $before = [CC.Native]::GetClipboardSequenceNumber()
  [CC.Native]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)   # Ctrl 누름
  [CC.Native]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)   # C 누름
  [CC.Native]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)   # C 뗌
  [CC.Native]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)   # Ctrl 뗌
  $changed = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 20
    if ([CC.Native]::GetClipboardSequenceNumber() -ne $before) { $changed = $true; break }
  }
  if (-not $changed) { return @{ tried = $true; text = '' } }   # 선택이 없었다. 클립보드는 그대로다.
  Start-Sleep -Milliseconds 40   # 앱이 여러 형식을 다 쓸 때까지 잠깐 기다린다
  $copied = ''
  for ($t = 0; $t -lt 5; $t++) {
    try { $copied = [string][System.Windows.Forms.Clipboard]::GetText(); break } catch { Start-Sleep -Milliseconds 30 }
  }
  [void](Restore-Clipboard $b)
  $copied = $copied.Trim()
  if ($copied.Length -gt 5000) { $copied = $copied.Substring(0, 5000) }
  return @{ tried = $true; text = $copied }
}

# ===== main loop =====
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

  # 1a) 포커스된 컨트롤
  $procId = 0
  $focusRect = [System.Windows.Rect]::Empty
  $focusEl = $null
  try { $focusEl = [System.Windows.Automation.AutomationElement]::FocusedElement } catch { }
  if ($null -ne $focusEl) { try { $procId = $focusEl.Current.ProcessId; $focusRect = $focusEl.Current.BoundingRectangle } catch { } }
  $focus = Read-Selection $focusEl
  $text = $focus.text
  $via = 'uia'
  $isPw = $focus.password
  $anyPattern = $focus.pattern
  $copyTried = $false
  $pointPid = 0
  $pointRect = [System.Windows.Rect]::Empty

  if ($dragEnded -and (-not $isPw) -and (-not $text)) {
    # 1b) 커서 아래 요소
    $pt = Read-SelectionAtPoint $pos
    $pointPid = $pt.pid
    $pointRect = $pt.rect
    if ($pt.password) { $isPw = $true }
    elseif ($pt.text) { $text = $pt.text; $procId = $pt.pid }
    else {
      if ($pt.pattern) { $anyPattern = $true }
      # 2) 복사 대체 경로
      $c = Invoke-CopyFallback $pt.pid
      $copyTried = $c.tried
      if ($c.text) { $text = $c.text; $via = 'copy'; $procId = $pt.pid }
    }
  }

  if ($dragEnded -and (-not $text) -and (-not $isPw) -and (-not $anyPattern) -and (-not $copyTried)) {
    $startInside = ((-not $focusRect.IsEmpty) -and $focusRect.Contains($startPos.X, $startPos.Y)) -or ((-not $pointRect.IsEmpty) -and $pointRect.Contains($startPos.X, $startPos.Y))
    $rid = $procId
    if ($pointPid -gt 0) { $rid = $pointPid }
    if ($startInside -and ($rid -gt 0) -and (-not $reported.ContainsKey($rid))) {
      $reported[$rid] = $true
      Emit @{ type = 'unsupported'; pid = $rid; proc = (Get-ProcName $rid) }
    }
  }

  if ($isPw -or [string]::IsNullOrWhiteSpace($text)) { $candidate = ''; $stable = 0; $emitted = ''; continue }

  if ($dragEnded) {
    # 드래그가 끝난 순간은 선택이 완료된 것이므로 바로 알린다.
    if ($text -ne $emitted) { Emit @{ type = 'selection'; text = $text; pid = $procId; via = $via } }
    $emitted = $text; $candidate = $text; $stable = $StableCount
    continue
  }

  # 키보드 선택 등 드래그 없는 선택은 StableCount회 연속 같을 때 한 번 알린다(폴링, UI Automation만).
  if ($text -eq $candidate) { $stable++ } else { $candidate = $text; $stable = 1 }
  if (($stable -ge $StableCount) -and ($text -ne $emitted)) {
    $emitted = $text
    Emit @{ type = 'selection'; text = $text; pid = $procId; via = 'uia' }
  }
}
