# Self-hosted runner + local Docker sandbox

How this fork runs AFK agents on a **self-hosted runner** with the agent isolated
in a **Docker sandbox**, the account rules that apply, and the security posture
that governs where the runner may be registered.

> This is fork-specific operational guidance (it is not part of the upstream
> `@ai-hero/sandcastle` package). For terminology see [`CONTEXT.md`](../../CONTEXT.md).

## Goal

A reusable AFK-agent setup that drops into any GitHub **or** GitLab project (TS
or Python), triggered by **labeling an issue**, running in a **local Docker
sandbox** on a **self-hosted runner**. Built bootstrap-first: dogfood the feature
work using the issue → agent → PR loop itself.

## ⚠️ Security: never register a self-hosted runner on a PUBLIC repo

GitHub's own guidance: **do not use self-hosted runners with public
repositories.** On a public repo, anyone can fork it and open a PR that **adds a
workflow** with `runs-on: self-hosted` and arbitrary code — that job runs on
**your machine** with your runner's access. Label-gating your own workflows does
**not** mitigate this, because the attacker supplies their own workflow in the
PR; `npm ci`/build/test lifecycle scripts are enough to execute code.

**Rules:**

- Register the self-hosted runner **only on a private repo.** This fork is public
  (its upstream is public and cannot be made private), so the runner must **not**
  be registered here.
- For dogfooding the feature work, use a **private mirror**: push this code to a
  private repo, register the runner there, run the issue → agent → PR loop there,
  and push finished commits back to the public fork only to open upstream PRs
  (which then use cloud CI only).
- If a runner was ever registered on the public repo: stop + uninstall the
  service (`./svc.sh stop && ./svc.sh uninstall`) and remove it under
  **Settings → Actions → Runners**. Also set **Settings → Actions → General →
  Fork pull request workflows → "Require approval for all outside
  collaborators."**

## Workflow routing

Only **issue-triggered** workflows (no untrusted code) may run on the self-hosted
runner. `pull_request_target` workflows check out untrusted PR code and must stay
on disposable **cloud** runners.

| Workflow              | Trigger                | Runner          | Sandbox       |
| --------------------- | ---------------------- | --------------- | ------------- |
| `agent-implement`     | `issues: labeled`      | self-hosted     | `docker()`    |
| `agent-explore`       | `issues: labeled`      | self-hosted     | `docker()`    |
| `agent-review`        | `pull_request_target`  | cloud           | `noSandbox()` |
| `agent-update-branch` | `pull_request_target`  | cloud           | `noSandbox()` |
| `agent-implement-pr`  | `pull_request_target`  | cloud           | `noSandbox()` |

On a local runner, `noSandbox()` would run the agent directly on the host;
`docker()` confines it to the image `sandcastle-agent:local`, built per run by the
workflow's "Build sandbox image" step. The pinned image name lives in
[`SANDBOX_IMAGE`](../../.sandcastle/agent-workflows/shared/common.ts).

## Account / permission rule

The deciding axis is **interactive vs unattended**, not host vs Docker. A
team/managed Claude account that forces permission prompts **cannot run
unattended** (managed settings override `--dangerously-skip-permissions`; the
agent hangs with no human to approve).

- **AFK / unattended** — the self-hosted runner (`agent-implement`,
  `agent-explore`) and `npm run sandcastle` (autonomous, Docker) → use a
  **personal** `CLAUDE_CODE_OAUTH_TOKEN` (a GitHub repo secret for the runner).
- **Supervised / interactive** — `npm run sandcastle:manual -- <issue>` (host,
  `noSandbox()`, TUI) → a **team account works**, because you answer the prompts
  live. Do not put the personal token in `.sandcastle/.env`, or it leaks into
  manual runs.

## Runner as a service (boot-persistent)

On the private repo's runner host:

```bash
cd ~/actions-runner
sudo ./svc.sh install $(whoami)   # systemd unit, runs as your user, enabled on boot
sudo ./svc.sh start
sudo ./svc.sh status
```

The service user must talk to Docker without sudo:

```bash
sudo usermod -aG docker $(whoami)
sudo ./svc.sh stop && sudo ./svc.sh start
```

## Activation note

`on: issues` always uses the workflow file **and** agent script from the
**default branch**. Routing changes only take effect once merged to the default
branch of the repo the runner is registered to.

## Design decisions (from grilling)

- **Distribution:** publish the fork to **public npm under own scope**. `dist/` is
  gitignored and `prepare` runs husky (not build), so publishing must run the
  build (`prepublishOnly`).
- **Trigger:** label-added opt-in (`agent:implement`). GitHub = event-driven
  (`on: issues`). GitLab has no issue-event CI trigger → **scheduled polling
  pipeline** + `glab`.
- **Sandbox image:** Node base + **Python 3 + uv** via an `init --stack` flag
  (Node always present — the agent CLI is Node-based).
- **Output:** draft PR/MR (`gh pr create` / `glab mr create`). MVP = core loop
  only (label transition → branch → run → push → PR/MR → blocked-on-failure).
- **GitLab issue tracker:** `glab` registry entry in
  [`src/InitService.ts`](../../src/InitService.ts) (worked example in
  [`adding-an-issue-tracker.md`](./adding-an-issue-tracker.md)).

## Status / TODO

- Done (branch `chore/self-hosted-docker-runner`): `agent-implement` +
  `agent-explore` on self-hosted + `docker()`; `npm run sandcastle:manual`.
- TODO: npm publish setup; GitLab `glab` tracker; Python/uv Dockerfile `--stack`;
  GitLab scheduled-polling trigger. Build these via the dogfood loop **on the
  private repo**.
