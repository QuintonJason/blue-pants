# Transcript

**AI Collaboration Assessment Tool for Programming Assignments**

Transcript flips the paradigm from "detect AI cheating" to "assess AI collaboration quality." Students submit their ChatGPT chat exports alongside their final code, and the chat log becomes the primary artifact showing their problem-solving process.

## The Thesis

Instead of asking "did they use AI?" we ask "how well did they use AI?"

- Students must use AI at minimum as a code reviewer
- The chat log reveals their problem-solving process
- Assessment focuses on iteration, critical thinking, and understanding

## Features

- **Chat Import**: Upload ChatGPT JSON exports
- **Automatic Analysis**: Extract metrics from conversation patterns
- **Code Diff View**: Compare AI suggestions vs. final submitted code
- **Smart Highlights**: Flag questions, error discussions, and short prompts
- **Configurable Rubrics**: Set weights per assignment
- **Suggested Scoring**: Algorithm calculates preliminary grades
- **PDF Reports**: Export assignment summaries

## Rescoring

Suggested scores are computed once, at import. When the scoring logic changes, use
**Recompute** on a submission or **Rescore all** on an assignment to recompute from
the transcripts already stored.

A rescore only replaces derived values: the suggested score, the metrics behind it,
and the suggested per-dimension scores. A grade you entered by hand, your dimension
sliders, your notes, and the student's reflection are never touched.

Each suggestion records the rubric it was computed with. Assignment rubrics stay
editable, so if the weights change afterwards the submission page and the report
both say so and point at Recompute — a stored score is never shown as though it came
from weights it never saw.

It cannot undo import-time parsing, though. Transcripts are stored already parsed,
so a submission imported before a parser fix keeps whatever the old parser produced
— re-import the original export to pick that up.

## Rubric Dimensions

| Dimension | Good Signals | Red Flags |
|-----------|--------------|-----------|
| Problem Articulation | Specific context, constraints | Pasted assignment verbatim |
| Iteration Quality | Multiple refinements | Single prompt, accepted first result |
| Critical Evaluation | Asked "why", questioned suggestions | Never asked questions |
| Code Review Engagement | Specific feedback requests | Generic "review my code" |
| Debugging Process | Worked through errors | No errors encountered |
| Independence Shown | Modified AI code | Final code = AI output verbatim |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set a session signing secret (required — the app will not authenticate without it)
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # paste into .env.local

# Start the development server (backs up the database and applies migrations first)
npm run dev
```

`npm run dev` backs up the database to `data/backups` and then applies any new
migrations from `drizzle/`. Run `npm test` for the test suite.

### Changing the database schema

The database holds grades, so its schema only changes through migrations that are
written down and reviewed first:

1. Edit `src/lib/db/schema.ts`. SQLite can only add columns at the end of a table.
2. `npm run db:generate -- --name <what-changed>` writes the SQL to `drizzle/`. Read it:
   a migration that drops or rebuilds a table loses data.
3. `npm run db:migrate` backs up the database and applies it. Commit the schema
   change and the migration together.

The app reads every column in `schema.ts`, so a running app fails until the
migration is applied: do steps 2 and 3 straight after step 1. Don't use
`drizzle-kit push`, which changes the database without a migration.

### Backups

Copies of the database are kept in `data/backups`: before every migration, before
deleting a submission or assignment, and daily while grades are being saved.
`npm run db:backup` takes one on demand. To keep copies off this computer, set
`TRANSCRIPT_BACKUP_DIR` in `.env.local` to a synced folder (iCloud Drive, Dropbox,
a school drive). To restore, stop the app and copy a backup over
`data/transcript.db`.

### First Run

1. Open http://localhost:3200
2. Set up your password on first visit
3. Create your first assignment
4. Start reviewing submissions!

## Tech Stack

- **Next.js 14** (App Router)
- **SQLite** via Drizzle ORM
- **Tailwind CSS** + shadcn/ui
- **bcrypt** for password hashing

## License

MIT
