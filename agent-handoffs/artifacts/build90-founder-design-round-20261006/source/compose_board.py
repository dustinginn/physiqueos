"""Compose one Build 90 review board from raw simulator captures.

Usage: python compose_board.py board.json
board.json: {"out": "...png", "title": "...", "subtitle": "...", "scale": 0.4,
             "rows": [{"label": "...", "cells": [{"file": "...png", "caption": "...", "note": "..."}]}]}
Captures are only scaled and labeled; pixels are never edited.
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/SFNS.ttf"
BG = (6, 16, 25)
INK = (243, 248, 250)
MUTED = (146, 165, 175)
ACCENT = (85, 227, 154)
PANEL = (15, 28, 42)


def font(size, weight=600):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([100, min(max(size, 17), 96), 400, weight])
    except Exception:
        pass
    return f


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split():
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def main(path):
    spec = json.load(open(path))
    scale = spec.get("scale", 0.4)
    margin, gap, row_gap = 36, 22, 30
    title_f, sub_f, row_f, cap_f, note_f = font(34, 760), font(17, 480), font(19, 700), font(18, 760), font(14, 480)
    rows = []
    for row in spec["rows"]:
        cells = []
        for cell in row["cells"]:
            image = Image.open(cell["file"]).convert("RGB")
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
            cells.append((cell, image))
        rows.append((row, cells))
    width = max(margin * 2 + sum(i.width for _, i in cells) + gap * (len(cells) - 1) for _, cells in rows)
    width = max(width, spec.get("min_width", 900))
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    sub_lines = wrap(probe, spec.get("subtitle", ""), sub_f, width - margin * 2)
    height = margin + 44 + len(sub_lines) * 24 + 18
    layout = []
    for row, cells in rows:
        note_lines = max((len(wrap(probe, c.get("note", ""), note_f, i.width)) for c, i in cells), default=0)
        cell_h = 30 + note_lines * 19 + 8 + max(i.height for _, i in cells)
        layout.append((row, cells, note_lines, height))
        height += (30 if row.get("label") else 0) + cell_h + row_gap
    height += margin - row_gap
    board = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(board)
    draw.text((margin, margin), spec["title"], font=title_f, fill=INK)
    y = margin + 48
    for line in sub_lines:
        draw.text((margin, y), line, font=sub_f, fill=MUTED)
        y += 24
    for row, cells, note_lines, top in layout:
        y = top
        if row.get("label"):
            draw.text((margin, y), row["label"], font=row_f, fill=ACCENT)
            y += 30
        x = margin
        for cell, image in cells:
            draw.text((x, y), cell.get("caption", ""), font=cap_f, fill=INK)
            ny = y + 28
            for line in wrap(draw, cell.get("note", ""), note_f, image.width):
                draw.text((x, ny), line, font=note_f, fill=MUTED)
                ny += 19
            iy = y + 30 + note_lines * 19 + 8
            draw.rounded_rectangle((x - 2, iy - 2, x + image.width + 1, iy + image.height + 1), radius=6, outline=PANEL, width=2)
            board.paste(image, (x, iy))
            x += image.width + gap
    board.save(spec["out"], optimize=True)
    print(spec["out"], board.size)


if __name__ == "__main__":
    main(sys.argv[1])
