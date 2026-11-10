# RLW Graphics Generator

Make church flyers in seconds. Describe the event (for example "Youth meeting Saturday 5pm, theme: Arise"), check the details it picks out, choose Portrait (1080x1350), Landscape (1920x1080), Both, or Square, then download or share the PNGs.

- Every design carries the church logo, "The Redeemed Christian Church of God", "Rivers of Living Water Parish", the address and the church email / YouTube.
- A matching photo is picked from the bundled library in `photos/` by the words in the description. "Shuffle photo" cycles photos and themes; "Upload photo" uses your own picture, which stays on your device.
- Four layouts: Spotlight, Split, Bottom band, Framed. Text shrinks and wraps to fit.
- Everything is drawn in the browser (canvas). No AI calls, no server storage.

Files: `index.html`, `app.css`, `app.js` (page), `parse.js` (reads the description), `draw.js` (draws the flyer), `library.js` (photo list), `credits.json` (photo sources), `_worker.js` (serves the site; photos fall back to this repo).

Photos: free to use under the Pexels License (https://www.pexels.com/license/). Source page of each photo is in `credits.json`.

Live: https://rlw-church.sites.tab.bot/graphics/
