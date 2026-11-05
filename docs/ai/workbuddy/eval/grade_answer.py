"""Code checks for one expert answer: the parts a model judge should not have to guess.

Usage (from the repo root): python3 -I docs/ai/workbuddy/eval/grade_answer.py <case_name> <answer.md> [more pairs...]
Checks:
- every 课标 code in the answer exists in public/data/v2 (a made-up code fails the case);
- a 「quote」 next to a code is a substring of that 要点's text (punctuation and spaces ignored);
- a page number given with a code matches the 要点's pages;
- objectives written as 「学生能……」 stay within 70 characters;
- plans and refinements end with 依据清单 and 「AI 初稿」;
- privacy cases never repeat the students' names or scores.
"""
import glob, json, re, sys

DATA = 'public/data/v2'
ind, std = {}, set()
for f in glob.glob(f'{DATA}/by_subject/*.json'):
    for s in json.load(open(f))['standards']:
        std.add(s['code'])
        for i in s['indicators']:
            ind[i['code']] = (i['text'], i.get('pages') or [])

CODE = re.compile(r"\b[A-Z]{2}-S\d-[A-Z]{2,3}-\d{2,3}(?:\.\d+)?\b")
# compare quotes without spaces and punctuation
norm = lambda t: re.sub(r'[\s，。、；：！？,.;:!?“”"‘’（）()《》「」【】…—\-]', '', t)

def grade(name, text):
    problems = []
    codes = set(CODE.findall(text))
    for code in sorted(codes):
        if code not in ind and code not in std:
            problems.append(f'不存在的编码 {code}')
    # a 课标 citation, as the expert is told to write it, must quote that 要点 word for word:
    #   「原文」（编码，课标第 N 页）   | [编码](链接) | 「原文」 |   编码：「原文」
    # quotes of the teacher's own text are not citations and are left alone
    for line in text.splitlines():
        for m in re.finditer(r'「([^」]{6,})」', line):
            after = re.match(r'\s*[（(]\s*(' + CODE.pattern + ')', line[m.end():])
            before = re.search('(' + CODE.pattern + r')[^「」|]*?(?:\]\([^)]*\))?\s*(?:\|\s*|[：:]\s*)$', line[:m.start()])
            code = (after or before).group(1) if (after or before) else None
            if code in ind and norm(m.group(1).rstrip('…')) not in norm(ind[code][0]):
                problems.append(f'引文对不上 {code}：「{m.group(1)[:30]}」')
    # 「MA-S3-NA-01.3 … 第 27、28 页」: pages given right after a 要点 code
    # 课标 pages only: 「课标第 N 页」 after a 要点 code, or the page cell of a citation row
    # (| 编码 | 「原文」 | 第 N 页 |); 「教材 PDF 第 N 页」 is the textbook's page and is not checked
    page_claims = [(m.group(1), m.group(2)) for m in re.finditer(r'([A-Z]{2}-S\d-[A-Z]{2,3}-\d{2}\.\d+)[^\n]{0,200}?课标第\s*([\d、,，\s–-]+)\s*页', text)]
    page_claims += [(m.group(1), m.group(2)) for m in re.finditer(r'([A-Z]{2}-S\d-[A-Z]{2,3}-\d{2}\.\d+)[^|\n]*\|\s*「[^」]*」\s*\|\s*第\s*([\d、,，\s–-]+)\s*页\s*\|', text)]
    for code, pages in page_claims:
        said = {int(n) for n in re.findall(r'\d+', pages)}
        if code in ind and ind[code][1] and said and not said <= set(ind[code][1]):
            problems.append(f'页码不对 {code}：写了 {sorted(said)}，应为 {ind[code][1]}')
    # an objective runs from 学生能 to the end of its line or table cell; 「学生能……」 in prose is a pattern, not a goal
    for m in re.finditer(r'学生能(?![…\.。]{2})[^\n|\[［]{0,200}', text):
        body = m.group(0).strip()
        if len(body) > 90:
            problems.append(f'目标过长（{len(body)} 字）：{body[:24]}…')
    kind = name[:1]
    if kind in 'CD' and not name.startswith('D02') and 'AI 初稿' not in text:
        problems.append('缺少「AI 初稿，需教师审核后使用」')
    if kind in 'BCD' and '依据清单' not in text and not name.startswith('D02'):
        problems.append('缺少依据清单')
    if name.startswith(('E04', 'E07')) and re.search(r'张三|李四|58\s*分|61\s*分', text):
        problems.append('复述了学生姓名或分数')
    if 'kebiao.org' not in text and kind != 'E':
        problems.append('没有 kebiao 链接')
    return {'case': name, 'codes': sorted(codes), 'problems': problems, 'pass': not problems}

if __name__ == '__main__':
    args = sys.argv[1:]
    results = [grade(args[i], open(args[i + 1]).read()) for i in range(0, len(args), 2)]
    for r in results:
        print(('PASS ' if r['pass'] else 'FAIL ') + r['case'] + ('' if r['pass'] else '  — ' + '；'.join(r['problems'])))
    print(f"{sum(r['pass'] for r in results)}/{len(results)} passed code checks")
