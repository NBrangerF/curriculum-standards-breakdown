#!/usr/bin/env python3
"""Extract conservative textbook structure from the verified X9 PDF library.

Only headings found on body pages and page-number sequences with repeated evidence
are approved automatically. Table-of-contents-only discoveries remain candidates.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import shutil
import statistics
import subprocess
import tempfile
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pypdf import PdfReader


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LIBRARY_ROOT = Path('/Volumes/X9 Pro/kebiao-library')
CURRENT_PATH = PROJECT_ROOT / 'data/textbooks/library-state/CURRENT.json'
OUTPUT_ROOT = PROJECT_ROOT / 'data/textbooks/derived/by-edition'

PILOT_KEYS = {
    ('math', 7, '上册'), ('math', 8, '上册'), ('math', 9, '上册'),
    ('chinese', 7, '上册'), ('chinese', 8, '上册'), ('chinese', 9, '上册'),
    ('english', 7, '上册'), ('english', 8, '上册'),
    ('physics', 8, '上册'), ('physics', 9, '全一册'),
    ('history', 7, '上册'), ('chemistry', 9, '上册'),
}

CHINESE_NUMBER = '一二三四五六七八九十百'
HEADING_PATTERNS = [
    ('unit', 1, re.compile(rf'^(?:第[{CHINESE_NUMBER}0-9]+单元)(?:\s+(.{{1,36}}))?$')),
    ('chapter', 1, re.compile(rf'^(第[{CHINESE_NUMBER}0-9]+章(?:\s*.{{1,42}})?)$')),
    ('chapter', 1, re.compile(rf'^(第[{CHINESE_NUMBER}0-9]+课(?:\s*.{{1,42}})?)$')),
    ('section', 2, re.compile(r'^(第\s*[0-9]+节(?:\s*.{1,42})?)$')),
    ('section', 2, re.compile(r'^([0-9]+(?:\.[0-9]+){1,2}\s*.{1,50})$')),
    ('unit', 1, re.compile(r'^(STARTER\s+UNIT\s+[0-9]+|UNIT\s+[0-9]+)(?:\s+(.{1,48}))?$', re.I)),
    ('part', 1, re.compile(r'^(Module\s+[0-9]+)(?:\s+(.{1,48}))?$', re.I)),
]
TOC_LINE_PATTERN = re.compile(
    rf'((?:第[{CHINESE_NUMBER}0-9]+[章单元课]|第\s*[0-9]+节|[0-9]+(?:\.[0-9]+){{1,2}}|(?:STARTER\s+)?UNIT\s+[0-9]+)\s*.{{0,62}}?)\s+([SIVX]*[0-9]+)\s*$',
    re.I,
)
OCR_NUMBERED_MARKER = re.compile(
    r'(?<!\d)([1-9]\d?)\s*(?:[.．、]\s*|(?=[A-Za-z\u3400-\u9fff]))'
)
OCR_TRAILING_PAGE = re.compile(r'\s+([0-9]{1,3})\s*[，,。．.]?\s*$')
OCR_COLOPHON_PATTERN = re.compile(
    r'(?:ISBN|CIP|邮编|印张|印刷|出版|定价|责任编辑|号院|号楼|月第|版\s*[”"“]?\s*20\d{2}年)',
    re.I,
)
OCR_BODY_SENTENCE_PATTERN = re.compile(r'(?:是多少|是多(?:少)?|可以帮助你|体积为|^不是)')
OCR_TITLE_CORRECTIONS = {
    '添百人像': '添画人像',
    '弹筑测力计': '弹簧测力计',
    '人金属的物理性质': '金属的物理性质',
    '旅行困的标志和旗帜': '旅行团的标志和旗帜',
    '如何欣赏雕塑作品挺修)': '如何欣赏雕塑作品（选修）',
    '如何欣赏书法作品斤修)': '如何欣赏书法作品（选修）',
    '网的作用': '风的作用',
    '语文国地八': '语文园地八',
    '坐并观天': '坐井观天',
    '我要的是戎斯': '我要的是葫芦',
    '三次根式的乘除': '二次根式的乘除',
    '三次根式的加减': '二次根式的加减',
    '义股定理的逆定理': '勾股定理的逆定理',
    '出过了': '出壳了',
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def stable_id(prefix: str, *parts: Any) -> str:
    digest = hashlib.sha256(':'.join(str(part) for part in parts).encode('utf-8')).hexdigest()[:16]
    return f'{prefix}_{digest}'


def normalize_text(value: str) -> str:
    value = unicodedata.normalize('NFKC', value or '').replace('\x00', '')
    value = re.sub(r'[\u2000-\u200f\u2028-\u202f\u2060\ufeff]', ' ', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def clean_heading(value: str) -> str:
    value = normalize_text(value)
    value = re.sub(r'^(?:\d+\s+)?(?:阅读|目录)\s*', '', value)
    if re.match(rf'^第[{CHINESE_NUMBER}0-9]+[章单元课]', value):
        value = re.sub(r'\s+[0-9]{1,3}$', '', value)
    return value.strip(' ·•_|')


def page_lines(page: Any) -> list[str]:
    text = (page.extract_text() or '').replace('\x00', '')
    return [normalize_text(line) for line in text.splitlines() if normalize_text(line)]


def looks_like_toc(lines: list[str], continuation: bool = False) -> bool:
    head = ' '.join(lines[:12])
    heading_hits = sum(1 for line in lines if TOC_LINE_PATTERN.search(line))
    structural_hits = sum(
        1 for line in lines
        if re.search(rf'(?:第[{CHINESE_NUMBER}0-9]+[章单元课]|第\s*[0-9]+节|[0-9]\s*\.\s*[0-9])', line)
    )
    compact_head = re.sub(r'\s+', '', head)
    direct = ('目录' in compact_head and max(heading_hits, structural_hits) >= 2) or ('Units Topics Functions' in head)
    return direct or (continuation and max(heading_hits, structural_hits) >= 2)


def printed_page_candidate(lines: list[str]) -> str | None:
    candidates = lines[:3] + lines[-4:]
    for line in candidates:
        compact = line.strip()
        if re.fullmatch(r'[0-9]{1,3}', compact):
            return compact
        match = re.match(r'^([0-9]{1,3})\s+(?:[^0-9].*)$', compact)
        if match:
            return match.group(1)
        match = re.search(r'(?:^|\s)(S[0-9]{1,3}|[IVX]{1,6})$', compact, re.I)
        if match:
            return match.group(1).upper()
    return None


def infer_numeric_offset(candidates: list[tuple[int, str]]) -> tuple[int | None, float, int]:
    numeric = [(pdf_page, int(label)) for pdf_page, label in candidates if label.isdigit() and 0 < int(label) < 500]
    if not numeric:
        return None, 0.0, 0
    offsets = Counter(pdf_page - printed for pdf_page, printed in numeric)
    offset, count = offsets.most_common(1)[0]
    supporting_pages = sorted(pdf for pdf, printed in numeric if pdf - printed == offset)
    longest_run = 0
    current_run = 0
    previous = None
    for pdf_page in supporting_pages:
        current_run = current_run + 1 if previous is not None and pdf_page == previous + 1 else 1
        longest_run = max(longest_run, current_run)
        previous = pdf_page
    confidence = min(0.99, 0.78 + min(count, 20) * 0.008 + min(longest_run, 8) * 0.012)
    if count < 6 or longest_run < 3 or offset < 0 or offset > 40:
        return None, confidence, count
    return offset, confidence, count


def heading_from_lines(lines: list[str]) -> tuple[str, int, str] | None:
    for raw in lines[:18]:
        line = clean_heading(raw)
        line = re.sub(r'\s*\.\s*', '.', line)
        if not line or len(line) > 72 or '目录' in line:
            continue
        for kind, level, pattern in HEADING_PATTERNS:
            match = pattern.match(line)
            if not match:
                continue
            title = clean_heading(' '.join(group for group in match.groups() if group) or match.group(0))
            if len(title) < 2:
                continue
            content = re.sub(r'^(?:第[^\s]+章|第\s*[0-9]+节|[0-9]+(?:\.[0-9]+){1,2})\s*', '', title)
            if kind == 'section' and not re.match(r'[A-Za-z\u3400-\u9fff]', content):
                continue
            return kind, level, title
    return None


def heading_identity(kind: str, title: str, parent_key: str | None) -> str:
    compact = re.sub(r'\s+', '', title).lower()
    if kind == 'unit':
        match = re.match(r'((?:starter)?unit[0-9]+|第[一-鿿0-9]+单元)', compact, re.I)
        if match:
            return match.group(1).lower()
    if kind == 'chapter':
        match = re.match(r'(第[一-鿿0-9]+[章课])', compact)
        if match:
            return match.group(1)
    if kind == 'section':
        match = re.match(r'(第[0-9]+节|[0-9]+(?:\.[0-9]+){1,2})', compact)
        if match:
            return f'{parent_key or "root"}:{match.group(1)}'
    return f'{parent_key or "root"}:{compact}'


def chapter_number(parent_key: str | None) -> int | None:
    if not parent_key:
        return None
    match = re.search(r'第([0-9]+)章', parent_key)
    if match:
        return int(match.group(1))
    match = re.search(rf'第([{CHINESE_NUMBER}]+)章', parent_key)
    if not match:
        return None
    simple = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
    return simple.get(match.group(1))


def toc_candidates(toc_pages: list[tuple[int, list[str]]], edition_id: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for _, lines in toc_pages:
        joined = '\n'.join(lines)
        for line in joined.splitlines():
            canonical = re.sub(r'\s*\.\s*', '.', line)
            canonical = re.sub(r'(?<=\d)\s+(?=\d)', '', canonical)
            match = TOC_LINE_PATTERN.search(canonical)
            if not match:
                continue
            title = clean_heading(match.group(1))
            printed = normalize_text(match.group(2))
            kind = 'other'
            level = 2
            if '单元' in title or re.match(r'^(?:STARTER\s+)?UNIT', title, re.I):
                kind, level = 'unit', 1
            elif '章' in title or '课' in title and title.startswith('第'):
                kind, level = 'chapter', 1
            elif '节' in title or re.match(r'^[0-9]+\.', title):
                kind, level = 'section', 2
            if kind == 'section':
                content = re.sub(r'^(?:第\s*[0-9]+节|[0-9]+(?:\.[0-9]+){1,2})\s*', '', title)
                if not re.match(r'[A-Za-z\u3400-\u9fff]', content):
                    continue
            key = (title, printed)
            if key in seen:
                continue
            seen.add(key)
            results.append({
                'entry_id': stable_id('tcu', edition_id, title, printed),
                'parent_id': None,
                'level': level,
                'kind': kind,
                'title': title,
                'printed_page': printed,
                'pdf_page': None,
                'end_pdf_page': None,
                'confidence': 0.62,
                'review_status': 'machine_checked',
                'source': 'toc_text',
            })
    return results


def readable_ocr_title(value: str) -> bool:
    value = clean_heading(value)
    if len(value) < 2 or len(value) > 64:
        return False
    if value in {'目录', '前言', '后记', '附录'}:
        return False
    han_count = len(re.findall(r'[\u3400-\u9fff]', value))
    if han_count and han_count < 2:
        return False
    if not han_count and not re.search(r'[A-Za-z]{3,}', value):
        return False
    return True


def numbered_ocr_segments(line: str) -> list[tuple[str, str | None]]:
    """Return explicit numbered lesson titles from one OCR line.

    Multi-column textbook TOCs are often flattened into one line. Splitting on
    explicit ``1.``/``2、`` markers is conservative and avoids treating body
    question numbering as structure unless the containing page is TOC-like.
    """
    normalized = normalize_text(line)
    markers = list(OCR_NUMBERED_MARKER.finditer(normalized))
    results: list[tuple[str, str | None]] = []
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(normalized)
        segment = normalized[marker.end():end].strip(' ·•_|-')
        page_match = OCR_TRAILING_PAGE.search(segment)
        printed = page_match.group(1) if page_match else None
        if page_match:
            segment = segment[:page_match.start()].strip()
        title = clean_heading(segment)
        title = re.sub(r'\s*(?:p{2,}|e{2,}|\.{2,}|…+)\s*$', '', title, flags=re.I).strip()
        if readable_ocr_title(title):
            results.append((title, printed))
    return results


def sanitize_ocr_title(value: str, allow_english: bool) -> str | None:
    title = clean_heading(value)
    if OCR_COLOPHON_PATTERN.search(title) or OCR_BODY_SENTENCE_PATTERN.search(title):
        return None
    if '?' in title or '？' in title:
        return None
    han_count = len(re.findall(r'[\u3400-\u9fff]', title))
    if not allow_english and han_count < 2:
        return None
    if han_count:
        title = re.sub(r'^[^\u3400-\u9fff]{2,}(?=[\u3400-\u9fff])', '', title).strip()
        title = re.sub(r'\s+[A-Za-z][A-Za-z0-9]{1,}\s*$', '', title).strip()
        title = re.sub(r'^\d+\s*[”"“‘\']*\s*(?=[\u3400-\u9fff])', '', title).strip()
        title = re.sub(r'^节\s*[,，:：”"“‘\']*\s*', '', title).strip()
        title = re.sub(r'(?<=[\u3400-\u9fff)）])\s*[”"“]?\s*\d{1,3}[^\u3400-\u9fff]*$', '', title).strip()
        title = re.sub(r'\s+[”"“]\s*', ' ', title).strip()
    title = title.strip(' ·•_|—–')
    title = OCR_TITLE_CORRECTIONS.get(title, title)
    if title == '刷下' or re.fullmatch(r'[一二三四五六七八九十百0-9\s—–_-]+', title):
        return None
    return title if readable_ocr_title(title) else None


def ocr_page_is_toc(lines: list[str], pdf_page: int) -> bool:
    compact = ''.join(lines[:16]).replace(' ', '')
    segments = [segment for line in lines for segment in numbered_ocr_segments(line)]
    printed_pages = sorted({int(printed) for _, printed in segments if printed and printed.isdigit()})
    explicit_toc = '目录' in compact and len(segments) >= 2
    implicit_toc = (
        pdf_page <= 10
        and len(segments) >= 3
        and len(printed_pages) >= 2
        and printed_pages[-1] - printed_pages[0] >= 5
        and len(printed_pages) / len(segments) >= 0.3
    )
    return explicit_toc or implicit_toc


def run_tesseract(image: Path, workdir: Path) -> tuple[int, list[str], str | None]:
    command = shutil.which('tesseract')
    if not command:
        return 0, [], 'tesseract_not_found'
    result = subprocess.run(
        [command, image.name, 'stdout', '-l', 'chi_sim+eng', '--psm', '3'],
        cwd=workdir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=90,
        check=False,
    )
    if result.returncode != 0:
        return 0, [], normalize_text(result.stderr) or f'tesseract_exit_{result.returncode}'
    lines = [normalize_text(line) for line in result.stdout.splitlines() if normalize_text(line)]
    page_match = re.search(r'(\d+)$', image.stem)
    return int(page_match.group(1)) if page_match else 0, lines, None


def ocr_toc_candidates(
    pdf_path: Path,
    edition_id: str,
    page_count: int,
    max_pages: int,
    dpi: int,
    workers: int,
    allow_english: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    pdftoppm = shutil.which('pdftoppm')
    if not pdftoppm:
        return [], {'status': 'pdftoppm_not_found', 'pages_ocrd': 0, 'toc_pages': []}
    last_page = min(page_count, max(1, max_pages))
    with tempfile.TemporaryDirectory(prefix='kebiao-structure-ocr-') as temp:
        workdir = Path(temp)
        rendered = subprocess.run(
            [
                pdftoppm, '-f', '1', '-l', str(last_page), '-r', str(dpi),
                '-jpeg', '-gray', str(pdf_path), 'page',
            ],
            cwd=workdir,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=max(120, last_page * 15),
            check=False,
        )
        if rendered.returncode != 0:
            return [], {
                'status': 'render_failed',
                'pages_ocrd': 0,
                'toc_pages': [],
                'error': normalize_text(rendered.stderr),
            }
        images = sorted(workdir.glob('page-*.jpg'))
        rows: list[tuple[int, list[str], str | None]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            futures = [executor.submit(run_tesseract, image, workdir) for image in images]
            for future in concurrent.futures.as_completed(futures):
                rows.append(future.result())
        rows.sort(key=lambda item: item[0])

    toc_page_numbers = {
        pdf_page
        for pdf_page, lines, error in rows
        if not error and ocr_page_is_toc(lines, pdf_page)
    }
    # Multi-page TOCs can have one sparse continuation page that omits the
    # literal “目录” heading. Include only an adjacent early page with at least
    # two explicit numbered entries; this does not pull ordinary body pages in.
    for pdf_page, lines, error in rows:
        if error or pdf_page > 10 or pdf_page in toc_page_numbers:
            continue
        segment_count = sum(len(numbered_ocr_segments(line)) for line in lines)
        if segment_count >= 2 and ({pdf_page - 1, pdf_page + 1} & toc_page_numbers):
            toc_page_numbers.add(pdf_page)
    toc_pages = [
        (pdf_page, lines)
        for pdf_page, lines, error in rows
        if not error and pdf_page in toc_page_numbers
    ]
    if not toc_pages:
        errors = [error for _, _, error in rows if error]
        return [], {
            'status': 'no_toc_detected',
            'pages_ocrd': len(rows),
            'toc_pages': [],
            'errors': errors[:5],
        }

    estimated_offset = max(pdf_page for pdf_page, _ in toc_pages)
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()
    source_order = 0
    for toc_pdf_page, lines in toc_pages:
        for line in lines:
            for raw_title, printed in numbered_ocr_segments(line):
                title = sanitize_ocr_title(raw_title, allow_english)
                if not title:
                    continue
                key = (re.sub(r'\s+', '', title).lower(), printed)
                if key in seen:
                    continue
                seen.add(key)
                source_order += 1
                pdf_page = None
                if printed and printed.isdigit():
                    inferred = int(printed) + estimated_offset
                    if 1 <= inferred <= page_count:
                        pdf_page = inferred
                candidates.append({
                    'entry_id': stable_id('tcu', edition_id, 'ocr_toc', title, printed or source_order),
                    'parent_id': None,
                    'level': 2,
                    'kind': 'section',
                    'title': title,
                    'printed_page': printed,
                    'pdf_page': pdf_page,
                    'end_pdf_page': None,
                    'confidence': 0.9 if printed else 0.84,
                    'review_status': 'approved',
                    'source': 'ocr_toc',
                    'source_order': source_order,
                    'toc_pdf_page': toc_pdf_page,
                })
    return candidates, {
        'status': 'ocr_toc_extracted' if candidates else 'toc_page_without_numbered_entries',
        'pages_ocrd': len(rows),
        'toc_pages': [pdf_page for pdf_page, _ in toc_pages],
        'estimated_printed_page_offset': estimated_offset,
        'candidate_count': len(candidates),
    }


def assign_hierarchy(entries: list[dict[str, Any]], page_count: int) -> list[dict[str, Any]]:
    entries.sort(key=lambda item: (item['pdf_page'] or page_count + 1, item['level'], item['title']))
    current_parent: str | None = None
    for entry in entries:
        if entry['level'] == 1:
            current_parent = entry['entry_id']
        else:
            entry['parent_id'] = current_parent
    for index, entry in enumerate(entries):
        if entry['level'] != 2 or not re.match(r'^第\s*1节', entry['title']):
            continue
        next_parent = next((item for item in entries[index + 1:] if item['level'] == 1 and item['pdf_page']), None)
        if next_parent and entry['pdf_page'] and 0 <= next_parent['pdf_page'] - entry['pdf_page'] <= 2:
            entry['parent_id'] = next_parent['entry_id']
    approved = [item for item in entries if item['review_status'] == 'approved' and item['pdf_page']]
    for index, entry in enumerate(approved):
        next_pages = [item['pdf_page'] for item in approved[index + 1:] if item['level'] <= entry['level']]
        entry['end_pdf_page'] = (next_pages[0] - 1) if next_pages else page_count
    return entries


def extract_asset(
    asset: dict[str, Any],
    library_root: Path,
    generated_at: str,
    *,
    ocr_fallback: bool = False,
    ocr_max_pages: int = 18,
    ocr_dpi: int = 150,
    ocr_workers: int = 4,
) -> dict[str, Any]:
    pdf_path = (library_root / asset['object_path']).resolve()
    if library_root.resolve() not in pdf_path.parents or not pdf_path.exists():
        raise FileNotFoundError(f"Missing verified asset for {asset['edition_id']}")

    reader = PdfReader(str(pdf_path), strict=False)
    all_lines: list[list[str]] = []
    char_counts: list[int] = []
    printed_candidates: list[tuple[int, str]] = []
    toc_pages: list[tuple[int, list[str]]] = []
    toc_continuation = False
    for index, page in enumerate(reader.pages):
        try:
            lines = page_lines(page)
        except Exception:
            lines = []
        all_lines.append(lines)
        char_counts.append(sum(len(line) for line in lines))
        candidate = printed_page_candidate(lines)
        if candidate:
            printed_candidates.append((index + 1, candidate))
        if index < 24:
            is_toc = looks_like_toc(lines, continuation=toc_continuation)
            if is_toc:
                toc_pages.append((index + 1, lines))
            toc_continuation = is_toc

    pages_with_text = sum(1 for count in char_counts if count >= 40)
    text_ratio = pages_with_text / max(1, len(reader.pages))
    median_chars = statistics.median(char_counts) if char_counts else 0
    if text_ratio >= 0.72 and median_chars >= 120:
        text_quality = 'native_text'
    elif text_ratio >= 0.2:
        text_quality = 'partial_text'
    else:
        text_quality = 'scan_only'

    offset, offset_confidence, offset_evidence = infer_numeric_offset(printed_candidates)
    page_map: list[dict[str, Any]] = []
    exact_by_pdf = {pdf: label for pdf, label in printed_candidates}
    if offset is not None:
        for pdf_page in range(offset + 1, len(reader.pages) + 1):
            printed = str(pdf_page - offset)
            exact = exact_by_pdf.get(pdf_page) == printed
            page_map.append({
                'pdf_page': pdf_page,
                'printed_page': printed,
                'label': f'印刷页 {printed}',
                'confidence': round(max(0.9, min(0.99, offset_confidence + (0.05 if exact else 0))), 3),
                'review_status': 'approved',
            })
    else:
        for pdf_page, label in printed_candidates:
            page_map.append({
                'pdf_page': pdf_page,
                'printed_page': label,
                'label': f'印刷页 {label}',
                'confidence': 0.68,
                'review_status': 'machine_checked',
            })

    printed_by_pdf = {item['pdf_page']: item['printed_page'] for item in page_map if item['review_status'] == 'approved'}
    headings: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    current_parent_key: str | None = None
    toc_page_numbers = {page for page, _ in toc_pages}
    for pdf_page, lines in enumerate(all_lines, start=1):
        if pdf_page in toc_page_numbers or not lines:
            continue
        found = heading_from_lines(lines)
        if not found:
            continue
        kind, level, title = found
        if kind == 'section':
            numeric_prefix = re.match(r'^([0-9]+)\.', title)
            if numeric_prefix:
                leading = int(numeric_prefix.group(1))
                active_chapter = chapter_number(current_parent_key)
                if leading == 0 or (active_chapter is not None and leading != active_chapter):
                    continue
        key = heading_identity(kind, title, current_parent_key)
        if key in seen_titles:
            continue
        seen_titles.add(key)
        if level == 1:
            current_parent_key = key
        headings.append({
            'entry_id': stable_id('tcu', asset['edition_id'], title, pdf_page),
            'parent_id': None,
            'level': level,
            'kind': kind,
            'title': title,
            'printed_page': printed_by_pdf.get(pdf_page),
            'pdf_page': pdf_page,
            'end_pdf_page': None,
            'confidence': 0.98 if pdf_page in printed_by_pdf else 0.92,
            'review_status': 'approved',
            'source': 'heading_match',
        })

    all_candidates = toc_candidates(toc_pages, asset['edition_id'])

    # A stable table-of-contents/body agreement can recover the printed-page
    # offset when decorative footers make direct footer extraction sparse.
    if offset is None:
        candidate_printed = {
            re.sub(r'\s+', '', item['title']).lower(): int(item['printed_page'])
            for item in all_candidates if str(item['printed_page']).isdigit()
        }
        anchor_offsets = []
        for item in headings:
            printed = candidate_printed.get(re.sub(r'\s+', '', item['title']).lower())
            if printed is not None:
                anchor_offsets.append(item['pdf_page'] - printed)
        if anchor_offsets:
            fallback_offset, fallback_count = Counter(anchor_offsets).most_common(1)[0]
            if fallback_count >= 2 and 0 <= fallback_offset <= 40:
                offset = fallback_offset
                offset_confidence = 0.91
                offset_evidence = fallback_count
                page_map = [{
                    'pdf_page': pdf_page,
                    'printed_page': str(pdf_page - offset),
                    'label': f'印刷页 {pdf_page - offset}',
                    'confidence': 0.91,
                    'review_status': 'approved',
                } for pdf_page in range(offset + 1, len(reader.pages) + 1)]
                printed_by_pdf = {item['pdf_page']: item['printed_page'] for item in page_map}
                for item in headings:
                    item['printed_page'] = printed_by_pdf.get(item['pdf_page'])
                    item['confidence'] = 0.98

    approved_title_keys = {re.sub(r'\s+', '', item['title']).lower() for item in headings}
    candidates = []
    for item in all_candidates:
        title_key = re.sub(r'\s+', '', item['title']).lower()
        if title_key in approved_title_keys:
            continue
        if offset is not None and str(item['printed_page']).isdigit():
            pdf_page = int(item['printed_page']) + offset
            page_compact = re.sub(r'\s+', '', ' '.join(all_lines[pdf_page - 1])).lower() if 0 < pdf_page <= len(all_lines) else ''
            if title_key and title_key in page_compact:
                item.update({
                    'pdf_page': pdf_page,
                    'confidence': 0.96,
                    'review_status': 'approved',
                    'source': 'heading_match',
                })
                approved_title_keys.add(title_key)
        candidates.append(item)
    toc = assign_hierarchy(headings + candidates, len(reader.pages))
    ocr_audit = {'status': 'not_requested', 'pages_ocrd': 0, 'toc_pages': []}
    if ocr_fallback and not any(item['review_status'] == 'approved' for item in toc):
        ocr_candidates, ocr_audit = ocr_toc_candidates(
            pdf_path,
            asset['edition_id'],
            len(reader.pages),
            ocr_max_pages,
            ocr_dpi,
            ocr_workers,
            asset.get('subject_slug') == 'english',
        )
        if ocr_candidates:
            toc = assign_hierarchy(ocr_candidates, len(reader.pages))
    notes = []
    if offset is not None:
        notes.append(f'数字印刷页与 PDF 页偏移 {offset}，由 {offset_evidence} 页重复证据支持。')
    else:
        notes.append('未形成足够稳定的数字印刷页偏移，仅保留逐页候选。')
    if text_quality == 'scan_only':
        notes.append('文字层不足，需要 OCR 后才能继续目录与搜索处理。')
    if ocr_audit['status'] == 'ocr_toc_extracted':
        notes.append(f"OCR 在 PDF 页 {ocr_audit['toc_pages']} 恢复了 {ocr_audit['candidate_count']} 个课/节目录条目。")
    notes.append('目录条目只有在正文页面直接回查，或通过保守的扫描目录识别门槛后，才进入已核对目录。')
    return {
        'schema_version': 1,
        'edition_id': asset['edition_id'],
        'evidence_id': asset['evidence_id'],
        'text_quality': text_quality,
        'toc': toc,
        'page_map': page_map,
        'alignments': [],
        'extraction': {
            'extracted_at': generated_at,
            'page_count_checked': len(reader.pages),
            'pages_with_text': pages_with_text,
            'average_characters_per_page': round(sum(char_counts) / max(1, len(char_counts)), 1),
            'notes': notes,
        },
        'audit': {
            'pdf_page_count': len(reader.pages),
            'toc_candidate_page_count': len(toc_pages),
            'approved_toc_entry_count': sum(1 for item in toc if item['review_status'] == 'approved'),
            'candidate_toc_entry_count': sum(1 for item in toc if item['review_status'] != 'approved'),
            'approved_page_map_count': sum(1 for item in page_map if item['review_status'] == 'approved'),
            'numeric_page_offset': offset,
            'numeric_page_offset_confidence': round(offset_confidence, 3),
            'ocr': ocr_audit,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument('--all', action='store_true')
    scope.add_argument('--edition-id', action='append', default=[])
    parser.add_argument('--only-missing-toc', action='store_true')
    parser.add_argument('--refresh-ocr-derived', action='store_true')
    parser.add_argument('--only-ocr-derived', action='store_true')
    parser.add_argument('--ocr-fallback', action='store_true')
    parser.add_argument('--ocr-max-pages', type=int, default=18)
    parser.add_argument('--ocr-dpi', type=int, default=150)
    parser.add_argument('--ocr-workers', type=int, default=4)
    parser.add_argument('--library-root', type=Path, default=DEFAULT_LIBRARY_ROOT)
    args = parser.parse_args()

    current = read_json(CURRENT_PATH)
    registry_path = PROJECT_ROOT / f"data/textbooks/library-state/generations/{current['generation_id']}/asset_registry.lock.jsonl"
    assets = [json.loads(line) for line in registry_path.read_text(encoding='utf-8').splitlines() if line.strip()]
    if args.edition_id:
        selected = [asset for asset in assets if asset['edition_id'] in set(args.edition_id)]
    elif args.all:
        selected = assets
    else:
        selected = [asset for asset in assets if (asset['subject_slug'], asset['grade'], asset['volume']) in PILOT_KEYS]
    if args.only_missing_toc:
        selected = [
            asset for asset in selected
            if not (OUTPUT_ROOT / f"{asset['edition_id']}.json").exists()
            or not any(
                item.get('review_status') == 'approved'
                for item in read_json(OUTPUT_ROOT / f"{asset['edition_id']}.json").get('toc', [])
            )
        ]
    if args.refresh_ocr_derived:
        selected = [
            asset for asset in selected
            if not (OUTPUT_ROOT / f"{asset['edition_id']}.json").exists()
            or not any(
                item.get('review_status') == 'approved'
                for item in read_json(OUTPUT_ROOT / f"{asset['edition_id']}.json").get('toc', [])
            )
            or any(
                item.get('source') == 'ocr_toc'
                for item in read_json(OUTPUT_ROOT / f"{asset['edition_id']}.json").get('toc', [])
            )
        ]
    if args.only_ocr_derived:
        selected = [
            asset for asset in selected
            if (OUTPUT_ROOT / f"{asset['edition_id']}.json").exists()
            and any(
                item.get('source') == 'ocr_toc'
                for item in read_json(OUTPUT_ROOT / f"{asset['edition_id']}.json").get('toc', [])
            )
        ]

    generated_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    failures: list[dict[str, str]] = []
    summaries = []
    for index, asset in enumerate(selected, start=1):
        try:
            existing_path = OUTPUT_ROOT / f"{asset['edition_id']}.json"
            existing = read_json(existing_path) if existing_path.exists() else {}
            existing_alignments = existing.get('alignments', [])
            existing_standard_scopes = existing.get('standard_scopes', [])
            result = extract_asset(
                asset,
                args.library_root,
                generated_at,
                ocr_fallback=args.ocr_fallback,
                ocr_max_pages=args.ocr_max_pages,
                ocr_dpi=args.ocr_dpi,
                ocr_workers=args.ocr_workers,
            )
            result['alignments'] = existing_alignments
            if existing_standard_scopes:
                result['standard_scopes'] = existing_standard_scopes
            write_json(OUTPUT_ROOT / f"{asset['edition_id']}.json", result)
            summaries.append({
                'edition_id': asset['edition_id'],
                'text_quality': result['text_quality'],
                **result['audit'],
            })
            print(f"[{index}/{len(selected)}] {asset['edition_id']} {asset['subject']} {asset['grade']}{asset['volume']}: {result['text_quality']}, toc={result['audit']['approved_toc_entry_count']}, page_map={result['audit']['approved_page_map_count']}", flush=True)
        except Exception as error:  # Keep the batch auditable; fail at the end.
            failures.append({'edition_id': asset['edition_id'], 'error': str(error)})
            print(f"[{index}/{len(selected)}] FAILED {asset['edition_id']}: {error}", flush=True)

    report = {
        'schema_version': 1,
        'generated_at': generated_at,
        'source_generation_id': current['generation_id'],
        'selected_count': len(selected),
        'completed_count': len(summaries),
        'failure_count': len(failures),
        'by_text_quality': dict(Counter(item['text_quality'] for item in summaries)),
        'approved_toc_entry_count': sum(item['approved_toc_entry_count'] for item in summaries),
        'approved_page_map_count': sum(item['approved_page_map_count'] for item in summaries),
        'items': summaries,
        'failures': failures,
    }
    write_json(PROJECT_ROOT / 'data/textbooks/derived/structure_extraction_report.json', report)
    print(json.dumps(report | {'items': f"{len(summaries)} item summaries omitted"}, ensure_ascii=False, indent=2), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
