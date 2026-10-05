#!/usr/bin/env python3
"""Importuje bazę młynków z arkusza XLSX do public/grinders.json i supabase/seed.sql.

Użycie: python3 scripts/import_xlsx.py [ścieżka.xlsx]

Zasady:
- zakres µm: najpierw kolumny HCG (N–O), potem zakres producenta (I–J);
- liczba pozycji: kolumna G (łączna liczba kroków), chyba że SCALES niżej mówi inaczej;
- µm/klik (przesunięcie żaren) jest zapisywane tylko informacyjnie i NIE służy do przeliczeń.
"""
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts" / "mlynki_do_kawy_baza.xlsx"

# Typ skali dla każdego wiersza arkusza (klucz = Lp).
# clicks:       liczba klików od zera
# dial:         numer na pokrętle (start, step), opcjonalnie reversed
# rot_num_tick: 1Zpresso "obrót.numer.kreska" (perRotation, ticksPerNumber)
# rot_clicks:   KINGrinder "obroty.kliki" (perRotation)
# num_sub:      numer + podpozycja, np. Fellow 1.1 / 1.2 (sub = liczba kroków na numer)
# macro_micro:  Baratza "5E" (micro = liczba liter)
# continuous:   skala bezstopniowa z oznaczeniami (from–to)
# unknown:      brak danych o skali
SCALES = {
    1: {"type": "clicks", "start": 0},
    2: {"type": "rot_num_tick", "perRotation": 100, "ticksPerNumber": 10},
    3: {"type": "rot_num_tick", "perRotation": 90, "ticksPerNumber": 10},
    4: {"type": "rot_num_tick", "perRotation": 40, "ticksPerNumber": 4},
    5: {"type": "rot_num_tick", "perRotation": 40, "ticksPerNumber": 4},
    6: {"type": "clicks", "start": 0},
    7: {"type": "rot_num_tick", "perRotation": 100, "ticksPerNumber": 10},
    8: {"type": "rot_num_tick", "perRotation": 90, "ticksPerNumber": 10},
    9: {"type": "rot_num_tick", "perRotation": 30, "ticksPerNumber": 3},
    10: {"type": "rot_num_tick", "perRotation": 30, "ticksPerNumber": 3},
    11: {"type": "clicks", "start": 0},
    12: {"type": "continuous", "from": 0, "to": 4, "decimals": 1},
    13: {"type": "rot_clicks", "perRotation": 60},
    14: {"type": "clicks", "start": 0},
    15: {"type": "clicks", "start": 0},
    16: {"type": "clicks", "start": 0},
    17: {"type": "clicks", "start": 0},
    18: {"type": "rot_num_tick", "perRotation": 30, "ticksPerNumber": 3},
    19: {"type": "clicks", "start": 0},
    20: {"type": "clicks", "start": 0},
    21: {"type": "clicks", "start": 0},
    22: {"type": "clicks", "start": 0},
    23: {"type": "clicks", "start": 0},
    24: {"type": "clicks", "start": 0},
    25: {"type": "continuous", "from": 0, "to": 8.5, "decimals": 1},
    26: {"type": "clicks", "start": 0},
    27: {"type": "dial", "start": 0, "step": 1},
    28: {"type": "dial", "start": 1, "step": 1},
    29: {"type": "dial", "start": 1, "step": 1},
    30: {"type": "macro_micro", "macroStart": 1, "micro": 9},
    31: {"type": "dial", "start": 1, "step": 1},
    32: {"type": "macro_micro", "macroStart": 1, "micro": 23},
    33: {"type": "macro_micro", "macroStart": 1, "micro": 26},
    34: {"type": "dial", "start": 1, "step": 1},
    35: {"type": "dial", "start": 1, "step": 1},
    36: {"type": "num_sub", "start": 1, "sub": 3},
    37: {"type": "num_sub", "start": 1, "sub": 4},
    38: {"type": "dial", "start": 1, "step": 0.5},
    39: {"type": "dial", "start": 1, "step": 1, "reversed": True},
    40: {"type": "dial", "start": 1, "step": 1},
    41: {"type": "clicks", "start": 0},
    42: {"type": "unknown"},
    43: {"type": "unknown"},
    44: {"type": "unknown"},
    45: {"type": "unknown"},
    46: {"type": "unknown"},
    47: {"type": "continuous", "from": 1, "to": 11, "decimals": 1},
    48: {"type": "unknown"},
    49: {"type": "dial", "start": 1, "step": 1},
    50: {"type": "dial", "start": 1, "step": 1},
}

# Korekty liczby pozycji tam, gdzie wynika ona wprost z opisu skali w arkuszu.
POSITIONS_OVERRIDE = {
    8: (162, "Liczba pozycji wyliczona: 90 klików/obrót × ok. 1,8 obrotu skali (przybliżenie)."),
    27: (41, "Pokrętło 0–40 = 41 pozycji."),
    38: (29, "15 ustawień z półkrokami = 29 pozycji (1; 1,5; 2 … 15)."),
}

# Pewność obniżona, gdy przeliczenie opiera się na przybliżeniu.
CONFIDENCE_OVERRIDE = {8: "C"}


def slug(*parts: str) -> str:
    s = " ".join(parts)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def num(v):
    if v is None or v == "":
        return None
    return float(v) if isinstance(v, float) and not v.is_integer() else int(v)


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["Młynki"]
    out = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        (lp, brand, model, kind, adjustment, per_rot, steps, um_click, rmin, rmax,
         _um_calc, conf, notes, hmin, hmax, scale_fmt, _um_hcg) = row[:17]
        lp = int(lp)

        if hmin is not None and hmax is not None:
            range_min, range_max, range_src = num(hmin), num(hmax), "honestcoffeeguide.com"
        elif rmin is not None and rmax is not None:
            range_min, range_max, range_src = num(rmin), num(rmax), "producent / recenzje"
        else:
            range_min = range_max = range_src = None

        positions = num(steps)
        extra = []
        if lp in POSITIONS_OVERRIDE:
            positions, why = POSITIONS_OVERRIDE[lp]
            extra.append(why)
        scale = SCALES[lp]
        if scale["type"] in ("continuous", "unknown"):
            positions = None

        out.append({
            "id": slug(brand, model),
            "brand": brand,
            "model": model,
            "kind": "manual" if kind == "ręczny" else "electric",
            "adjustment": adjustment,
            "range_min": range_min,
            "range_max": range_max,
            "range_source": range_src,
            "positions": positions,
            "clicks_per_rotation": num(per_rot),
            "um_per_click": num(um_click),
            "scale": scale,
            "scale_note": scale_fmt,
            "confidence": CONFIDENCE_OVERRIDE.get(lp, conf),
            "notes": " ".join([notes or ""] + extra).strip(),
            "updated_at": date.today().isoformat(),
        })

    (ROOT / "public" / "grinders.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    def sql(v):
        if v is None:
            return "null"
        if isinstance(v, (int, float)):
            return str(v)
        if isinstance(v, dict):
            return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
        return "'" + str(v).replace("'", "''") + "'"

    cols = ["id", "brand", "model", "kind", "adjustment", "range_min", "range_max",
            "range_source", "positions", "clicks_per_rotation", "um_per_click", "scale",
            "scale_note", "confidence", "notes"]
    lines = ["-- Wygenerowane przez scripts/import_xlsx.py", f"insert into public.grinders ({', '.join(cols)}) values"]
    lines.append(",\n".join("(" + ", ".join(sql(g[c]) for c in cols) + ")" for g in out))
    lines.append("on conflict (id) do nothing;")
    (ROOT / "supabase" / "seed.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")

    usable = sum(1 for g in out if g["range_min"] is not None and (g["positions"] or g["scale"]["type"] == "continuous"))
    print(f"Zapisano {len(out)} młynków, {usable} z kompletem danych do przeliczeń.")


if __name__ == "__main__":
    main()
