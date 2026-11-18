#!/usr/bin/env python3
"""Placeholder app icons for the web manifest: a cyclone eye (dot inside two rings) on the dashboard's dark
slate. Standard-library Python only, so it runs anywhere.

    python3 -I scripts/icons/make-icons.py public/icons

These are stand-ins so the app is installable. Replace them with the programme's own artwork (keep the file
names, 192 and 512 px, and keep the artwork inside the central 80% so the maskable one is not cropped).
"""
import math
import struct
import sys
import zlib
from pathlib import Path

BACKGROUND = (15, 23, 42)  # #0f172a
FOREGROUND = (34, 211, 238)  # #22d3ee
# (centre radius, half-width) as fractions of the icon, all inside the maskable safe zone (radius 0.4)
SHAPES = [(0.0, 0.085), (0.205, 0.028), (0.335, 0.028)]


def coverage(distance: float, centre: float, half: float, feather: float) -> float:
    edge = abs(distance - centre) - half
    return max(0.0, min(1.0, 0.5 - edge / feather))


def render(size: int) -> bytes:
    rows = []
    feather = 1.5 / size
    for y in range(size):
        row = bytearray([0])  # PNG filter type: none
        for x in range(size):
            d = math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5)
            a = max(coverage(d, c, h, feather) for c, h in SHAPES)
            row += bytes(round(b + (f - b) * a) for b, f in zip(BACKGROUND, FOREGROUND))
            row.append(255)
        rows.append(bytes(row))
    return b''.join(rows)


def png(size: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(render(size), 9)) + chunk(b'IEND', b'')


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'public/icons')
    out.mkdir(parents=True, exist_ok=True)
    for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('icon-maskable-512.png', 512)]:
        (out / name).write_bytes(png(size))
        print(name, size)


if __name__ == '__main__':
    main()
