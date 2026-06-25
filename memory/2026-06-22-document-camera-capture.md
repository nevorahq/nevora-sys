# Document camera capture investigation

- Symptom: “Take a photo” opens the operating-system file/photo picker instead of a camera view.
- Root cause: `input[type=file]` with `accept="image/*"` and `capture="environment"` is present and correctly wired. The HTML Media Capture `capture` attribute is only a browser hint, not a mandatory camera API. Desktop browsers normally show a file picker, and mobile browsers/PWAs may show a chooser that includes the photo library.
- Follow-up: use `navigator.mediaDevices.getUserMedia()` and a custom camera UI only if a mandatory in-app camera experience is required; retain the file input as the compatibility fallback.
