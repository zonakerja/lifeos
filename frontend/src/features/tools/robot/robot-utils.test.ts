import { describe, expect, it } from "vitest";
import { keyToInput, parseHosts, toViewportPoint } from "./robot-utils";

const key = (
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("browser jarak jauh", () => {
  it("toViewportPoint memetakan ukuran tampil ke 1280×800", () => {
    expect(toViewportPoint(320, 200, 640, 400)).toEqual({ x: 640, y: 400 });
    expect(toViewportPoint(700, -5, 640, 400)).toEqual({ x: 1280, y: 0 });
    expect(toViewportPoint(1, 1, 0, 400)).toBeNull();
  });

  it("keyToInput: huruf = teks, tombol khusus = key, pintasan browser diabaikan", () => {
    expect(keyToInput(key("a"))).toEqual({ type: "type", text: "a" });
    expect(keyToInput(key("Enter"))).toEqual({ type: "key", key: "Enter" });
    expect(keyToInput(key(" "))).toEqual({ type: "key", key: "Space" });
    expect(keyToInput(key("Tab", { shiftKey: true }))).toEqual({ type: "key", key: "Shift+Tab" });
    expect(keyToInput(key("a", { ctrlKey: true }))).toEqual({ type: "key", key: "Control+a" });
    expect(keyToInput(key("w", { ctrlKey: true }))).toBeNull();
    expect(keyToInput(key("F12"))).toBeNull();
    expect(keyToInput(key("Shift"))).toBeNull();
  });

  it("parseHosts", () => {
    expect(parseHosts("sso.a.go.id, b.go.id\nc.go.id ")).toEqual(["sso.a.go.id", "b.go.id", "c.go.id"]);
  });
});
