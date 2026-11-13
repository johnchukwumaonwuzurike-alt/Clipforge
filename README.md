# Clipforge

Open-source browser video creation studio. Arrange multiple clips, add animated titles and background music, then render a WebM video in your browser. Local editing and media stay on your device unless you opt into cloud backup.

## Run locally

```bash
npm install
npm run dev
```

## Features

- Sequential multi-clip timeline with select, reorder, and remove controls
- Fade, slide, and pop animated title overlays
- Background music track with volume control
- WebM export with 720p/1080p/4K, 24/30/60 fps, and configurable video bitrate
- Local media persistence using IndexedDB
- Optional Supabase magic-link accounts, project metadata, and private media backups

## Optional Supabase setup

1. Create a Supabase project and enable email authentication.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Restart the dev server. Open **Projects** to sign in, save, and restore projects.

Never put a Supabase service-role key in the browser app. Keep the media bucket private and use the provided row-level security policies.

## Export notes

Exports are WebM using a browser-supported VP8/VP9 codec. Export performance and codec support vary by browser/device. 4K encoding may use substantial memory. The current renderer mixes background music and title overlays; source-clip audio is not mixed. MP4 export is future work.

## License

MIT. See [LICENSE](LICENSE).
