# ClearCart — the AI browser agent that fights dark patterns

**wHACKiest 2026 · Track: Beyond the Browser**

ClearCart is a Chrome extension and browser agent built around a **4D framework**:

| | What it does |
|---|---|
| **Detect** | Finds dark patterns on any shopping or booking page and maps each one to the 13 patterns in India's CCPA *Guidelines for Prevention and Regulation of Dark Patterns, 2023*. |
| **Defuse** | Neutralises the trick on the page: Clean View, auto-untick of sneaked-in add-ons, Fake Button Shield, scam-alert blocker. |
| **Decide** | **Ghost Checkout** opens the checkout in a hidden tab and reads the true final price. It never clicks pay. **Honest Alternatives** compares all-in prices. |
| **Defend** | An evidence locker (screenshot + SHA-256 hash) and a one-click complaint that pre-fills the form. The user always submits it themselves. |

There is also **Voice Guardian**: spoken commands and spoken warnings in Hindi and English (ElevenLabs, with a fallback to the browser's own voice), for elderly and first-time internet users.

---

## 1. Setup (2 minutes)

```bash
# 1. Serve the demo sites
cd demo-sites
python -m http.server 8000
# open http://localhost:8000
```

2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the `extension/` folder. There is no build step; it's plain JavaScript.
3. Pin ClearCart and click its icon to open the **side panel**.

## 2. Options (⚙ in the side panel, or right-click the icon → Options)

- **ElevenLabs API key + voice ID** (optional). These are stored only in `chrome.storage.local`. Without them, ClearCart uses `speechSynthesis`.
- **🎤 Allow microphone.** Click this once. Chrome only grants mic access to extension pages from a normal tab, and voice commands in the side panel need it.
- Language (EN / हिंदी), Senior Mode, auto-speak warnings.
- Your name and email for complaints, and the complaint form URL (default: `http://localhost:8000/complaint.html`).
- Backend URL (optional, e.g. `http://localhost:8001`).

## 3. Optional backend (LLM + server-side TTS)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # or: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                                # fill in keys (never commit .env)
uvicorn main:app --reload --port 8001
```

| Endpoint | Purpose |
|---|---|
| `POST /classify {snippets:[{id,text,context}]}` | LLM classifies short uncertain snippets (never the whole page). Falls back to a keyword heuristic if there is no key. |
| `POST /complaint {site,url,findings,prices,evidence}` | Formal complaint text (≤250 words). The extension falls back to its own template. |
| `POST /tts {text,lang}` | ElevenLabs `eleven_multilingual_v2` proxy, so the key stays server-side. |

Configure with `LLM_PROVIDER` (`anthropic` or `openai`-compatible), `LLM_API_KEY`, `LLM_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.

## 4. 3-minute demo script

| Time | Action | What the audience sees |
|---|---|---|
| 0:00 | Open `localhost:8000/hotel.html` (StayKart), wait 3 s, **reload**. | Red/amber outlines with badges: **Fake timer** (it reset on reload), **Fake scarcity**, **Fake social proof**, **Disguised ad**, **Guilt-trip button**, **Hidden "No" option**, **Nagging popup**. Trust Score goes red. |
| 0:40 | Side panel → tick **Clean View**. | Timer, "Only 1 room left", viewer count and app nag disappear. "No thanks, I like taking risks" becomes an equal-size **No thanks** button. Untick it and everything comes back. |
| 1:00 | Click **Reveal real price** (Ghost Checkout). | "Listed ₹3,200 → Real total **₹4,150** (+₹950: Platform ₹199, Convenience ₹249, Trip protection ₹199, Taxes ₹303)". No tab flashes and nothing is clicked. |
| 1:25 | Click **Find cheaper honest options**. | "Sea Breeze Resort – official site · ₹3,600 · Trust Score 100 · **₹550 cheaper, no tricks**". |
| 1:45 | Open `download.html` (FreePDFHub). Switch language to **हिं**, tap 🎤 and say *"asli button kaun sa hai"*. | The scam "virus" alert is already blocked. 3 fake DOWNLOAD buttons are greyed out with an **AD** tag, and the real one is outlined green. ClearCart says: **"हरा वाला बटन असली है, बाकी तीन विज्ञापन हैं।"** |
| 2:25 | Back on the hotel tab: **📸 Save evidence**, then **⚖ One-click complaint**. | The demo complaint form opens with all 8 fields pre-filled: CCPA pattern names, URL, ₹ amounts, evidence hashes. Banner: *review and submit yourself*. |
| 2:50 | Open `checkout.html` directly. | The ₹199 Trip protection was unticked automatically and the toast says "Removed ₹199 Trip protection you didn't choose". **Money saved this session** counts up. |

> No mic? Press **Ctrl+K** in the side panel and type the question.

Voice commands (English, Hinglish, or Devanagari):

| Say | Does |
|---|---|
| "Is this a good deal?" / "yeh deal sahi hai" | Summary of the tricks + Ghost Checkout + best alternative |
| "real price" / "asli keemat" / "total" | Ghost Checkout |
| "remove extras" / "hatao" | Auto-untick add-ons |
| "which button is real" / "asli button" | Fake Button Shield + spoken answer |
| "clean view" / "saaf karo" | Toggle Clean View |
| "cheaper" / "sasta" / "alternative" | Honest alternatives |
| "complaint" / "shikayat" | Complaint flow |

## 5. Architecture

```
                 ┌──────────────────────── Chrome (MV3) ────────────────────────┐
  web page  ───► │ content scripts                                              │
                 │  lib/patterns.js   CCPA catalogue (13 patterns, EN+HI)       │
                 │  detector.js       rule engine → findings[] (+ timer/number  │
                 │                    memory per URL in chrome.storage)         │
                 │  defuser.js        overlays · Clean View · auto-untick ·     │
                 │                    Fake Button Shield · scam blocker         │
                 │  content.js        MutationObserver (throttled) · Trust Score│
                 │        │ runtime messages                                    │
                 │        ▼                                                     │
                 │ background.js (service worker)                               │
                 │  Ghost Checkout ─► hidden tab (active:false) ─► executeScript│
                 │                    reads totals ─► closes tab (never pays)   │
                 │  Alternatives   ─► data/alternatives.json ─► ghost each alt  │
                 │  Evidence       ─► captureVisibleTab + SHA-256 ─► storage.js │
                 │  Complaint      ─► template / backend ─► open form ─► prefill│
                 │        ▲                                                     │
                 │ sidepanel/  UI · lib/voice.js (webkitSpeechRecognition,      │
                 │             intent parser, ElevenLabs → speechSynthesis)     │
                 └────────┬─────────────────────────────────────────────────────┘
                          │ optional HTTP
                 ┌────────▼────────┐        ┌──────────────┐
                 │ FastAPI backend │──────► │ LLM provider │
                 │ /classify       │        └──────────────┘
                 │ /complaint      │        ┌──────────────┐
                 │ /tts            │──────► │ ElevenLabs   │
                 └─────────────────┘        └──────────────┘
```

### Detection → CCPA pattern mapping

| Detector rule | Signal | CCPA pattern |
|---|---|---|
| Countdown timer | `mm:ss`/`hh:mm:ss` near urgency words; **FAKE** if it jumps back up on reload | False Urgency |
| Scarcity | "only N left", stored per URL; **FAKE** if N changes randomly | False Urgency |
| Social proof | "N people viewing / bought in the last hour"; **FAKE** if N changes | False Urgency |
| Pre-ticked add-on | checked box mentioning insurance/protection/warranty/donation/tip/priority/add-on, ₹ extracted | Basket Sneaking |
| Guilt wording | decline control with shame regex ("I like taking risks") | Confirm Shaming |
| Unequal choices | accept vs decline in the same container: >3× area, >1.4× font, or faint grey | Interface Interference |
| Fee lines | platform/convenience/handling/service fee rows + Ghost Checkout difference | Drip Pricing |
| Sponsored lookalike | tiny "Sponsored/Ad" label inside a card styled like its organic siblings | Disguised Advertisement |
| Fake download buttons | inside ad containers, linking off-site, or not to a real file | Disguised Advertisement |
| Fake close "X" | close control whose link navigates away | Rogue Malpractices |
| Fake system alert | fixed overlay: virus/infected/call support/you won | Rogue Malpractices |
| App/notification popups | fixed overlay asking to install/subscribe; re-appearances counted | Nagging |
| Double negatives | checkbox label with ≥2 negations | Trick Question |

**Trust Score** = 100 − Σ pattern weights (max 3 per pattern; ×1.3 for confirmed fakes). The badge is green (≥75), amber (≥45) or red.

### Safety rules (enforced in code)

- Ghost Checkout only **navigates** a hidden tab to the checkout URL and **reads** text. It never clicks anything, and never clicks pay or confirm.
- The complaint form is **pre-filled only**. `fillComplaintForm` never calls `submit()` and skips password fields.
- ClearCart never reads or stores passwords, OTPs, or card or bank details. Snippets sent to the LLM are short button texts only.
- The demo brands (StayKart, BazaarBuy, FreePDFHub, Sea Breeze Resort) are fictional. The complaint page is labelled **"Demo complaint form (for testing)"**.
- API keys live only in `backend/.env` (git-ignored) or extension options storage.

## 6. Tests

```bash
cd tests
npm install
npx playwright install chromium
npx playwright test                       # starts the demo server automatically
```

Chrome 137+ ignores `--load-extension`. If Playwright's bundled Chromium won't start, use your installed Chrome. The tests then load the extension over CDP (`Extensions.loadUnpacked`):

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"; npx playwright test
```

The tests cover: ≥6 hotel findings, including the fake timer after a reload · Clean View hides and then restores · auto-untick drops the total by ₹199 · Ghost Checkout = ₹4,150 with its fee breakdown and no leftover tabs · alternative at ₹3,600 (₹550 cheaper, Trust 100) · download page has 3 fake buttons disabled, the real one highlighted and the scam alert blocked · complaint pre-fills all 8 fields and does **not** submit · voice intents in EN/Hinglish/Devanagari · no console errors on the pages. The tests also save screenshots to `tests/screenshots/`.

## 7. Known limitations & next steps

- Detection is rule-based and tuned on the demo pages. Real sites need more site adapters for checkout links and totals, plus the LLM pass for wording it can't match.
- Ghost Checkout follows plain links only (up to 2 hops). It can't get through flows that need a login, a cart built with JavaScript, or a form POST.
- Fake-timer and fake-number detection needs at least one reload. It uses per-URL memory in local storage.
- Evidence screenshots are captured only when the tab is visible.
- **Next:** a mobile app (Android accessibility service), Supabase sync (swap `lib/storage.js`), community reports ("142 users flagged this site"), fake-discount detection from the stored price history, more site adapters, and filing real complaints through official channels.
