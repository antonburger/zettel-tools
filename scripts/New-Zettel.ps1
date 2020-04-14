param
(
    [Parameter(Mandatory)]
    [string]
    $Title,
    [string]
    $ZettelDir = "$PSScriptRoot/.."
)

function Get-MaxZettelId($dir) {
    if (-not (Test-Path -Path $dir -PathType Container)) {
        return 0
    }
    $zettels = Get-ChildItem $dir -Filter "*.md"
    $max = @($zettels.BaseName) -match "\d+" | Measure-Object -Maximum
    return [int]$max.Maximum
}

function Get-ZettelId($zettelDir) {
    $now = Get-Date
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $week = $culture.Calendar.GetWeekOfYear($now, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [System.DayOfWeek]::Monday)
    $subdir = "{0:yy}/$week" -f $now
    $dir = Join-Path $zettelDir $subdir
    $next = 1 + (Get-MaxZettelId($dir))
    "$subdir/" + ("{0:D2}" -f $next)
}

if (-not (Test-Path -Path $ZettelDir -PathType Container)) {
    throw "Not a directory: $ZettelDir"
}

$ZettelDir = Resolve-Path $ZettelDir
$zettelId = Get-ZettelId($ZettelDir)
$dir = Join-Path $ZettelDir (Split-Path -Path $zettelId -Parent)
$null = New-Item $dir -ItemType Directory -Force
$file = Join-Path $ZettelDir "$zettelId.md"
@"
---
title: $Title
created: $("{0:s}" -f (Get-Date))
tags:
---

# $Title
"@ | Set-Content $file -Encoding utf8NoBOM
[string](Get-ChildItem $file)
