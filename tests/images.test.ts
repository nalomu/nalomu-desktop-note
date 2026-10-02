import { expect, it } from "vitest";
import { storedImageSource } from "../src/images";
it("recognizes owned attachment URLs across macOS and Windows and rejects arbitrary file paths", () => {
  const name = `${"a".repeat(64)}.png`;
  expect(storedImageSource(`note-image://${"localhost"}/${name}`)).toBe(
    `note-image:${name}`,
  );
  expect(storedImageSource(`http://note-image.localhost/${name}`)).toBe(
    `note-image:${name}`,
  );
  for (const src of [
    "file:///etc/passwd",
    "data:image/svg+xml,evil",
    "note-image:../../note.json",
    "http://example.com/a.png",
    "blob:random",
  ])
    expect(storedImageSource(src)).toBeNull();
});
