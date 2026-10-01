# Set up Social Scraper

You need a computer, Node.js, FFmpeg and a few API keys. No Instagram password is ever asked for. It is built and
tested on macOS.

## 1. Install the tools

Install Node.js 24 from [nodejs.org](https://nodejs.org/en/download) (22.9 or newer also works) and FFmpeg. On macOS
with Homebrew:

```sh
brew install node ffmpeg
```

On Ubuntu or Debian, `sudo apt install ffmpeg`, and Node from nodejs.org (the system package is often too old).

Check that all four work:

```sh
node --version
npm --version
ffmpeg -version
ffprobe -version
```

## 2. Get the code

```sh
git clone https://github.com/kaantaskentt/social-scraper.git
cd social-scraper
(cd render && npm ci)
npm run setup
```

`render/` is the video editor (Remotion). It downloads its own headless Chrome the first time it renders a reel.
`npm run setup` copies `.env.example` to `.env` and never overwrites an existing `.env`.

## 3. Get your keys

| Key | Where to get it | What it does |
|---|---|---|
| `APIFY_TOKEN` | [Apify Console](https://console.apify.com/), Settings, API and integrations | Collects reels, thumbnails and public numbers with the [Instagram Reel Scraper](https://apify.com/apify/instagram-reel-scraper) |
| `GROQ_API_KEY` | [Groq API keys](https://console.groq.com/keys) | Transcribes speech (Whisper Large V3 Turbo) and times the captions |
| `FIREWORKS_API_KEY` (instead of Groq) | [Fireworks](https://app.fireworks.ai/), API keys | Transcribes speech (Whisper V3 Turbo) |
| `TYPESAFE_API_KEY` | [TypeSafe](https://typesafe.ai/), API key settings ([docs](https://docs.typesafe.ai/)) | Jev: labels scripts, picks winners to copy, checks scripts and videos |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (Veo video and pictures are billed per use) | Watches reels, draws pictures (Nano Banana), films video (Veo 3.1 Fast, Gemini Omni) |
| `ANTHROPIC_API_KEY` (optional) | [Anthropic Console](https://console.anthropic.com/) | A second opinion on finished reels |

Put them in `.env`, one value per line, and set `TRANSCRIPTION_PROVIDER` to `groq` or `fireworks`. You only need the
key of the provider you chose. You are billed by these services directly; plans, prices and quotas can change.

Groq's free plan allows 20 transcriptions a minute and 2,000 a day. The app reads Groq's limit headers and paces itself,
so a free plan works but a 100-reel scan takes about 7 minutes.

## 4. Check and start

```sh
npm run doctor
npm start
```

`doctor` checks the tools and that each key is present, without printing keys or making paid calls. Then open
**http://127.0.0.1:5190**. Keep the terminal open while the app works. Press **Ctrl+C** to stop it; restart it after
editing `.env`.

## 5. Your first analysis

1. Click **New analysis**, type an account name (without `@`) and choose 30, 60 or 100 reels. The button shows the
   estimated price.
2. Watch the scan. Winners appear in about a minute, before the scan finishes.
3. Open **Winners**, then optionally **Why do these win?**
4. **Make your look**: the app proposes a format, hosts and a place, and shows every picture. Approve it once.
5. **Copy**: pick the winners to copy and the video model, see the price, confirm. Each part plays as soon as it is
   filmed. Every copy gets a faithfulness score against the original.
6. **Ready to post**: download the video, cover and caption. After you post, add your account under
   **Track real results** to see real numbers on each reel.

Every paid step shows its price and asks before spending. Start with a small account to check your setup.

## 6. The research view and recording studio

- **http://127.0.0.1:5190/lab** is the dense research view: choose a topic and a hook, and the thumbnail wall, the
  performance map and the examples narrow together. **Compare engagement** compares patterns with sample sizes. It also
  has the **Connections** dialog to enter and verify keys, pause and resume, and JSON export.
- **http://127.0.0.1:5190/record** replays a saved scan as an animation for screen recording (scanner, wall and map, or
  script breakdown layouts). Press **C** for controls, **Space** to pause, **R** to restart. It makes no paid calls.

## 7. Pause, resume and restarts

- A scan that was cut off by a restart resumes on its own when the server starts again. Finished transcripts and labels
  are reused, never paid for twice.
- If an Apify launch reply is lost, the app blocks a second launch. Find the existing run in Apify, attach it in the
  research view, then resume.
- To switch transcription provider: stop the server, change `TRANSCRIPTION_PROVIDER` and the key, start again. Existing
  transcripts are kept.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `node` or `npm` not found | Install Node.js, then open a new terminal |
| `--env-file-if-exists` unsupported | Upgrade to Node 22.9 or newer |
| FFmpeg or ffprobe missing | Install FFmpeg and make sure both are on PATH |
| Doctor says "Video editor" is missing | Run `cd render && npm ci` |
| A key is missing after editing `.env` | Check the file is named `.env` (not `.env.txt`) next to `server.mjs`, then restart |
| HTTP 401 or 403 | Check the key, the account's permissions and billing |
| HTTP 429 or a paused scan | A provider's quota was hit. Wait, then resume. Short limits retry on their own |
| A reel shows "no speech" | It is music or too little speech. It can still be copied as a visual copy |
| A video failed to download | Instagram links expire. A new scan fetches fresh links |
| No reels returned | Check the account name, that it is public, and the Apify run log |
| Port already in use | Stop the other server, or set `PORT=5191` in `.env` |
| The page stops responding after a restart | Refresh the page to get a new local request token |
| Something else went wrong | Run `node scripts/errors.mjs open`: every error is logged there with where it happened |

## Costs and sharing

The prices shown in the app are estimates from each provider's published rates; your provider bills are the final word.
Never share `.env`, `data/` or screenshots of keys. The server is meant for your own computer, not public hosting.
Read the full [data flow](PRIVACY.md).
