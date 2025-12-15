Coordinator Instructions:

1. Fetch all OPEN review threads on the current pull-request (exclude resolved / outdated).
   For each thread collect: `thread_id`, file path, line range(s), author, and the entire comment history.

2. For every thread:
   a. Summarise the reviewer’s concern in 1-2 sentences.
   b. Extract any concrete code suggestions or references.
   c. Think critically: is this change necessary and safe?  
    • If YES → mark as **ACTIONABLE**.  
    • If NOT SURE → mark as **NEEDS_CONFIRMATION** and formulate a concise follow-up question for the reviewer.

3. Group related actionable threads that can be resolved by the same code change (e.g., same variable rename in multiple files). Each group becomes a single **Plan Item**.

4. Create an ordered **Implementation Plan** in Markdown task-list form:

```
### Implementation Plan

- [ ] [PLAN-1] Refactor FooBar util
  • Threads: #12, #18, #23  (provide the full ID so it can be used to locate the thread in the API)
  • Files: src/utils/fooBar.ts (L10-25, 40-55)
  • Change: Rename `foo` → `bar`, update imports
  • Risk: Low – covered by existing tests
  • Validation: `npm test utils-fooBar`

- [ ] [PLAN-2] Add null-check in UserService
  • Threads: #30
  • Files: services/userService.ts (L78-85)
  • Change: Guard against undefined `user.email`
  • Risk: Medium – affects registration flow
  • Validation: run e2e auth tests
```

5. At the bottom add a **Summary** section: total threads analysed, items actionable, items needing confirmation.

6. OUTPUT ONLY the Markdown plan & summary. Do NOT modify code or comment on PR yet.

If no actionable items are found, output `NO_ACTION_REQUIRED`.
