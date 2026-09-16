@echo off
setlocal
set "BALANCE_SOURCE=%~dp0learning-rating.json"
if not exist "%BALANCE_SOURCE%" set "BALANCE_SOURCE=%~dp0config\learning-rating.json"
if not exist "%BALANCE_SOURCE%" (
  echo [ERROR] learning-rating.json file was not found.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $source=[IO.Path]::GetFullPath($env:BALANCE_SOURCE); $value=Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json; if($value.schemaVersion -ne 1){throw 'schemaVersion must be 1'}; foreach($name in @('basic','applied','advanced')){if([int]$value.objectiveRp.$name -le 0){throw ('objectiveRp.'+$name+' must be positive')}}; $tiers=@('bronze','silver','gold','platinum','diamond','master','challenger'); $previous=-1; foreach($name in $tiers){$current=[double]$value.tierStarts.$name; if($current -lt 0 -or $current -gt 1 -or $current -le $previous){throw 'tierStarts must be strictly increasing from 0 to 1'}; $previous=$current}; if([double]$value.tierStarts.bronze -ne 0 -or [double]$value.tierStarts.challenger -ne 1){throw 'tier edges must be 0 and 1'}; $targetDir=Join-Path $env:APPDATA 'ADStudyHelper'; New-Item -ItemType Directory -Path $targetDir -Force | Out-Null; $target=Join-Path $targetDir 'learning-rating.json'; Copy-Item -LiteralPath $source -Destination $target -Force; Write-Host ('[OK] Applied: '+$target); Write-Host '[INFO] Restart ADStudyHelper to recalculate RP and tiers.'"
if errorlevel 1 exit /b 1
exit /b 0
