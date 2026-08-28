# job

A personal job scanner. Rules you write and can read, instead of a feed that
decides what you're allowed to see.

**[SPEC.md](SPEC.md)** — how it works · **[PROFILE.md](PROFILE.md)** — what it
works from · **[BUILD-PROMPT.md](BUILD-PROMPT.md)** — the standard it was built to

## What it does

Scans the boards nightly, splits the result into lanes, and lets you narrow each
one with a stack of rules that shows what every rule costs you. Nothing is
filtered by anything you can't open and read.

- **Lanes, not one list.** A bridge job and a career job are optimised against
  different things; blended into one ranking, the result is wrong for both.
- **A visible funnel.** Every rule shows how many jobs it removed. Switch one
  off and they come back.
- **Soft vs hard requirements.** "Bachelor's preferred, 5 years or equivalent"
  is reported as *open*. Self-selecting out of soft requirements loses more jobs
  than any filter.
- **Clearance eligibility is met, not missing.** "Must be able to obtain a
  Secret clearance" is a requirement a citizen in the Guard satisfies today.
- **An applied log that survives everything.** Tick a box; the job leaves the
  pool and never comes back around as new.
- **Dead reqs named.** A job you applied to that reappears as fresh is on the
  record as a dead req rather than a suspicion.

## Running it

```sh
npm install
npm run scan     # walks the boards; slow on purpose
npm run dev
```

```sh
npm test         # 176 unit tests
npm run build
npm run preview & npm run e2e    # 26 browser checks
```

## What lives where

Only `data/history.json` is committed — first-seen dates and repost counts,
which are the one thing that cannot be refetched. The scan output is rebuilt at
deploy time.

Your applied log, cover letters, API key and settings stay in the browser. The
scoring and the letters run on your device with your own key, so none of it
reaches the scheduled scan.
