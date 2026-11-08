# RCCG Rivers of Living Water Parish - church website

Homepage of Rivers of Living Water Parish (RCCG), Magboro, plus the church's tools.

Live: https://rlw-church.sites.tab.bot/

## What's here
- Root (`index.html`, `verses.js`, images): the homepage. Verse of the day, today's birthdays, about, mission, weekly services, pastor, visit us.
- `tools/first-timers/`: First-Timer Check-in (also at rlw-firsttimers.site)
- `tools/workers/`: Workers' Attendance
- `tools/birthdays/`: RLW Birthdays (flyers, monthly designs, video, music)
- `tools/bible-quiz/`: RLW Bible Quiz Night

The tools are served at /firsttimers, /workers, /birthdays and /quiz. Each tool keeps its own data on its live server.

## Deploy on Vercel
Import this repo into Vercel with no build step. `vercel.json` sends /firsttimers, /workers, /birthdays and /quiz to the live tools, so data, logins and check-ins keep working.

## Note
Secrets are removed from the `_worker.js` files: the proxy key and the admin password salt/hash read `REPLACE_WITH_...`. The live servers keep the real values. The `tools/` folders are the source for reference. They are not deployed from here.

© 2026 Rivers Of Living Water
