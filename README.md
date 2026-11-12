# Clipforge

Clipforge is a lightweight, open-source video creation studio that runs locally in your browser. Import a video, add a title overlay, preview your edit, and export a WebM render without uploading your media.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build a production bundle with `npm run build`.

## Features

- Local video import and preview
- Editable title overlay with position, color, and size controls
- Video timeline with clip selection and playback scrubbing
- Browser-based WebM export using Canvas and MediaRecorder
- No account, server, or media upload required

## Notes

Export uses browser support for `MediaRecorder`, `HTMLMediaElement.captureStream`, and Canvas capture streams. WebM output and codec availability vary by browser; Chromium-based browsers are recommended. This starter focuses on a single selected clip per export, while the timeline can hold multiple clips for arranging and previewing.

## License

MIT — see [LICENSE](LICENSE).
