# Suggestion box

Target: `<project>/.agent-project-guides/local/suggestions/NNNN-<type>-<slug>.md`, one letter per file. The box is clone-local state: APG tooling never stages, commits, or transmits letters, and a letter never grants authority or changes routing by itself.

Write one letter when routing leaves a real gap — no executable choice fits the task, the routed role does not match the work, or the available roles/modes lack what the project needs. Finish the current task under the closest permitted route first; the letter is written afterwards, not instead of work.

```markdown
# Suggestion NNNN: <one-line title>

Type: missing-role | wrong-role | missing-mode | routing-gap | other
Attempted route: plane=<plane> role=<role> mode=<mode> | none
Date: <YYYY-MM-DD>

Task: <what the task actually needed>
Evidence: <what the router returned or lacked; quote ids/choices; no secrets>
Proposal: <the smallest change that would have made routing fit>
Impact: <who else likely hits this and how often>
```

Rules: one concern per letter; 2 KB max; never include credentials, private data, or file dumps; `NNNN` is the next unused zero-padded number in the directory. Letters are report-only input for the next triage.

## Triage

- Package Re-adapter (initialize/readapt): count and classify letters into the adaptation report, convert actionable items into `proposal` suggestions, and never implement a new role from a letter without the normal routing.
- Maintainer: when the box has unprocessed letters, triage them at session start; move processed letters to `processed/` with a one-line outcome.
- APG source maintainers: letters that need package changes travel with the consumer's update report into the APG repository's own box and are handled in the normal maintainer cycle.
