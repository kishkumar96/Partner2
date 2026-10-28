# CLAUDE.md

@AGENTS.md

Claude-specific notes:
- Do not add `Co-Authored-By: Claude` or other AI attribution to commit messages or PR descriptions; commits are authored by the user alone.
- Work on the shared working branch named in `WORKING.md`, in its own worktree and never in the user's dirty `/data/Partner2` tree. Don't create a branch per task (see "Working together" in AGENTS.md). Push or open PRs only when asked.
- `next build` runs out of memory on the shared server, and the husky hooks cannot run there. Build, type-check, lint and test on a normal machine; use `--no-verify` only with the user's approval, say so in the summary, and ask them to run the checks.
- Do not share a worktree with another session: two writers on one tree overwrite each other. Check `ListAgents` and the file timestamps before editing a file you did not just write.
