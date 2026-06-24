import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { required, safeSh, sh } from "./agent-workflows/shared/common";

// Manual, supervised entrypoint: run a single issue INTERACTIVELY on the HOST
// (noSandbox) so the agent's TUI attaches to your terminal and you approve each
// action yourself.
//
// Because YOU answer the permission prompts, this path works with a team /
// managed Claude account that forces approvals — unlike the AFK runner and
// `npm run sandcastle`, which run unattended and therefore need a PERSONAL
// token with --dangerously-skip-permissions. No CLAUDE_CODE_OAUTH_TOKEN is
// injected here, so it uses whatever account you are logged into on the host.
//
// Usage:
//   npm run sandcastle:manual -- <issue-number>
//   ISSUE_NUMBER=42 npm run sandcastle:manual

const ISSUE_NUMBER = process.argv[2] ?? required("ISSUE_NUMBER");
const branch = sh("git rev-parse --abbrev-ref HEAD").trim();
const issueTitle =
  safeSh(`gh issue view ${ISSUE_NUMBER} --json title -q .title`).trim() ||
  `Issue #${ISSUE_NUMBER}`;
const issueContext =
  safeSh(`gh issue view ${ISSUE_NUMBER} --comments`) ||
  `Issue #${ISSUE_NUMBER}: ${issueTitle}`;

console.log(
  `\nSupervised session for issue #${ISSUE_NUMBER} on branch "${branch}".`,
);
console.log(
  "Running on the host (no Docker), interactively — you approve each action.",
);
if (branch === "main") {
  console.log(
    'Warning: you are on "main". Consider `git checkout -b agent/issue-' +
      ISSUE_NUMBER +
      "` first.",
  );
}
console.log("");

await sandcastle.interactive({
  agent: sandcastle.claudeCode("claude-opus-4-8"),
  sandbox: noSandbox(),
  promptFile: path.join(
    import.meta.dirname,
    "agent-workflows/implement/prompt.md",
  ),
  promptArgs: {
    ISSUE_NUMBER: String(ISSUE_NUMBER),
    ISSUE_TITLE: issueTitle,
    BRANCH: branch,
    ISSUE_CONTEXT: issueContext,
  },
});
