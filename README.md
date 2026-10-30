# Beast Den

A self-hosted virtual clubhouse for remote Beast Code people. Everyone is a beast. A campfire in the middle of the Den stays lit only when people show up for each other.

Beast Bid saves time. Beast Den makes the remote days feel less remote. It does not replace Awardco (kudos); it is the everyday "hanging out" layer.

## Run it

```
node server.js          # or: npm start, start.bat (Windows), ./start.sh (Mac/Linux)
```
Open http://localhost:4180. Needs Node 18+. **No npm install, no dependencies, no build step.**

**For the whole company:** run it on one internal server and start it with `HOST=0.0.0.0` (and optionally `PORT=...`). People reach it over the VPN or internal network. Nothing in it calls out to the internet: no CDNs, fonts, analytics, or third-party services, and a strict Content-Security-Policy makes the browser enforce that.

## What is in it

| Section | What it does |
|---|---|
| **The Den** | A map of four rooms (Kitchen, Game Room, Focus Lounge, Porch) with live presence, room chat, emote bursts, and shared focus sprints. The campfire grows with company-wide activity and cools over time. |
| **Trivia** | Daily 20: the same 20 questions for everyone each day, speed bonus, streaks, leaderboards. The bank ships with 118 questions; add your own in `data/trivia.json` (company lore, "whose dog is this?"). Change `PER_DAY` in `modules/trivia.js` to taste. |
| **Games** | A live Game Room. Anyone opens a table, everyone gets a pop-up, and up to 12-20 people play together. Six games: **Where in the World** (guess the location of a photo on a zoomable map), **Doodle Dash** (draw and guess, strokes stream live), **Emoji Charades**, **Two Truths & a Lie**, **Closest Wins** (estimate the number) and **Quick Fire** (live trivia showdown). Winners earn Den points. |
| **Coffee** | Coffee Roulette. Press a button, get paired with another beast on a break. Avoids repeat pairings for 21 days. Private two-person chat with icebreakers. |
| **Show & Tell** | Photo wall for pets, desks, lunches, views. Reactions. Photos are stored in `data/uploads` on your server only. |
| **Quest** | A weekly team habit (touch grass, hydrate, stretch...). One check-in per person per day; the whole company fills the trail together and earns a badge. |

Avatars are generated beasts (ears, eyes, mouth, gear, color) that people customize.

## Where in the World: photos

The starter pool is 43 illustrated postcards (clearly labelled as illustrations). The real fun is team photos: on the Games page, **Add a photo**, drop a pin where it was taken, type the place name. Photos are re-encoded in the browser (which strips EXIF and GPS data), saved to `data/uploads`, and people can remove their own. The map is bundled and works offline (Natural Earth data via world-atlas, ISC license, see `public/world-LICENSE.txt`). Remind people to skip photos of badges, screens, home addresses, or anyone who has not agreed.

## Add a game (about 60 lines)

Games are plug-ins in `modules/games/*.js`; the engine in `modules/games.js` handles tables, joining, timers, scores, Den points and realtime. A game exports `ctx => ({ id, name, emoji, desc, how, min, max, lateJoin, opts, start(t), act(t, user, body), view(t, uid), onLeave?(t, uid) })`.
Use `t.setPhase(name, ms)`, `t.after(name, ms, fn)`, `t.add(uid, points)`, `t.finish()`, and keep per-game state in `t.g`. `view()` must never leak answers before the reveal phase. Then add a small client in `public/modules/games.js` (`G.yourgame = { build, patch, click }`) and a card appears automatically.

## Design system

The UI follows the Beast Code design system (light mode). All colors, type, spacing, radii and shadows are CSS variables in `public/tokens.css`; `public/style.css` only reads from them, so a re-skin is a one-file change. Typography is Inter (bundled in `public/fonts`, OFL license) and icons are Lucide (inlined in `public/icons.js`, ISC license, add more with `Den.icon('name')` after pasting the path data in). Nothing loads from the internet.
Accessibility: visible focus rings, text contrast at WCAG AA (status colors use the darker `--success-fg` / `--error-fg` on tinted backgrounds), selection and correctness shown with text or icons as well as color, labelled inputs and icon buttons, a focus-managed dialog, 44px touch targets on mobile and `prefers-reduced-motion` support.
Notes: Beast avatars stay as the app's character, drawn in a muted palette inside a circular tile. The recognition-card categories (Howdy Partner, Be Relentless...) are in the tokens but unused, because kudos live in Awardco.

## Add your own module (about 20 lines)

Every section is a module. The server auto-loads any `modules/*.js`. The client loads scripts listed in `public/index.html`.

**1. Server: `modules/birthdays.js`**
```js
module.exports = ctx => ({
  id: 'birthdays',
  routes: {
    'GET /api/birthdays': ({ user }) => ({ list: Object.values(ctx.state.users).filter(u => u.birthday).map(ctx.publicUser) }),
    'POST /api/birthday': ({ user, body }) => { user.birthday = ctx.clean(body.date, 10); ctx.save(); ctx.bump(1); return {}; },
  },
  bootstrap: user => ({ mine: user.birthday || null }),   // optional: data delivered at startup
  tick: () => {},                                          // optional: runs every 15 s
});
```

**2. Client: `public/modules/birthdays.js`, then add a `<script>` tag for it in `index.html`**
```js
(() => {
  const { api, register, esc, beastSVG, on } = Den;
  register({ id: 'birthdays', title: 'Birthdays', icon: '🎂', order: 60,
    async render(el) { const r = await api('/api/birthdays'); el.innerHTML = r.list.map(u => `<p>${beastSVG(u.beast, 30)} ${esc(u.name)}</p>`).join(''); } });
  on('some-event', data => { /* react to realtime events */ });
})();
```

Handy helpers on the server `ctx`: `state` (persisted to `data/den.json`), `save()`, `bump(weight)` (warms the fire), `broadcast(event, data)`, `sendTo(uid, event, data)`, `clean(text, max)`, `err(status, message)`. To receive a new event name on the client, add it to the `names` list in `public/den.js`.

**Ideas that fit the same pattern:** birthdays and work anniversaries, team vs team trivia seasons, a "song of the day" queue, book club corner, virtual lunch-and-learn room with a hand-raise button, new-hire welcome wall, pet of the month, monthly awards (badge system already exists), a weekly "Den Digest" for leadership showing participation (no message content).

## Things to know before real rollout

- **Identity:** people pick a name; there are no passwords. That is fine on an internal network but not for open access. To tie it to company SSO, put it behind your reverse proxy and map the proxy's user header to a Den user in `routes['POST /api/join']`.
- **Moderation:** people can delete their own wall posts. Chat is not stored on disk (it resets when the server restarts). Add an admin key and delete route before a large rollout.
- **Data:** everything persistent lives in `data/den.json` and `data/uploads/`. Back them up or delete them to reset.
- **Scale:** built for a few hundred people on one server (single process, in-memory presence). Beyond that, move state to a database.
- **Photos:** limited to 1.5 MB, JPEG/PNG/WebP, resized in the browser. Remind people not to post anything sensitive or controlled.
- **Games** live in memory: tables close when empty or idle, and only Den points persist (capped at 40 per person per day so nobody can farm them).
- **Trivia questions** are general knowledge plus some federal-contracting acronyms. Edit `data/trivia.json` to make them yours.

## Demo tips (hackathon)

1. Open it in 3 or 4 browser windows (or have teammates join). Pick different beasts.
2. Walk between rooms, send a chat and a 🎉 emote, start a focus sprint.
3. Press **Pour me a coffee** in two windows and watch them match.
4. Open a **Where in the World** table with three people (guess the photo, watch the pins land), then try **Doodle Dash**. Play Daily 20, post a photo, check in on the quest and watch the fire grow.

## Files
```
server.js             HTTP + realtime (Server-Sent Events), module loader
modules/*.js          server side of each section
modules/games/*.js    one file per group game (plug-ins)
public/den.js         shell, avatars, fire, realtime client
public/modules/*.js   client side of each section
data/                 trivia.json (edit me), geo-seed.json, den.json + uploads (created at runtime)
public/postcards/     illustrated starter rounds for Where in the World
public/world.json     offline world map
```

## Company logo

The Beast Code logo is in `public/brand/` (`logo.png`, `favicon.png`). Replace `logo.png` or add `logo.svg` to change it; no code changes needed.

## Arena (game stats, challenges, tournaments)

Self-reported stats for any game on any platform, including Nintendo Switch titles. Nothing is pulled from outside services, so it stays fully local.

- **Boards:** log a result (time, score or lowest-wins) with an optional screenshot. Weekly and all-time boards, rival callouts, cheers, and a flag button (two flags hide an entry).
- **Challenges:** post a challenge with a 1, 3 or 7 day deadline. The best result wins 20 points and the lightning badge.
- **Tournaments:** single elimination for 3 to 16 players. Players report results, the host can settle disputes. The champion gets 30 points and a badge.
- **Add a game:** anyone can add one. Built-in games live at the top of `modules/arena.js`.
- Arena points are capped at 25 per person per day.

## Endless trivia

The Trivia page has two modes. **Daily 20** is the same set for everyone, once a day. **Endless** never runs out: 230+ questions with no repeats for a long while, plus a run counter. It awards small practice points, capped at 30 a day. Add your own questions in `data/trivia.json`.

## Daily photos for Where in the World (optional)

Beast Den is local-only by default, so this is **off**. On a machine that is allowed to reach the internet, start with `DEN_DAILY_PHOTOS=1` and the server will pull Microsoft's Bing daily wallpaper photos (the same ones used for backgrounds), look up each location from its credit line, and add them to the game under the "Daily photos" source. It checks every six hours, keeps the latest 60, and shows the photographer credit on reveal. Windows Spotlight has no public feed, so Bing's daily image feed is used. Those images belong to Microsoft and their photographers, so check with your legal or security team before enabling it.

```
DEN_DAILY_PHOTOS=1 node server.js
```

Overrides if you mirror the feeds internally: `DEN_BING_BASE` and `DEN_GEOCODE_BASE`.

## Real landmark photos for Where in the World

The built-in postcards are illustrations. For real photos, build a photo pack once, on any machine that can reach the internet:

```
node tools/fetch-photos.js        # about 65 landmarks; add a number to try just a few, e.g. 10
```

It downloads the lead photo of each landmark's Wikipedia article (freely licensed images from Wikimedia Commons), saves them to `public/photos/`, writes `data/geo-photos.json`, and writes `public/photos/CREDITS.txt` with a link to each photo's Commons page. Copy those two items onto the machine that runs Beast Den and restart it. The game then has a **Real photos** option, and **Mix** uses the real photos instead of the postcards. The credit shows when the answer is revealed. The app itself never touches the internet; only this one-time tool does. You can edit `tools/landmarks.json` to add places (title of the Wikipedia article, label, latitude, longitude).
You can also copy your own photos into `public/photos/` and list them in `data/geo-photos.json` (fields: `id`, `img`, `label`, `lat`, `lon`, `credit`).

**Update:** the launchers (`start.sh` on Mac and Linux, `start.bat` on Windows) now turn daily photos ON by default. Set `DEN_DAILY_PHOTOS=0` before launching to run fully offline.

## Profile, avatars, settings and sign-in

Click your name in the top bar to open the profile panel (no page refresh needed).

- **Avatar:** choose a Beast or a Person. People have hair style and color, skin tone, eyes, mouth, facial hair, gear and shirt color. Surprise me randomizes.
- **Settings** (saved in this browser): Light, Dark or Auto theme, Reduce motion, and Activity pop-ups on/off.
- **Account:** set, change or remove a PIN, and sign out. The sign-in screen has a "Sign in" tab that takes your name and PIN.
  PINs are stored as salted scrypt hashes, names are unique, and 5 wrong tries lock that name for a minute.
  If you sign out without a PIN you cannot get that profile back, so the panel warns you first.
