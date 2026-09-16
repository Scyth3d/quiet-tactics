# Quiet Tactics

A static chess-training prototype that mixes tactical positions with quiet, non-tactical positions. It is designed for GitHub Pages and has no build step or backend.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the default branch and `/ (root)`, then save.

The app stores rating and session stats in the browser. It uses a bundled puzzle pack sourced from Lichess and classifies entries using the Lichess `themes` field. Serving puzzles locally avoids browser CORS failures and Lichess's strict unauthenticated API rate limits. `chess.js` validates clicked moves.

This is an independent client of Lichess and is not affiliated with Lichess. See the [Lichess API documentation](https://lichess.org/api) and [database terms](https://database.lichess.org/).

## Build the 100,000-position pack

Run the **Build puzzle pack** workflow from the repository's Actions tab. It streams the public Lichess puzzle database and writes 100 browser-friendly JSON shards containing 50,000 tactical and 50,000 quiet positions.

Quiet positions come from pre-blunder game positions and must pass a Stockfish MultiPV check: at least three candidate moves within 45 centipawns, no forced mate, and no capture, promotion, or check as the leading move. Positions before move 15 are rejected to prevent the quiet set from being dominated by openings.

The generated `data/manifest.json` tells the browser which shards exist. The app downloads one 1,000-position shard on demand and remembers the last 5,000 puzzle IDs locally to prevent repeats.
