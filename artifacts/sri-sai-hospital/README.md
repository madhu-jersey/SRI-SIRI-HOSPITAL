# Sri Siri Hospital — static website

Single-page public website for Sri Siri Hospital, Tanuku. The site is frontend-only and static-hostable; the doctors' portraits and the supplied hospital logo are referenced directly and left unmodified.

## Hospital photographs

To add a photo, place the file in public/assets/gallery/ and set src in src/data/gallery.ts.

## Supplied assets

- `public/assets/sri-siri-hospital-logo.png` — supplied hospital emblem
- `public/assets/doctor-sritha.png` — supplied portrait, shown unchanged
- `public/assets/doctor-jayavardhan-reddy.png` — supplied portrait, shown unchanged

## Video titles and summaries

The three video IDs, titles, and summaries are kept together in the `videos` array at the top of `src/components/VideosSection.tsx`. Replace each placeholder title and summary with doctor-approved copy when it is available.
