import { expect, it } from "vitest";
import { SaveQueue } from "../src/persistence";
it("serializes writes and drains newer edits before exit", async () => {
  const written: number[] = [];
  let release!: () => void;
  const q = new SaveQueue<number>(async (n) => {
    if (n === 1) await new Promise<void>((r) => (release = r));
    written.push(n);
  });
  q.set(1);
  const saving = q.flush();
  q.set(2);
  q.set(3);
  release();
  await saving;
  expect(written).toEqual([1, 3]);
});
it("retains failed data for retry", async () => {
  let fail = true;
  const written: number[] = [];
  const q = new SaveQueue<number>(async (n) => {
    if (fail) throw Error("disk full");
    written.push(n);
  });
  q.set(7);
  await expect(q.flush()).rejects.toThrow();
  fail = false;
  await q.flush();
  expect(written).toEqual([7]);
});
