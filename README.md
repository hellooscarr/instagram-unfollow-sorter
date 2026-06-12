# Instagram Unfollow Sorter (Project U)

A small web app that helps you find Instagram accounts you follow that
don't follow you back, then sort them into "keep" / "unfollow" with a
Tinder-style swipe interface — synced across your devices.

**Privacy-first:** your Instagram export is parsed entirely in your
browser with `FileReader`/`JSZip`, and the app makes zero calls to
Instagram's API. The only thing leaving your browser is the resulting
list of usernames + your keep/unfollow decisions, which get saved to
this app's Firestore database under a sync code you choose (see
[Cross-device sync](#cross-device-sync-sync-codes) below).

## How it works

1. The first time you open the app, you pick a **sync code** — any
   word or phrase. This is how the app recognizes "you" on other
   devices (no email/password signup).
2. You request your own data export from Instagram (JSON format).
3. You drop the export ZIP (or the individual `followers_*.json` /
   `following.json` files) onto the app.
4. The app compares your followers and following lists and shows you
   every account you follow that doesn't follow you back.
5. Swipe right (or tap ♥) to keep, swipe left (or tap ✕) to queue for
   unfollow. Each card links straight to the profile so you can
   manually unfollow on Instagram.
6. Export the final "to unfollow" list as an Excel file, or back up /
   restore your progress as JSON.

## Cross-device sync (sync codes)

Project U has no real account system — instead (like the PANAM FC
bracket app) it uses a simple **sync code**:

- On first use, enter a sync code (any word/phrase only you'll use).
  The app hashes it into an ID and stores your username list + swipe
  decisions in Firestore under that ID.
- Open the app on another device (phone, laptop, etc.) and enter the
  **same sync code** — your progress loads automatically and stays in
  sync as you swipe.
- "Sync across devices" in the footer lets you change/clear the code
  on a device, or "Skip" on the first screen to use the app fully
  locally (no cloud sync, like before).

This means your account lists and decisions are stored in this app's
Firestore database (project `project-unfollow-f6ad2`), scoped to a
`sorters` collection keyed by the hashed sync code. Anyone who knows
your exact sync code could read/overwrite that document, so treat it
like a shared secret rather than a public username.

## Getting your Instagram export

1. In the Instagram app: **Settings → Accounts Center → Your information
   and permissions → Download your information**.
2. Choose **"Some of your information"** and select only **Followers and
   following**.
3. Set the format to **JSON** (not HTML) and submit the request.
4. Instagram will notify you when it's ready (usually minutes to a few
   hours) — download the ZIP.
5. Either drop the whole ZIP onto the app, or unzip it and select the
   files inside `connections/followers_and_following/` (`followers_1.json`,
   `followers_2.json`, ..., `following.json`).

## Running locally

This is a static site — no build step, no backend. Just open
`index.html` in a browser, or serve the folder with any static file
server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Project structure

```
project-u/
├── index.html        # sync screen + upload screen + swipe sorter UI
├── css/
│   └── styles.css
├── js/
│   ├── sync.js        # Firebase/Firestore config + cross-device sync
│   ├── parser.js       # parses the Instagram export (ZIP or JSON files)
│   └── app.js           # app state, swipe interactions, export/import
├── firebase.json     # Firebase Hosting + Firestore config
├── .firebaserc        # points at the project-unfollow-f6ad2 project
├── firestore.rules    # security rules for the `sorters` collection
└── README.md
```

## Deployment

This app is set up to deploy with **Firebase Hosting**, using the
already-created Firebase project `project-unfollow-f6ad2` (the same
project that hosts the Firestore sync database). It's also a static
site, so it works equally well on Vercel, Netlify, or GitHub Pages if
you'd rather use one of those.

### Firebase Hosting (recommended — matches the sync database)

One-time setup, from inside the `project-u/` folder:

```bash
npm install -g firebase-tools
firebase login          # opens a browser to sign in with the Google
                         # account that owns project-unfollow-f6ad2
firebase deploy          # deploys index.html, css/, js/ as a static site
                         # and publishes firestore.rules
```

After `firebase deploy` finishes it prints your live URL — something
like `https://project-unfollow-f6ad2.web.app`. That URL works on any
phone or computer; enter the same sync code on each device to stay in
sync.

To publish updates later, just re-run `firebase deploy` from this
folder.

### Firestore security rules

`firestore.rules` restricts reads/writes to the `sorters` collection
(used for sync codes) and denies everything else. `firebase deploy`
publishes these automatically — or paste the contents of
`firestore.rules` into **Firebase Console → Firestore Database →
Rules → Publish** for `project-unfollow-f6ad2` if you'd rather do it
by hand.

## Next steps (from the original project brief)

- [x] MVP parser + results list as a single-page client-side app
- [x] Drag-and-drop ZIP handling (via JSZip)
- [x] "How to get your Instagram export" onboarding guide
- [x] Cross-device sync via sync codes + Firestore
- [ ] Deploy (`firebase deploy` — see above) and/or a custom domain
- [ ] Stripe one-time checkout for a paid tier (e.g. swipe UI as a
      premium feature, or removing usage limits)
- [ ] Optional: Tinder-style swipe queue was implemented as the primary
      UX rather than a future enhancement — consider a simpler "list
      view" toggle for users who prefer it
