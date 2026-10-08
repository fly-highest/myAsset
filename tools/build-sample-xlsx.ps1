# mock/xlsxSamples.js 의 데이터로 Mock 검수용 xlsx 파일 2개를 만듭니다.
#   mock/sample_holdings.xlsx        (정상)
#   mock/sample_holdings_error.xlsx  (오류 포함)
# 사용법 (PowerShell):  powershell -ExecutionPolicy Bypass -File tools\build-sample-xlsx.ps1 [-BaseDate 2026-10-08]
param([string]$BaseDate = '2026-10-08')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$src = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'mock\xlsxSamples.js')
if ($src -notmatch '(?s)xlsxSamples\s*=\s*(\{.*\});\s*$') { throw 'xlsxSamples JSON 을 찾지 못했습니다' }
$data = $Matches[1] | ConvertFrom-Json

function Esc([string]$s) { [System.Security.SecurityElement]::Escape($s) }
function ColName([int]$i) { $n = ''; $i++; while ($i -gt 0) { $m = ($i - 1) % 26; $n = [char](65 + $m) + $n; $i = [math]::Floor(($i - 1) / 26) }; $n }

function SheetXml($rows) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')
  $r = 0
  foreach ($row in $rows) {
    $r++
    [void]$sb.Append("<row r=""$r"">")
    $c = 0
    foreach ($v in @($row)) {
      $ref = (ColName $c) + $r
      $c++
      if ($null -eq $v -or ($v -is [string] -and $v -eq '')) { continue }
      if ($v -is [string]) {
        [void]$sb.Append("<c r=""$ref"" t=""inlineStr""><is><t xml:space=""preserve"">$(Esc $v)</t></is></c>")
      } else {
        $num = ([double]$v).ToString('R', [System.Globalization.CultureInfo]::InvariantCulture)
        [void]$sb.Append("<c r=""$ref""><v>$num</v></c>")
      }
    }
    [void]$sb.Append('</row>')
  }
  [void]$sb.Append('</sheetData></worksheet>')
  $sb.ToString()
}

function Write-Xlsx([string]$path, $sheets) {
  if (Test-Path $path) { Remove-Item $path }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $zip = [System.IO.Compression.ZipFile]::Open($path, 'Create')
  try {
    $add = {
      param($name, $text)
      $e = $zip.CreateEntry($name)
      $w = New-Object System.IO.StreamWriter($e.Open(), $utf8)
      $w.Write($text); $w.Close()
    }
    $ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    $wbSheets = ''; $wbRels = ''
    for ($i = 1; $i -le $sheets.Count; $i++) {
      $ct += "<Override PartName=""/xl/worksheets/sheet$i.xml"" ContentType=""application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml""/>"
      $wbSheets += "<sheet name=""$(Esc $sheets[$i-1].Name)"" sheetId=""$i"" r:id=""rId$i""/>"
      $wbRels += "<Relationship Id=""rId$i"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"" Target=""worksheets/sheet$i.xml""/>"
    }
    $ct += '</Types>'
    & $add '[Content_Types].xml' $ct
    & $add '_rels/.rels' '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    & $add 'xl/workbook.xml' "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><workbook xmlns=""http://schemas.openxmlformats.org/spreadsheetml/2006/main"" xmlns:r=""http://schemas.openxmlformats.org/officeDocument/2006/relationships""><sheets>$wbSheets</sheets></workbook>"
    & $add 'xl/_rels/workbook.xml.rels' "<?xml version=""1.0"" encoding=""UTF-8"" standalone=""yes""?><Relationships xmlns=""http://schemas.openxmlformats.org/package/2006/relationships"">$wbRels</Relationships>"
    for ($i = 1; $i -le $sheets.Count; $i++) { & $add "xl/worksheets/sheet$i.xml" (SheetXml $sheets[$i-1].Rows) }
  } finally { $zip.Dispose() }
  Write-Host "생성: $path"
}

function Book($rows) {
  @(
    @{ Name = '기준정보'; Rows = @(, @('기준일자', $BaseDate)) + @(, @('안내', '업로드할 현황의 기준일입니다 (YYYY-MM-DD). 직접 바꿀 수 있습니다.')) },
    @{ Name = '보유'; Rows = @(, $data.headers) + @($rows) },
    @{ Name = '작성안내'; Rows = @($data.guide) }
  )
}

Write-Xlsx (Join-Path $root 'mock\sample_holdings.xlsx') (Book $data.sample)
Write-Xlsx (Join-Path $root 'mock\sample_holdings_error.xlsx') (Book $data.error)
