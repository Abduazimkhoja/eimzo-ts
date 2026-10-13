# Using eimzo-ts with AI coding tools

Resources that help AI assistants (Claude Code, Cursor, Codex, Gemini CLI, ChatGPT and others) use this
library correctly. None of them is discovered automatically unless your tool is configured to read it.

| Resource | What it is | Where |
|---|---|---|
| `llms.txt` | Index of the documentation in the [llms.txt](https://llmstxt.org/) format | https://abduazimkhuja.github.io/eimzo-ts/llms.txt |
| `llms-full.txt` | README, backend guide and skill references in one text file | https://abduazimkhuja.github.io/eimzo-ts/llms-full.txt |
| Agent Skill | Task instructions in the [Agent Skills](https://agentskills.io/specification) format | [`skills/eimzo-ts/`](skills/eimzo-ts/SKILL.md), also inside the npm package |
| `AGENTS.md` | Rules for agents working on this repository or integrating the library | [`AGENTS.md`](AGENTS.md) |
| Type declarations | Full TypeScript API with JSDoc (comments in Russian) | `node_modules/eimzo-ts/dist/index.d.ts` |

## Installing the Agent Skill

The skill is the folder `skills/eimzo-ts/` (a `SKILL.md` plus `references/`). Copy it into the skills
directory your tool reads. After `npm install eimzo-ts` it is available at
`node_modules/eimzo-ts/skills/eimzo-ts/`.

Claude Code (project-level):

```bash
mkdir -p .claude/skills
cp -r node_modules/eimzo-ts/skills/eimzo-ts .claude/skills/
```

Claude Code (user-level, all projects): copy to `~/.claude/skills/eimzo-ts/` instead.

Other tools that support Agent Skills: copy the same folder into the location described in that tool's
documentation. The folder name must stay `eimzo-ts` (it must match `name` in `SKILL.md`).

Without skill support, point the assistant to the file directly, e.g.
"Read node_modules/eimzo-ts/skills/eimzo-ts/SKILL.md and follow it."

## Prompts that work well

- "Add login with E-IMZO to this app using eimzo-ts. Backend endpoints: …"
- "Replace e-imzo.js / e-imzo-client.js with eimzo-ts, keep the same UI."
- "Add a 'Sign' button that signs the order JSON with a timestamp and posts it to /api/orders/:id/sign."
- "eimzo-ts throws API_KEY_REJECTED on staging — what is wrong?"

Ask the assistant to also implement or review the backend: the library creates signatures, but only the
server (via e-imzo-server) can verify them.
