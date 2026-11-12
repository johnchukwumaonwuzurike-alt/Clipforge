# Clipforge

Open-source browser video creation studio. Arrange multiple clips, add animated titles and background music, then render a WebM video directly in your browser. Local editing works without an account; optional Supabase setup enables magic-link sign-in and cloud project/media backups.

## Run locally

```bash
npm install
npm run dev
```

## Features

- Sequential multi-clip timeline with reorder and remove controls
- Animated title overlays: fade, slide, and pop
- Background music track with volume control
- Export settings for 720p, 1080p, or 4K; 24/30/60 fps and configurable bitrate
- Browser-side WebM export; media is processed locally
- IndexedDB-backed local media drafts and optional Supabase accounts/cloud backups

## Cloud setup (optional)

1. Create a Supabase project and enable email authentication (magic links).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and set your project URL and anon key.
4. Restart the dev server and sign in from **Projects**.

Cloud media is stored in the private `project-media` bucket. Apply the included row-level security policies before enabling cloud features. Never put a Supabase service-role key in the browser app.

## Export notes

Export is WebM (VP9/VP8, depending on browser support) and uses Canvas/MediaRecorder. Resolution, frame rate, and bitrate are configurable; codec support and performance vary by browser/device. 4K encoding can be memory-intensive. For a universally compatible MP4 output, a server-side or WASM transcoding pipeline is a future enhancement.

## License

MIT. See [LICENSE](LICENSE).
