# Sri Sai Hospital — static website

Single-page public website for Sri Sai Hospital, Tanuku. The site is frontend-only and static-hostable; the doctors' portraits and the supplied hospital logo are referenced directly and left unmodified.

## Hospital photograph placeholder replacement map

Each SVG below is an original placeholder. Save the real photograph beside it as a JPG (using the same base name), then change that slot's `.svg` filename to `.jpg` in the `gallery` list in `src/App.tsx`. The building photograph is also used in the hero, so update its `src` there as well.

| Placeholder file | Save the real photograph as |
| --- | --- |
| `public/assets/photos/building.svg` | `public/assets/photos/building.jpg` |
| `public/assets/photos/reception.svg` | `public/assets/photos/reception.jpg` |
| `public/assets/photos/consultation-room.svg` | `public/assets/photos/consultation-room.jpg` |
| `public/assets/photos/waiting-area.svg` | `public/assets/photos/waiting-area.jpg` |
| `public/assets/photos/laboratory.svg` | `public/assets/photos/laboratory.jpg` |

The placeholders are original vector artwork, not photographs. No hospital, room, staff, patient, or equipment imagery has been generated.

## Supplied assets

- `public/assets/sri-sai-hospital-logo.png` — supplied hospital emblem
- `public/assets/doctor-sritha.png` — supplied portrait, shown unchanged
- `public/assets/doctor-jayavardhan-reddy.png` — supplied portrait, shown unchanged

## Video titles and summaries

The three video IDs, titles, and summaries are kept together in the `videos` array at the top of `src/components/VideosSection.tsx`. Replace each placeholder title and summary with doctor-approved copy when it is available.

