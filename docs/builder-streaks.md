# Builder Streaks & Shared Context — MVP design

Status: **draft for review** · Owner: you · Prepared: 2026-11-13

This is a design to steer *before* any code. It proposes the smallest version
that delivers the feeling of "I'm keeping a shipping streak alongside other
builders working on similar things," names the real decisions, and is honest
about where it strains shiplog's current architecture.

---

## 1. The idea in one line

shiplog already knows when you ship (you post updates from commits). Turn that
signal into a light social layer: **keep a shipping streak, and get matched with
a few builders on similar projects so you're shipping *alongside* people, not
alone.**

## 2. Why it could stand out

Buffer/Typefully/Hypefury schedule posts. None of them know you're a developer,
what you're building, or who else is building something adjacent. shiplog does —
from your commits. The differentiator is **"commits → social → a small cohort of
similar builders,"** which no general scheduler can do.

## 3. The core loop (what a user actually experiences)

1. You `shiplog post` as usual. A successful post counts as a "ship" for the day.
2. `shiplog status` shows your **streak** ("🔥 6-day streak · 3 of your 4 pod
   members shipped this week").
3. Once a week you get a short **digest**: what your pod shipped, who's on a
   streak, a nudge if your streak is about to lapse.
4. Opt in once; everything is pseudonymous and off by default.

Everything above the streak counter (pods, digest) is additive — v0 can ship
just the solo streak.

## 4. The hard decisions (need your call)

### 4a. Architecture: this needs a real database

shiplog today is **DB-less** — per-user JSON in Vercel Blob, addressed by key.
That's great for "read *my* token," but a social feature needs **cross-user
queries**: "who is similar to me," "who in my pod shipped this week,"
leaderboards. You can't do that over opaque Blob keys without scanning everything.

Options:
- **A. Add a real database** (Postgres). Cleanest for matching/streaks/pods.
  Neon/Lakebase Postgres is already available in this environment and branches
  with previews. **Recommended** if we do pods + matching.
- **B. Stay Blob-only, maintain a hand-rolled index** (e.g. a `builders/index.json`
  and `pods/<id>.json`). Works for *very* small scale and a solo/opt-in list, but
  concurrent writes race and it won't scale. OK only for a v0 solo-streak + manual
  pods.
- **C. Solo streaks only, no cross-user anything** — fits Blob perfectly, ships
  this week, defers the social graph entirely.

> **Decision 1:** A, B, or C? My recommendation: ship **C now** (solo streaks,
> zero new infra), and gate the social half (pods/matching) on choosing **A**.

### 4b. The "similar builder" matching signal

How do we decide two builders are "similar"? Candidates, cheapest → richest:
- **Stack**: languages from commit file extensions (shiplog already reads these).
  Cheap, decent. "Rust + TypeScript builders."
- **Self-declared tags**: user picks 1–3 topics on opt-in ("devtools", "AI",
  "games"). Simple, accurate, low effort, privacy-friendly.
- **Topic from text**: keywords/embeddings of commit messages + post drafts.
  Richest, but needs embeddings (the env's AI gateway could do this) and leaks
  more.

> **Decision 2:** Start with **self-declared tags + primary language**? (Highest
> signal-to-effort, least creepy.) Embeddings can come later.

### 4c. Pods: auto-matched vs self-selected

- **Auto pods**: system drops you into a rotating group of ~4 similar builders.
  Zero effort, but strangers.
- **Self-selected**: you share/join a code, like a group invite. More intent,
  better retention, no matching algorithm needed for v1.

> **Decision 3:** I'd start **self-selected** (join-by-code), add auto-matching
> once we have enough opted-in builders for it to be any good.

### 4d. Streak rules

- **Unit of a "ship":** a *successful post* (not a raw commit — commits are noisy
  and private). One ship per day max.
- **Cadence:** daily streak with a **weekly floor** is punishing for most devs.
  Propose **weekly streaks** ("shipped this week") as the primary, with an
  optional daily counter for the hardcore.
- **Grace:** one "freeze" per month so a vacation doesn't nuke a long streak.

> **Decision 4:** Weekly streak as the headline metric — agree?

### 4e. Privacy / opt-in (non-negotiable defaults)

- **Off by default.** Streaks and pods only exist after explicit opt-in.
- **Pseudonymous.** A builder handle you choose, not your GitHub login, unless
  you opt to show it.
- **What's shared with a pod:** ship *cadence* (did you ship this week, streak
  length) and your chosen tags. **Not** your commits, repo names, or draft text.
- **Posts stay yours.** This never auto-posts or reveals private repo content.
- Leave any pod; delete your builder profile and all pod membership in one call.

## 5. Proposed MVP scope (phased)

- **v0 — Solo streak (no new infra, fits Blob, ~1–2 days):**
  - On a successful post, append to `shiplog/users/<id>/ships.json` (date log).
  - `shiplog status` shows current weekly streak + last ship.
  - A new `shiplog streak` command (or fold into `status`).
  - *Delivers the habit loop immediately; proves the value before social.*

- **v1 — Pods (needs Decision 1 = A, ~1 week):**
  - Opt-in: builder handle + tags + primary language.
  - Join-by-code pods (≤6 members).
  - `shiplog status` shows pod cadence; a weekly email/CLI digest.

- **v2 — Matching + notifications (later):**
  - Auto-suggest pods from tags/language (or embeddings).
  - Nudges before a streak lapses; "someone in your pod just shipped."

## 6. Data model sketch (v1, if Postgres)

```
builder(user_id PK, handle, tags text[], primary_lang, created_at, opted_in)
ship(user_id, shipped_on date, platforms text[])        -- one row per ship
pod(id PK, name, join_code, created_by, created_at)
pod_member(pod_id, user_id, joined_at)                  -- PK(pod_id,user_id)
```
Streak = derived from `ship` rows (no stored counter to drift). Pod cadence =
join `pod_member` → `ship` for the current week.

## 7. What I need from you

Answer **Decisions 1–4** (and confirm the privacy defaults in §4e). With those, I
can build **v0 this week** regardless, and scope v1 to your call on the database.

## 8. Risks / open questions

- Cold-start: pods are worthless with few users. v0 solo-streak sidesteps this.
- Gaming: posting junk to keep a streak. Mitigate later (dedupe, min length) —
  not an MVP concern.
- Email as a notification channel means adding an email sender; CLI/web-only
  digest avoids that for v1.
