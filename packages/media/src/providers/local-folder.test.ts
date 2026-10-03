import { mkdir, mkdtemp, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFolderProvider } from "./local-folder";

describe("LocalFolderProvider", () => {
  it("only opens folders inside MEDIA_IMPORT_ROOTS", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "roots-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "outside-"));
    await expect(LocalFolderProvider.create(outside, [root])).rejects.toThrow(/not inside/);
    await expect(LocalFolderProvider.create(root, [])).rejects.toThrow(/MEDIA_IMPORT_ROOTS/);
  });

  it("lists media incrementally and ignores non-media and escaping symlinks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "roots-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "outside-"));
    await mkdir(path.join(root, "2026"), { recursive: true });
    await writeFile(path.join(root, "2026", "a.jpg"), "a");
    await writeFile(path.join(root, "notes.txt"), "x");
    await writeFile(path.join(outside, "secret.jpg"), "s");
    await symlink(path.join(outside, "secret.jpg"), path.join(root, "link.jpg"));
    const old = new Date("2026-01-01T00:00:00Z");
    await utimes(path.join(root, "2026", "a.jpg"), old, old);

    const p = await LocalFolderProvider.create(root, [root]);
    const first = await p.listNew(null);
    expect(first.items.map((i) => i.externalId)).toEqual([path.join("2026", "a.jpg")]);
    expect((await p.read(first.items[0]!)).toString()).toBe("a");

    await writeFile(path.join(root, "b.mp4"), "b");
    const second = await p.listNew(first.nextCursor);
    expect(second.items.map((i) => i.externalId)).toEqual(["b.mp4"]);
    await expect(p.read({ externalId: "../" + path.basename(outside) + "/secret.jpg", filename: "secret.jpg" })).rejects.toThrow();
  });
});
