# Working rules for Claude in this repository

## Delegate code writing to DSH; Claude plans, reviews and ships

The maintainer's standing instruction: Claude does not write the bulk of the code itself. It plans,
hands the writing to a DSH (DeepSeek Harness) worker running headless, then reviews, tests and
ships. This saves the maintainer's Claude usage; DeepSeek tokens are cheap.

**If you are the DSH worker running a brief, this section is not for you:** do the task yourself, in
this working tree, and never start another DSH. Every brief should open with that sentence too, since
DSH also reads this file.

**Delegate** work that is sizeable and well specified: new tests, doc edits and en / zh-CN syncs,
a feature that follows an existing pattern, mechanical refactors, fixes whose cause is already found.

**Do it yourself** when delegating costs more than it saves: a fix of a few lines, root-causing
a bug (finding the cause is the hard part; hand over the fix afterwards if it is large), anything
touching secrets, git history, CI or publishing. Say in one line why you did not delegate.

### Setting up the worker (once per container)

The DeepSeek key is a network secret: the egress proxy adds it to requests to `api.deepseek.com`,
so the environment only needs a placeholder. Keep DSH and its home outside the repository.

```bash
W=<scratchpad>/dsh                 # anywhere outside the repo
mkdir -p $W && cd $W && npm init -y >/dev/null && npm i @deepseek-ai/dsh@0.2.0-rc.2 --silent
export DSH_HOME=$W/home DEEPSEEK_API_KEY=placeholder
npx --prefix $W dsh --profile worker --from-default-profile headless --help >/dev/null
```

Check free disk first (`df -h /`): DSH needs about 550 MB.

### The loop

1. **Brief.** Write the task as a standalone prompt: the goal, the files involved, the repository's
   conventions that matter (read `CONTRIBUTING.md` and the nearby code first), what not to touch,
   and the exact checks it must pass (`npm run lint`, the relevant `node --test …`, `npm test`).
   Tell it: do not commit, push, or change git config; do not edit files outside the task.
2. **Run** from the repository root on a clean working tree:
   `npx --prefix $W dsh --profile worker --json "<brief>" > <scratchpad>/run.jsonl`
   The first `session` event carries the session id; continue the same conversation with
   `--session-id <id> "<follow-up>"`.
3. **Review** as if it were a stranger's PR: read the whole `git diff`, run lint and tests yourself,
   check the result in a browser when the change is visible, and confirm `git log` shows no commit
   from the worker. Send concrete problems back with `--session-id`; fix trivial leftovers yourself.
4. **Ship.** Only Claude commits and pushes, after the review passes.
5. **Report** to the maintainer briefly: what was delegated, how many rounds it took, what you had to
   fix, and anything the worker got wrong that should change the next brief.
