import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as ThreadHarborBinding from "./ThreadHarborBinding.ts";

const testLayer = ThreadHarborBinding.layer.pipe(
  Layer.provideMerge(ServerConfig.layerTest("/workspace", { prefix: "t3-thread-harbor-test-" })),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
);

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stateDir } = yield* ServerConfig.ServerConfig;
  const digest = yield* Digest.Digest;
  const launcher = path.join(stateDir, "fixture-launcher.py");
  const content = new TextEncoder().encode("# fixture only; never executed\n");
  yield* fs.writeFile(launcher, content, { mode: 0o600 });
  const directory = path.join(stateDir, "thread-harbor");
  yield* fs.makeDirectory(directory);
  const configPath = path.join(directory, "thread-owner.json");
  const binding = {
    schema_version: 1,
    thread_id: "thread-owner",
    cwd: "/workspace",
    python: "/usr/bin/python3",
    launcher,
    launcher_sha256: Hex.encode(yield* digest.digest(Digest.sha256, content)),
  };
  yield* fs.writeFileString(configPath, JSON.stringify(binding), { mode: 0o600 });
  return { fs, configPath, binding, service: yield* ThreadHarborBinding.ThreadHarborBinding };
});

it.effect(
  "binds only the exact thread and cwd to four read tools without reading credentials",
  () =>
    Effect.gen(function* () {
      const { service, binding } = yield* fixture;
      assert.deepEqual(
        yield* service.read({ threadId: ThreadId.make("thread-owner"), cwd: "/workspace" }),
        {
          "mcp_servers.t3-thread-harbor": {
            enabled: true,
            command: "/usr/bin/python3",
            args: ["-I", "-B", binding.launcher],
            enabled_tools: ["task_get", "context_get", "memory_search", "memory_get"],
            startup_timeout_sec: 20,
            tool_timeout_sec: 30,
          },
        },
      );
      assert.deepEqual(
        yield* service.read({ threadId: ThreadId.make("other-thread"), cwd: "/workspace" }),
        {},
      );
      assert.deepEqual(yield* service.read({ threadId: null, cwd: "/workspace" }), {});
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect.each(["thread", "cwd", "hash", "extra", "permissions", "oversized", "symlink"] as const)(
  "fails closed for %s without returning broader MCP config",
  (invalid) =>
    Effect.gen(function* () {
      const { fs, configPath, binding, service } = yield* fixture;
      if (invalid === "thread") {
        yield* fs.writeFileString(
          configPath,
          JSON.stringify({ ...binding, thread_id: "other-thread" }),
        );
      } else if (invalid === "cwd") {
        yield* fs.writeFileString(configPath, JSON.stringify({ ...binding, cwd: "/other" }));
      } else if (invalid === "hash") {
        yield* fs.writeFileString(
          configPath,
          JSON.stringify({ ...binding, launcher_sha256: "0".repeat(64) }),
        );
      } else if (invalid === "extra") {
        yield* fs.writeFileString(
          configPath,
          JSON.stringify({ ...binding, env: { TOKEN: "forbidden-fixture" } }),
        );
      } else if (invalid === "permissions") {
        yield* fs.chmod(configPath, 0o644);
      } else if (invalid === "oversized") {
        yield* fs.writeFileString(configPath, " ".repeat(16_385));
      } else {
        yield* fs.remove(binding.launcher);
        yield* fs.symlink(configPath, binding.launcher);
      }
      const error = yield* Effect.flip(
        service.read({ threadId: ThreadId.make("thread-owner"), cwd: "/workspace" }),
      );
      assert.equal(error._tag, "ThreadHarborBindingError");
      assert.equal(error.message, "Invalid or unreadable Harbor binding for thread thread-owner.");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);
