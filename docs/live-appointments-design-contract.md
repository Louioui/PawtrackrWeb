# Live appointments design contract

Approved by the user on November 9, 2026: desktop, mobile portrait, and mobile landscape concept direction. The generated images are layout references, not data sources:

- Desktop: `/Users/mac/.codex/generated_images/01a1c072-fd1b-7682-93f0-80bff33e85ab/exec-0fea82d3-bd3d-44c7-94d0-c9f687b409ba.png`
- Portrait: `/Users/mac/.codex/generated_images/01a1c072-fd1b-7682-93f0-80bff33e85ab/exec-bcf358a2-832b-4b76-8b6a-760602e6461c.png`
- Landscape: `/Users/mac/.codex/generated_images/01a1c072-fd1b-7682-93f0-80bff33e85ab/exec-9a9b7174-eb00-480f-8c0d-0a43e1f1e5a3.png`

The view answers: which appointments are scheduled for the signed-in staff member's salon on the selected UTC day, when do they occupy each groomer's time, and which require attention? The server source is `GET /api/reservations` using a verified staff session and caller RLS. No demo records appear. The date, UTC basis, Supabase source, as-of time, and fresh/stale/offline state remain beside the evidence.

Desktop: compact command bar, groomer filter rail, dominant scrollable timeline, selected appointment detail rail. Portrait: compact controls followed immediately by a time-ordered agenda, with selected details inline and filters in a disclosure. Landscape: dominant horizontal groomer timeline with a compact details disclosure. Keyboard and touch selection both work; no detail depends on hover. Filters keep or clear selection consistently, and clearing a filter restores all appointments. Failed refreshes retain the last loaded day only; changing dates clears the old snapshot so appointments cannot appear under the wrong date. Source labels and appointment text stay editable DOM data, not raster image content.

Generated concepts contain invented values and unsupported details. The implementation excludes price, breed, phone, shifts, and per-appointment stale badges. Status comes only from the API's seven supported states. It never claims a live stream: the page polls while visible and labels the last successful server snapshot. Canceled and completed visits remain visible but visually muted. The time axis may span 24 UTC hours because salon operating hours and time zones are not yet modeled.
