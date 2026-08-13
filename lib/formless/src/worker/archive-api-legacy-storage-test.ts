import worker, { FormlessAuthority } from "./index.ts";
import type { StorageSnapshot } from "@dpeek/formless-storage";
import { ensureStorageTables, restoreStorageSnapshotOutcome } from "./storage.ts";

export class ArchiveApiLegacyStorageTestAuthority extends FormlessAuthority {
  async fetch(request: Request) {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/_test/store-program-schema" && request.method === "POST") {
      ensureStorageTables(this.ctx.storage);
      const body = (await request.json()) as { schema: unknown };
      this.ctx.storage.sql.exec(
        "UPDATE app_schema SET schema_json = ? WHERE id = 1",
        JSON.stringify(body.schema),
      );

      return Response.json({ stored: true });
    }

    if (pathname === "/_test/restore-program-storage" && request.method === "POST") {
      ensureStorageTables(this.ctx.storage);
      const snapshot = (await request.json()) as StorageSnapshot;
      const outcome = restoreStorageSnapshotOutcome(this.ctx.storage, snapshot, {
        schema: snapshot.schema,
        schemaProvenance: {
          kind: "program",
          sourceSchemaHash:
            "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
      });

      return Response.json(outcome.response);
    }

    return super.fetch(request);
  }
}

export default worker;
