"""Generate PNG app icons (stdlib only). Usage: python SDK/tools/make_icons.py
Draws the same bar-chart mark as icons/icon.svg. Overwrites icons/*.png.
"""
import pathlib
import struct
import zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
BG = (29, 78, 216)
WHITE = (255, 255, 255)
GREEN = (134, 239, 172)


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x < x1 and y0 <= y < y1):
        return False
    cx = min(max(x, x0 + r), x1 - r - 1)
    cy = min(max(y, y0 + r), y1 - r - 1)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, rounded):
    s = size / 512
    bars = [((104, 288, 176, 408), WHITE), ((220, 208, 292, 408), WHITE), ((336, 120, 408, 408), GREEN)]
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            px = (0, 0, 0, 0)
            if not rounded or in_round_rect(x, y, 0, 0, size, size, int(96 * s)):
                px = (*BG, 255)
                for (x0, y0, x1, y1), col in bars:
                    if in_round_rect(x, y, int(x0 * s), int(y0 * s), int(x1 * s), int(y1 * s), int(12 * s)):
                        px = (*col, 255)
            raw.extend(px)
    return bytes(raw)


def png(size, rounded=True):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(render(size, rounded), 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    # iOS applies its own mask, so the touch icon is full-bleed; Android "maskable" uses the 512 file.
    for name, size, rounded in [("icon-192.png", 192, True), ("icon-512.png", 512, False), ("icon-180.png", 180, False)]:
        (OUT / name).write_bytes(png(size, rounded))
        print("wrote", name)
