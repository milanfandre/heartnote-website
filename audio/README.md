# Sample audio files

These MP3s power the "Hear a song" section on the home page. Each is a ~55-second
web-optimized excerpt (128 kbps) of a real customer song.

| File | Shows as |
|---|---|
| `sample-first-dance.mp3` | First Dance · Country-pop — "Forever Starts Tonight" |
| `sample-father-daughter.mp3` | Father-Daughter Dance · Heartfelt ballad — "One More Dance" |
| `sample-groom-aisle.mp3` | Walking the Aisle · Acoustic — "Here Comes Grace" |
| `sample-fathers-day.mp3` | Father's Day · Warm country — "The Old Man Called David" |
| `sample-mothers-day.mp3` | Mother's Day · Easy listening — "Love You, Mom" |
| `sample-reception.mp3` | Reception Entrance · Upbeat pop — "Tonight We Start" |

Titles / occasions / styles / story lines are set in the `SAMPLES` list in
`index.html` — edit there to change any label.

## Source masters

The full-length original songs live in **`audio/source/`** (git-ignored, kept
local). To add or replace a sample, trim a ~45–55s excerpt to 128 kbps MP3
(under ~1 MB) and drop it here, then add it to the `SAMPLES` list.

Trim command used (adjust the `-ss` start time to land on the best part):

```bash
ffmpeg -ss 30 -t 55 -i "source/SONG.mp3" \
  -af "afade=t=in:st=0:d=1.5,afade=t=out:st=51:d=4" \
  -b:a 128k -ar 44100 -ac 2 sample-NAME.mp3
```
