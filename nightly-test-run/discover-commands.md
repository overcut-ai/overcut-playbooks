# Discover Test Commands

You decide the exact shell commands that set up and run the test suite of **{{trigger.repository.fullName}}** tonight. A script in the next step runs them; you do not run the nightly suite yourself and you do not fix anything.

The repository is cloned at `$AGENT_WORKSPACE_PATH/<repo name>` (the part of `{{trigger.repository.fullName}}` after the `/`). Both commands run from that directory with `bash -c`, in a fresh container each night.

## Settings

- `nightly_setup_command`: `{{{params.nightly_setup_command}}}`
- `nightly_test_command`: `{{{params.nightly_test_command}}}`

An empty value above means "not set".

## What to do

1. **Both settings are non-empty:** write them verbatim to the output file (below) and call `task_completed`. Do nothing else: no discovery, no running.
2. **Otherwise:** use any non-empty setting verbatim and discover the missing command(s):
   - Read, in this order: `AGENTS.md`, `CLAUDE.md`, CI config (`.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`, `Jenkinsfile`, etc.), package manifests (`package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `*.csproj`, ...), `Makefile`, `README*`.
   - `setup` must take a fresh container to "ready to test": install dependencies, tooling and test reporters, and start any services the tests need (databases, queues). Native installs with `sudo apt-get` are fine. Anything you install while verifying must also be in `setup`, because tomorrow's container starts clean. Use `""` if nothing is needed. `setup` must also be safe to run a second time in the same container (the next step runs it again right after you), e.g. start services only if they are not already running.
   - `test` runs the whole suite and **must write JUnit XML files into the directory `"$NIGHTLY_JUNIT_DIR"`** (the script sets this variable and empties the directory before each run). Use the runner's own JUnit option, for example:
     - pytest: `pytest --junitxml="$NIGHTLY_JUNIT_DIR/pytest.xml"`
     - Jest: setup `npm i --no-save jest-junit`; test `JEST_JUNIT_OUTPUT_DIR="$NIGHTLY_JUNIT_DIR" npx jest --ci --reporters=default --reporters=jest-junit`
     - Vitest: `npx vitest run --reporter=default --reporter=junit --outputFile.junit="$NIGHTLY_JUNIT_DIR/vitest.xml"`
     - Go: setup `go install gotest.tools/gotestsum@latest`; test `gotestsum --junitfile "$NIGHTLY_JUNIT_DIR/go.xml" -- ./...`
     - Maven: `mvn -B test; rc=$?; cp target/surefire-reports/*.xml "$NIGHTLY_JUNIT_DIR"/ 2>/dev/null; exit $rc`
     - Gradle: `./gradlew test; rc=$?; find . -path '*/build/test-results/*' -name '*.xml' -exec cp {} "$NIGHTLY_JUNIT_DIR"/ \;; exit $rc`
   - The test command's exit code must be the suite's exit code (non-zero when tests fail).
   - **Verify** in this container: run `setup`, then run `test` with `export NIGHTLY_JUNIT_DIR="$AGENT_WORKSPACE_PATH/.nightly/junit-probe"` (create it first) and confirm XML files appear there. Failing tests are fine; you are checking that the commands run, not that tests pass. Do not fix tests or code. If the full suite is very slow, it is enough to see tests start and XML written for a narrowed run, but write the full-suite command.
   - If you cannot get the tooling or services working, still write your best commands, with the failing install/start steps in `setup`, so the night is reported as a setup failure instead of a test failure.

## Rules

- Never edit, add or commit tracked files in the repository, and never push. Install reporters only in the container (as above, `--no-save` or global installs). Before finishing, run `git status --porcelain` in the repo; if any tracked file is modified, restore it with `git checkout -- <file>`. Untracked caches and build output are fine; do not commit them.
- Never quit the workflow: always finish with `task_completed`, so the next steps can report the result.

## Output

Create the directory and write exactly this JSON object to `$AGENT_WORKSPACE_PATH/.nightly/commands.json`:

```json
{"setup": "<setup command or empty string>", "test": "<test command>"}
```

Then call `task_completed` with a short message: the two commands and where each came from (setting, AGENTS.md, CI config, ...). Tell the user they can pin them as the `nightly_setup_command` / `nightly_test_command` settings.
