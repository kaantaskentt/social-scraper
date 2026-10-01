# Data flow and local files

Social Scraper runs on your own computer. It calls a few paid services, and each one only receives what its step needs.

## Who receives what

| Service | Step | What it receives |
|---|---|---|
| Apify (Instagram Reel Scraper) | Scan, Track real results | The account name and how many reels to collect |
| Groq or Fireworks (Whisper) | Scan, final edit | Audio extracted from each reel (16 kHz mono); only the provider you chose is used |
| TypeSafe Jev | Scan, picking, checks | Transcript text and short descriptions to judge. Scan labels come from the words alone, before plays or likes are joined |
| Google Gemini API | Why do these win?, Look, Copy | The reels it watches, reference pictures of your hosts and place, and the prompts for new pictures (Nano Banana) and videos (Veo 3.1, Gemini Omni) |
| Anthropic Claude (optional) | Second opinion on a finished reel | One frame per second, the timed transcript and the script. Only used if `ANTHROPIC_API_KEY` is set |

The browser also loads fonts from Google Fonts. Reel thumbnails and the "original reel" links load from Instagram's
servers. Each provider's own retention and use policies apply. Running the app locally does not mean all processing
stays on your computer.

## Keys

- Keys come from `.env`, the process environment, or the Connections dialog in the research view (`/lab`). Dialog keys
  live in server memory until it stops.
- The API reports whether a key is set and verified, never its value. `npm run doctor` checks keys by presence only.
- `.env` is gitignored. Never put a key in an issue, a screenshot or a committed file.

## The server

- It listens on `127.0.0.1` only and has no login, so it must not be exposed as a public server.
- Requests that change anything need a per-session token that the page receives on load.

## Local files (`data/`, gitignored)

| Folder | What is in it |
|---|---|
| `data/runs/` | Each scan: reels, metrics, provider responses, progress |
| `data/cache/` | Transcripts and labels, so nothing is paid for twice |
| `data/media/`, `data/videos/` | Thumbnails and downloaded reels |
| `data/channels/` | Per account: the Look's pictures, made and copied reels, covers, checks, spend |
| `data/secret/`, `data/shotlists/`, `data/scores/` | Results of the deeper analyses: why they win, shot lists, scores |
| `data/errors.jsonl` | Every error the app hit, grouped, for fixing |

Treat `data/` as private: it holds other people's public content and your unpublished reels. JSON exports leave out raw
provider responses and keys, but still contain creator content and source links, so review them before sharing.
