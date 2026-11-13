# Thread-scoped Harbor binding

This source feature is Codex-only. It does not register a global MCP server, change Codex trust,
or reload a shared provider. Installing a binding does not update an already loaded native thread.

The environment operator owns `<stateDir>/thread-harbor/<encoded-thread-id>.json`, where `stateDir`
is the server's userdata directory and the filename uses `encodeURIComponent(threadId)`. The file
must be a regular file with owner-only permissions (0600). Only the exact app thread reads it.

```json
{
  "schema_version": 1,
  "thread_id": "<app-thread-id>",
  "cwd": "/absolute/project/directory",
  "python": "/absolute/path/to/python3",
  "launcher": "/absolute/path/to/fixed-launcher.py",
  "launcher_sha256": "<verified-64-lowercase-hex-digest>"
}
```

The cwd must equal the thread's resolved runtime cwd. The operator verifies the interpreter and
launcher provenance before registration. The fixed launcher owns project and credential-file
selection; it must not accept project overrides. Do not put credentials, headers or environment
values in this file. Unknown fields, mismatched identities, excessive size and launcher hash
changes fail the load. T3 reads the launcher to verify its hash but does not read its token or CA.

At start, resume, rollback-resume and fork, T3 passes the binding in that native request's config
under the reserved `t3-thread-harbor` MCP server name. The command is the configured Python with
exact arguments `-I -B <launcher>`. Only `task_get`, `context_get`, `memory_search` and `memory_get`
are enabled. Unbound threads explicitly disable that reserved server, including when resuming
old native state or forking a bound thread. Existing T3 MCP servers and other server names survive.
Other providers and clients gain no new configuration or transport surface.

To apply or remove a binding on an existing thread, first quiesce senders and check its complete
projection: all runs terminal, no queued messages or outbox commands, no open approvals, runtime
requests, dynamic tools, subagents, background commands or terminals. Treat unreadable state as
busy. The existing `provider-session.detach` command is not an atomic idle guard: its runtime
path can interrupt active turns. Never use it as a force-stop shortcut.

Only after those checks and an explicit switch authorization, dispatch once for the exact
thread and its actual provider session. Keep the original native reference and shared process
baseline. Wait for the exact native `thread/closed` or `status.notLoaded` event in that same
provider process before resuming the original thread. An ACK or detached projection is insufficient.
Check the installed version's grace period rather than assuming a fixed delay. No shared reload
or provider restart is part of this procedure.

Removing the binding file disables the reserved server on the next real native load, not during
an active turn. Actual tool discovery and read calls in the original T3 thread are the acceptance
gate; a launcher stdio test or source test alone does not establish native availability.
