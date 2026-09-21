---
name: debug
description: >-
  Find the real cause of a bug before fixing it: reproduce, isolate, form a
  hypothesis, test it, fix, add a regression test. Use for any error, failing
  test, crash, or "it does not work" report. Use before trying any fix.
metadata:
  icon: "🐞"
---

# Debug (systematic)

## Rules
- **No fix before you can reproduce.** A fix without a reproduction is a guess.
- Change one thing at a time. Measure after each change.
- After 3 failed hypotheses, stop and report what you know; ask the user.

## Steps

1. **Collect.** Get the exact error text, stack trace, command, input and
   environment. Save them in your task artifact.
2. **Reproduce.** Find the smallest command that shows the bug (a single test,
   a curl, a script). Run it. If you cannot reproduce, say so and ask for more
   information. Do not continue blind.
3. **Isolate.** Narrow the location:
   - read the stack trace bottom-up to the first frame in project code
   - `grep_search` for the error message and the function names
   - use `git log -p --follow <file>` or `git bisect` when the bug is new
   - add a temporary log or assertion if needed (remove it later)
   Use the `explorer` subagent for wide searches.
4. **Hypothesis.** Write one sentence: "The bug happens because X." Predict
   what you will see if it is true.
5. **Test the hypothesis** with the smallest experiment. If wrong, go back to
   step 3 with what you learned.
6. **Fix** the root cause, not the symptom. Keep the diff small.
7. **Regression test.** Add a test that fails without the fix and passes with
   it (use `/hx-workflows:tdd` style). Run the full test suite of the module.
8. **Report** to the user:
   - root cause (one paragraph)
   - fix (files)
   - test added
   - command + output that proves it
   Record the root cause in the notepad if it is something others will hit again.
