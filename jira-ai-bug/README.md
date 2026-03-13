# jira-ai-bug

Link a Jira Bug by key, get AI root-cause analysis and fix suggestions, then generate a fix report (Jira key, root cause, changed files) when the issue is resolved.

- **analyze**: Fetch Jira Bug, search repo by keywords, collect git diff, optionally call AI for root cause and suggested fixes. Use `--no-ai` to skip AI and only output context.
- **report**: Write a Markdown fix doc to `docs/jira-fixes/<KEY>-fix.md` (Jira, root cause, suggested fix, changed files, verification).

## Install

**In any project (recommended):**

```bash
npm install -D jira-ai-bug
# or
pnpm add -D jira-ai-bug
yarn add -D jira-ai-bug
```

**Global (optional):**

```bash
npm install -g jira-ai-bug
```

## Setup

1. In your **project root**, copy `.env.example` to `.env` and fill in:

   - `JIRA_BASE_URL` – e.g. `https://your-domain.atlassian.net`
   - `JIRA_EMAIL` – your Jira email
   - `JIRA_API_TOKEN` – create at [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - `AI_API_KEY` (optional) – for AI analysis; omit or use `--no-ai` to skip AI

2. Add to your project `.gitignore` (if not already):

   ```
   .env
   .jira-ai-analysis
   ```

## Usage

Run from the **project root** (where your `.env` and git repo are).

**Analyze a Bug (with AI if `AI_API_KEY` is set):**

```bash
npx jira-ai-bug analyze PD-17851
```

**Analyze without AI (Jira + repo search + git diff only):**

```bash
npx jira-ai-bug analyze PD-17851 --no-ai
```

**Generate fix report after fixing the bug:**

```bash
npx jira-ai-bug report PD-17851
```

Output: `docs/jira-fixes/PD-17851-fix.md` with Jira key, summary, root cause, suggested fix, changed files (from `git diff --name-only`), and verification section.

**When using `--no-ai`**, a prompt file `docs/jira-fixes/<KEY>-analyze-prompt.md` is also generated. Open it in [Cursor](https://cursor.com), select all, and ask the built-in AI: “请根据以上 Jira Bug 与代码上下文分析根因并给出修改建议” to get analysis without an external API key.

### With npm scripts

In `package.json`:

```json
{
  "scripts": {
    "jira:analyze": "jira-ai-bug analyze",
    "jira:analyze:no-ai": "jira-ai-bug analyze --no-ai",
    "jira:report": "jira-ai-bug report"
  }
}
```

Then:

```bash
pnpm jira:analyze PD-17851 --no-ai
pnpm jira:report PD-17851
```

## Env and options

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | Yes (for Jira) | Jira Cloud base URL |
| `JIRA_EMAIL` | Yes | Jira account email |
| `JIRA_API_TOKEN` | Yes | Jira API token |
| `AI_BASE_URL` | No | Default `https://api.openai.com` |
| `AI_API_KEY` | No | Required only for AI analysis; use `--no-ai` to skip |
| `AI_MODEL` | No | Default `gpt-4o-mini` |
| `JIRA_AI_BUG_SEARCH_DIRS` | No | Comma-separated dirs to search (default: `src`, `lib`, `packages/main/src`, `packages/AMC`) |

## Publish to GitHub / npm

1. Create a new GitHub repo and push the contents of the `jira-ai-bug` folder (or clone this repo and copy the folder).
2. In `package.json`, set `repository.url` to your repo URL.
3. To publish to npm: `npm publish` (ensure you have an npm account and are logged in).

After publishing, anyone can install with:

```bash
pnpm add -D jira-ai-bug
```

## License

MIT
