# TalkCheck

**Hands-free, voice-based defect logging for aircraft cabin walkaround checks.**

> Status: 🚧 v0.1 working — personal project, actively developed with an AI coding assistant.

---

## The problem

During a cabin check, aircraft maintenance technicians walk the full length of the aircraft — seats, galleys, lavatories, lights, panels — doing a quick inspection first, and only then go back to fix what they found. Stopping to fix each item along the way wastes time and can delay finding a more serious issue further back.

Today, findings are usually written on paper or typed into a notes app, which slows down the walkaround and makes it easy to lose track of items.

I'm an aircraft maintenance technician (FAA A&P) working on widebody fleets, and TalkCheck comes from a problem I deal with on every shift.

## The solution

**Press, speak, release. Done.**

TalkCheck turns a spoken finding into a structured checklist item instantly:

- 🎙️ **One-button voice capture** — hold the button, describe the defect, release
- 🔢 **Automatic numbering and timestamp** for every item
- ☑️ **Open / resolved checkbox** to track the return trip
- 🗺️ **Cabin zone detection** from the spoken text (e.g. "row 23", "aft galley", "lav L4"), shown as a dot on a simple cabin map
- 🔴 **Automatic priority** based on keywords (e.g. oxygen, emergency lighting, smoke detector → critical)
- 📖 **Suggested ATA chapter** (e.g. lights → 33, seats/galley → 25, water/waste → 38, oxygen → 35)
- 📋 **One-tap export** of the full list as plain text

## Design constraints

These come from real working conditions, not assumptions:

| Constraint | Why |
|---|---|
| **Web app, no install** | Company-managed iPads don't allow unapproved native apps |
| **Works offline** | No reliable network inside the aircraft cabin |
| **No data stored or sent** | Findings stay on the device and disappear when the session ends; export before closing |
| **Minimum taps** | The technician is walking, often wearing gloves, holding a flashlight |

## Run it

No build step, no dependencies.

```bash
npm start        # serves the app at http://localhost:3000
npm test         # runs the parser unit tests (Node 18+)
```

On iPad: open the hosted page in Safari → Share → **Add to Home Screen**. After the first visit it works offline.

## Project structure

```
index.html          app shell
css/styles.css      dark, high-contrast UI with large touch targets
js/app.js           UI, in-memory state, return-order sorting, export
js/parser.js        rule-based parser: zone, priority, ATA chapter (PT + EN)
js/aircraft.js      simplified cabin layouts for the map
sw.js               service worker for offline use
tests/              unit tests for the parser
```

## Tech stack

- HTML, CSS and JavaScript (single-page web app)
- Service worker for offline use ("Add to Home Screen" on iPad)
- On-device speech recognition (iPad keyboard dictation in v1; in-browser speech model planned for true push-to-talk)
- Rule-based text parsing for zone, priority and ATA chapter (no external API)

## Roadmap

- [x] v1 — text input with dictation, auto number/time, checklist, export
- [x] v1.1 — zone detection and cabin map
- [x] v1.2 — keyword-based priority and ATA chapter suggestion
- [ ] v1.3 — editable priority/ATA per item, larger vocabulary from real checks
- [ ] v2 — true push-to-talk with offline in-browser speech recognition
- [ ] v2.1 — accurate per-aircraft cabin layouts (zones, door positions, class sections)

## Disclaimer

TalkCheck is a personal note-taking aid. It does not replace official maintenance records, the aircraft maintenance manual, or company procedures. All findings must be recorded in the operator's approved systems.

## Author

**Wilson Mazzuco Junior** — Aircraft Maintenance Technician (FAA A&P, ANAC) and Software Engineering student.
