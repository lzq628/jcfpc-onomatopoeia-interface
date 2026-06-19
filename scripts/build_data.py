from __future__ import annotations

import csv
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "outputs" / "research" / "onomatopoeia_search_v2.xlsx"
LEMMA_LIST = ROOT / "search" / "lemma.txt"
SURFACE_LIST = ROOT / "search" / "surface.txt"
KEITAI_CSV = APP_ROOT / "data" / "keitai.csv"
DATA_JS = APP_ROOT / "data" / "onomatopoeia_data.js"
FINAL_CSV = APP_ROOT / "data" / "final_results.csv"

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

PUBLIC_FIELDS = [
    "id",
    "candidate_no",
    "candidate_label",
    "keitai",
    "lemma_term",
    "surface_term",
    "match_source",
    "work_id",
    "title_ja",
    "title_zh",
    "token_ids",
    "sentence_id",
    "sentence_index",
    "kwic_left",
    "key",
    "kwic_right",
    "surface",
    "lemma",
    "lemma_reading",
    "lemma_id",
    "pos",
    "orth_base",
    "pronunciation",
    "goshu",
    "ja_sentence",
    "zh_translation",
    "align_type",
    "align_score",
    "review_note",
]


def parse_terms(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8-sig")
    return [term.strip() for term in raw.replace("\n", "|").split("|") if term.strip()]


def parse_keitai(path: Path) -> dict[int, str]:
    mapping: dict[int, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                number = int(row.get("順位", ""))
            except ValueError:
                continue
            mapping[number] = row.get("形態", "").strip()
    return mapping


def column_index(ref: str) -> int:
    match = re.match(r"([A-Z]+)", ref)
    if not match:
        raise ValueError(f"Bad cell reference: {ref}")
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def cell_value(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value = cell.find("main:v", NS)
        return shared[int(value.text)] if value is not None and value.text is not None else ""
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//main:t", NS))
    value = cell.find("main:v", NS)
    return value.text if value is not None and value.text is not None else ""


def read_xlsx(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared.append("".join(text.text or "" for text in item.findall(".//main:t", NS)))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        sheets: dict[str, list[dict[str, str]]] = {}
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            name = sheet.attrib["name"]
            target = relmap[sheet.attrib[REL_NS]]
            sheet_path = "xl/" + target if not target.startswith("/") else target[1:]
            root = ET.fromstring(archive.read(sheet_path))
            rows: list[list[str]] = []
            for row in root.findall("main:sheetData/main:row", NS):
                values: list[str] = []
                for cell in row.findall("main:c", NS):
                    index = column_index(cell.attrib["r"])
                    while len(values) <= index:
                        values.append("")
                    values[index] = cell_value(cell, shared)
                rows.append(values)
            if not rows:
                sheets[name] = []
                continue
            header = rows[0]
            sheets[name] = [
                {header[index]: row[index] if index < len(row) else "" for index in range(len(header))}
                for row in rows[1:]
            ]
        return sheets


def norm_mark(row: dict[str, str]) -> str:
    return row.get("mark", "").strip().lower()


def row_int(row: dict[str, str], field: str, default: int = 0) -> int:
    value = row.get(field, "")
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def row_float(row: dict[str, str], field: str) -> float | None:
    value = row.get(field, "")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def split_terms(value: str) -> list[str]:
    return [term.strip() for term in value.split("|") if term.strip()]


def repeated_su_key(sentence: str) -> str | None:
    match = re.search(r"((?:す、){1,}す)(?=、?(?:と|という))", sentence)
    return match.group(1) if match else None


def candidate_label(lemma: str, surface: str) -> str:
    return surface if lemma == surface else f"{surface} / {lemma}"


def make_candidates(
    lemma_terms: list[str],
    surface_terms: list[str],
    keitai_map: dict[int, str],
) -> list[dict[str, object]]:
    candidates = []
    for index, (lemma, surface) in enumerate(zip(lemma_terms, surface_terms), start=1):
        candidates.append(
            {
                "no": index,
                "lemma": lemma,
                "surface": surface,
                "keitai": keitai_map.get(index, ""),
                "label": candidate_label(lemma, surface),
                "variants": sorted({lemma, surface}),
            }
        )
    return candidates


def candidate_lookup(candidates: list[dict[str, object]]) -> dict[str, list[int]]:
    lookup: dict[str, list[int]] = defaultdict(list)
    for candidate in candidates:
        no = int(candidate["no"])
        for term in candidate["variants"]:
            lookup[str(term)].append(no)
    return lookup


def candidate_numbers(row: dict[str, str], lookup: dict[str, list[int]]) -> list[int]:
    numbers: list[int] = []
    for field in ("lemma検索語", "surface検索語"):
        for term in split_terms(row.get(field, "")):
            for number in lookup.get(term, []):
                if number not in numbers:
                    numbers.append(number)
    return sorted(numbers)


def base_public_row(
    row: dict[str, str],
    *,
    match_source: str,
    candidates: list[dict[str, object]],
    lookup: dict[str, list[int]],
    grouped_rows: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    grouped_rows = grouped_rows or [row]
    numbers = candidate_numbers(row, lookup)
    first_number = numbers[0] if numbers else 0
    candidate = candidates[first_number - 1] if first_number else {"label": "", "lemma": "", "surface": ""}
    token_ids = [str(row_int(item, "連番")) for item in grouped_rows]
    surfaces = [item.get("キー", "") for item in grouped_rows if item.get("キー", "")]
    key = row.get("キー", "")
    if len(grouped_rows) > 1:
        key = repeated_su_key(row.get("日文文", "")) or "、".join(surfaces)
    review_note = ""
    if match_source == "review_merged":
        review_note = f"manual review: merged {len(grouped_rows)} token hits in one sentence"

    return {
        "id": f"{match_source}-{row.get('作品ID', '')}-{row.get('文ID', '')}-{'-'.join(token_ids)}",
        "candidate_no": first_number,
        "candidate_label": candidate["label"],
        "keitai": candidate.get("keitai", ""),
        "lemma_term": candidate["lemma"],
        "surface_term": candidate["surface"],
        "match_source": match_source,
        "work_id": row.get("作品ID", ""),
        "title_ja": row.get("書名", ""),
        "title_zh": row.get("中文書名", ""),
        "token_ids": ";".join(token_ids),
        "sentence_id": row.get("文ID", ""),
        "sentence_index": row.get("文番号", ""),
        "kwic_left": row.get("前文脈", ""),
        "key": key,
        "kwic_right": grouped_rows[-1].get("後文脈", ""),
        "surface": key if len(grouped_rows) > 1 else row.get("原文文字列", ""),
        "lemma": row.get("語彙素", ""),
        "lemma_reading": row.get("語彙素読み", ""),
        "lemma_id": row.get("語彙素 ID", ""),
        "pos": row.get("品詞", ""),
        "orth_base": row.get("書字形", ""),
        "pronunciation": row.get("発音形出現形", ""),
        "goshu": row.get("語種", ""),
        "ja_sentence": row.get("日文文", ""),
        "zh_translation": row.get("中文対訳_Patched Candidate", ""),
        "align_type": row.get("対訳タイプ_Patched Candidate", ""),
        "align_score": row_float(row, "対訳スコア_Patched Candidate"),
        "review_note": review_note,
    }


def final_rows(sheets: dict[str, list[dict[str, str]]], candidates: list[dict[str, object]]) -> tuple[list[dict[str, object]], dict[str, object]]:
    lookup = candidate_lookup(candidates)
    audit: dict[str, object] = {
        "input_rows": {},
        "marks": {},
        "deleted_rows": 0,
        "review_rows": 0,
        "review_groups": 0,
    }
    results: list[dict[str, object]] = []

    for sheet_name in ("both", "surface_only"):
        rows = sheets.get(sheet_name, [])
        audit["input_rows"][sheet_name] = len(rows)
        marks = Counter(norm_mark(row) for row in rows)
        audit["marks"][sheet_name] = dict(marks)
        for row in rows:
            if norm_mark(row) == "delete":
                audit["deleted_rows"] = int(audit["deleted_rows"]) + 1
                continue
            results.append(
                base_public_row(
                    row,
                    match_source=sheet_name,
                    candidates=candidates,
                    lookup=lookup,
                )
            )

    lemma_rows = sheets.get("lemma_only", [])
    audit["input_rows"]["lemma_only"] = len(lemma_rows)
    lemma_marks = Counter(norm_mark(row) for row in lemma_rows)
    audit["marks"]["lemma_only"] = dict(lemma_marks)
    review_groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in lemma_rows:
        mark = norm_mark(row)
        if mark == "delete":
            audit["deleted_rows"] = int(audit["deleted_rows"]) + 1
            continue
        if mark == "review":
            audit["review_rows"] = int(audit["review_rows"]) + 1
            key = (row.get("作品ID", ""), row.get("文ID", ""), row.get("語彙素", ""))
            review_groups[key].append(row)
            continue
        results.append(
            base_public_row(
                row,
                match_source="lemma_only",
                candidates=candidates,
                lookup=lookup,
            )
        )

    for rows in review_groups.values():
        rows = sorted(rows, key=lambda item: row_int(item, "連番"))
        results.append(
            base_public_row(
                rows[0],
                match_source="review_merged",
                candidates=candidates,
                lookup=lookup,
                grouped_rows=rows,
            )
        )
    audit["review_groups"] = len(review_groups)

    results.sort(
        key=lambda row: (
            int(row["candidate_no"]),
            str(row["work_id"]),
            int(float(row["sentence_index"] or 0)),
            int(str(row["token_ids"]).split(";")[0]),
        )
    )
    return results, audit


def enrich_candidates(candidates: list[dict[str, object]], results: list[dict[str, object]]) -> None:
    by_candidate: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in results:
        by_candidate[int(row["candidate_no"])].append(row)
    for candidate in candidates:
        no = int(candidate["no"])
        rows = by_candidate.get(no, [])
        by_book = Counter(row["work_id"] for row in rows)
        by_source = Counter(row["match_source"] for row in rows)
        surfaces = Counter(row["surface"] for row in rows if row["surface"])
        candidate["count"] = len(rows)
        candidate["by_book"] = dict(sorted(by_book.items()))
        candidate["by_source"] = dict(sorted(by_source.items()))
        candidate["top_surfaces"] = [
            {"surface": surface, "count": count} for surface, count in surfaces.most_common(8)
        ]


def write_outputs(candidates: list[dict[str, object]], results: list[dict[str, object]], audit: dict[str, object]) -> None:
    APP_ROOT.joinpath("data").mkdir(parents=True, exist_ok=True)
    books = []
    seen_books = set()
    for row in results:
        work_id = row["work_id"]
        if work_id in seen_books:
            continue
        seen_books.add(work_id)
        books.append({"work_id": work_id, "title_ja": row["title_ja"], "title_zh": row["title_zh"]})

    payload = {
        "meta": {
            "title": "日中小説オノマトペ対訳コーパス",
            "generated": date.today().isoformat(),
            "source_workbook": str(WORKBOOK.relative_to(ROOT)),
            "candidate_count": len(candidates),
            "result_count": len(results),
            "note": "Final public dataset generated from manually reviewed v2 workbook; rows marked delete are excluded.",
        },
        "audit": audit,
        "books": books,
        "candidates": candidates,
        "keitai": [
            {
                "keitai": form,
                "candidate_count": sum(1 for item in candidates if item.get("keitai") == form),
                "result_count": sum(int(item.get("count", 0)) for item in candidates if item.get("keitai") == form),
            }
            for form in sorted({str(item.get("keitai", "")) for item in candidates if item.get("keitai")})
        ],
        "results": results,
    }
    DATA_JS.write_text(
        "window.ONOMATOPOEIA_CORPUS = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    with FINAL_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=PUBLIC_FIELDS, lineterminator="\n")
        writer.writeheader()
        for row in results:
            writer.writerow({field: row.get(field, "") for field in PUBLIC_FIELDS})


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    lemma_terms = parse_terms(LEMMA_LIST)
    surface_terms = parse_terms(SURFACE_LIST)
    keitai_map = parse_keitai(KEITAI_CSV)
    candidates = make_candidates(lemma_terms, surface_terms, keitai_map)
    sheets = read_xlsx(WORKBOOK)
    results, audit = final_rows(sheets, candidates)
    enrich_candidates(candidates, results)
    write_outputs(candidates, results, audit)
    print(f"candidates: {len(candidates)}")
    print(f"results: {len(results)}")
    print(f"deleted rows: {audit['deleted_rows']}")
    print(f"review rows: {audit['review_rows']} -> groups: {audit['review_groups']}")
    print(f"wrote: {DATA_JS.relative_to(ROOT)}")
    print(f"wrote: {FINAL_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
