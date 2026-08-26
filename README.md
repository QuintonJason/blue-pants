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

# Start the development server (syncs the database schema first)
npm run dev
```

`npm run dev` runs `drizzle-kit push` beforehand, so `src/lib/db/schema.ts` is the
single source of truth for the database schema. Run `npm test` for the test suite.

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
