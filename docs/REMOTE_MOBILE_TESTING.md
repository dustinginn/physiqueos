# Remote Mobile Testing

## Purpose

Use this workflow to test the local PhysiqueOS dev app from a phone when the phone is not on the same Wi-Fi network as the development machine.

This is especially useful for testing the Mic Simulator at:

```text
/lab/narrative-engine
```

## Why HTTPS Matters For Mic Testing

Mobile browsers generally require a secure context before allowing microphone access. `localhost` can work on the development machine, but a phone needs an HTTPS URL.

A public tunnel gives the phone an HTTPS address that forwards traffic to the local Next.js dev server.

## Start The Local App

In one terminal:

```bash
npm run dev
```

By default, the app runs at:

```text
http://localhost:3000
```

## Start The Tunnel

In a second terminal:

```bash
npm run dev:tunnel
```

This runs:

```bash
npx ngrok http 3000
```

If this is the first time using ngrok, follow ngrok's setup instructions to install/configure your auth token. The project does not require ngrok as a checked-in dependency.

When ngrok starts, copy the HTTPS forwarding URL. It will look similar to:

```text
https://example-name.ngrok-free.app
```

Tunnel URLs are temporary unless you configure a reserved domain in ngrok.

## Open On Phone

On the phone, open:

```text
https://<tunnel-url>/lab/narrative-engine
```

Then test the voice flow:

1. Tap `Speak`.
2. Grant microphone permission.
3. Speak naturally.
4. Tap `Stop`.
5. Review the captured evidence.
6. Open `Developer Inspector` and use `Copy Debug JSON` if behavior looks wrong.

## Mic Troubleshooting

- If microphone permission is denied, reload the page and grant permission when prompted.
- If the browser blocks mic access, check site permissions for the tunnel URL.
- Safari and Chrome on mobile may behave differently.
- Audio recording support varies by browser and OS.
- Browser live transcription support varies by browser and OS.
- If no approved transcription provider is available, the simulator should show the typed fallback after recording.
- The typed fallback still sends the transcript through the same Voice Interpreter path.

## Security Notes

The tunnel exposes the local dev app publicly while it is running.

- Do not use this workflow with sensitive production data.
- Do not share the tunnel URL publicly.
- Stop the tunnel when testing is complete.
- Assume anyone with the tunnel URL can reach the local dev app while the tunnel is active.
- Tunnel URLs usually change each session unless using a reserved domain.

## Optional Phone Shortcut

For quick access, copy the HTTPS tunnel URL from the ngrok terminal and send it to the phone. A QR code is optional; the tunnel URL plus `/lab/narrative-engine` is enough for testing.
