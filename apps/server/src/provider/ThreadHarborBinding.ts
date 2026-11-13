import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../config.ts";

const Binding = Schema.Struct({
  schema_version: Schema.Literal(1),
  thread_id: Schema.String,
  cwd: Schema.String,
  python: Schema.String,
  launcher: Schema.String,
  launcher_sha256: Schema.String,
});
const decodeBinding = Schema.decodeUnknownEffect(Schema.fromJsonString(Binding), {
  onExcessProperty: "error",
});

export class ThreadHarborBindingError extends Schema.TaggedError<ThreadHarborBindingError>()(
  "ThreadHarborBindingError",
  { threadId: Schema.String },
) {
  override get message() {
    return `Invalid or unreadable Harbor binding for thread ${this.threadId}.`;
  }
}

export class ThreadHarborBinding extends Context.Service<
  ThreadHarborBinding,
  {
    readonly read: (input: {
      readonly threadId: ThreadId | null;
      readonly cwd: string | undefined;
    }) => Effect.Effect<Readonly<Record<string, Schema.Json>>, ThreadHarborBindingError>;
  }
>()("t3/provider/ThreadHarborBinding") {}

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const digest = yield* Digest.Digest;
  const { stateDir } = yield* ServerConfig;

  return ThreadHarborBinding.of({
    read: Effect.fn("ThreadHarborBinding.read")(
      function* ({ threadId, cwd }) {
        if (threadId === null) return {};
        const directory = yield* fileSystem.lstat(path.join(stateDir, "thread-harbor")).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.succeed(null),
          ),
        );
        if (directory === null) return {};
        if (directory.type !== "Directory") {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,255}$/.test(threadId)) {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        const configPath = path.join(
          stateDir,
          "thread-harbor",
          `${encodeURIComponent(threadId)}.json`,
        );
        const info = yield* fileSystem.lstat(configPath).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.succeed(null),
          ),
        );
        if (info === null) return {};
        if (info.type !== "File" || Number(info.size) > 16_384 || (info.mode & 0o077) !== 0) {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        const binding = yield* decodeBinding(yield* fileSystem.readFileString(configPath));
        if (
          binding.thread_id !== threadId ||
          cwd === undefined ||
          binding.cwd !== cwd ||
          ![binding.cwd, binding.python, binding.launcher].every((value) =>
            path.isAbsolute(value),
          ) ||
          !/^[a-f0-9]{64}$/.test(binding.launcher_sha256)
        ) {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        const launcherInfo = yield* fileSystem.lstat(binding.launcher);
        if (launcherInfo.type !== "File" || Number(launcherInfo.size) > 262_144) {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        const hash = Hex.encode(
          yield* digest.digest(Digest.sha256, yield* fileSystem.readFile(binding.launcher)),
        );
        if (hash !== binding.launcher_sha256) {
          return yield* new ThreadHarborBindingError({ threadId });
        }
        return {
          "mcp_servers.t3-thread-harbor": {
            enabled: true,
            command: binding.python,
            args: ["-I", "-B", binding.launcher],
            enabled_tools: ["task_get", "context_get", "memory_search", "memory_get"],
            startup_timeout_sec: 20,
            tool_timeout_sec: 30,
          },
        };
      },
      (effect, input) =>
        effect.pipe(
          Effect.mapError(
            () => new ThreadHarborBindingError({ threadId: input.threadId ?? "unknown" }),
          ),
        ),
    ),
  });
});

export const layer = Layer.effect(ThreadHarborBinding, make);
