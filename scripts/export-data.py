"""Export public procurement fields from existing daily Markdown reports (read only)."""
import argparse, datetime as dt, hashlib, json, re, unicodedata
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r'C:\Users\se7en\Documents\Codex\2026-08-14\new-chat\outputs\档案项目采购日报')
UNKNOWN = '未识别'

# Conservative location aliases used only when the source report omitted a
# reliable province or copied a portal-level administrative label.  The
# aliases are place names (not arbitrary words), so a title/customer match can
# correct obvious cases such as ``喀什`` being labelled ``北京``.
LOCATION_ALIASES = {
    '北京': ('北京',), '上海': ('上海',), '天津': ('天津',), '重庆': ('重庆',),
    '河北': ('河北', '石家庄', '唐山', '保定', '邯郸', '廊坊'),
    '山西': ('山西', '太原', '吕梁', '大同', '长治', '晋中'),
    '辽宁': ('辽宁', '沈阳', '大连', '鞍山', '锦州'),
    '吉林': ('吉林', '长春', '四平', '通化', '延边'),
    '黑龙江': ('黑龙江', '哈尔滨', '齐齐哈尔', '大庆', '牡丹江'),
    '江苏': ('江苏', '南京', '苏州', '无锡', '南通', '海安', '徐州', '盐城'),
    '浙江': ('浙江', '杭州', '绍兴', '庆元', '永康', '宁波', '嘉兴', '金华'),
    '安徽': ('安徽', '合肥', '霍邱', '肥西', '太和', '六安', '芜湖'),
    '福建': ('福建', '福州', '厦门', '泉州', '漳州'),
    '江西': ('江西', '南昌', '赣州', '九江', '上饶'),
    '山东': ('山东', '济南', '青岛', '淄博', '潍坊', '临沂'),
    '河南': ('河南', '郑州', '开封', '洛阳', '惠济', '安阳', '新乡'),
    '湖北': ('湖北', '武汉', '鄂州', '十堰', '襄阳', '宜昌'),
    '湖南': ('湖南', '长沙', '郴州', '溆浦', '岳阳', '株洲', '衡阳'),
    '广东': ('广东', '广州', '深圳', '佛山', '东莞', '珠海'),
    '广西': ('广西', '南宁', '桂林', '柳州'),
    '海南': ('海南', '海口', '三亚'),
    '四川': ('四川', '成都', '广元', '邛崃', '盐边', '内江', '乐山', '犍为', '绵阳'),
    '贵州': ('贵州', '贵阳', '遵义', '六盘水'),
    '云南': ('云南', '昆明', '大理', '玉溪', '曲靖'),
    '西藏': ('西藏', '拉萨'),
    '陕西': ('陕西', '西安', '宝鸡', '咸阳', '榆林'),
    '甘肃': ('甘肃', '兰州', '天水', '酒泉'),
    '青海': ('青海', '西宁'),
    '宁夏': ('宁夏', '银川'),
    '新疆': ('新疆', '喀什', '乌鲁木齐', '伊犁', '库尔勒', '阿克苏'),
    '内蒙古': ('内蒙古', '包头', '呼和浩特', '鄂尔多斯', '赤峰', '通辽'),
}

def safe_url(value):
    try:
        p = urlsplit(value.strip())
        if p.scheme not in ('https', 'http') or not p.hostname or p.username or p.password:
            return ''
        if any(x in value.lower() for x in ('access_token=', 'webhook', 'dingtalk.com/robot')):
            return ''
        return urlunsplit((p.scheme, p.netloc, p.path, p.query, ''))
    except ValueError:
        return ''

def date_value(value):
    m = re.search(r'(20\d{2})[年./-]\s*(\d{1,2})[月./-]\s*(\d{1,2})', value)
    if not m: return None
    try: return dt.date(*map(int, m.groups())).isoformat()
    except ValueError: return None

def budget_value(value):
    """Convert an unambiguous single budget amount to yuan.

    Historical reports contain small formatting variations such as an
    unmatched parenthesis (``159.5 (万元``) or a space before the unit.  Keep
    those values while rejecting rates, per-unit prices, caps and multi-lot
    figures that cannot safely be represented as one project budget.
    """
    raw = re.sub(r'\s+', '', value or '')
    if not raw or any(x in raw for x in ('最高限价', '单价', '每', '/', '包', '不超过')):
        return None
    m = re.fullmatch(r'(?:金额)?[:：]?([\d,]+(?:\.\d+)?)\s*[（(]?\s*(亿元|亿|万元|万|元)?\s*[）)]?', raw)
    if not m:
        return None
    try:
        number = float(m.group(1).replace(',', ''))
    except ValueError:
        return None
    unit = m.group(2) or '元'
    if number == 0:
        # A zero in a summary table is commonly a placeholder for an omitted
        # budget, not a real free procurement.  Keep the public value honest.
        return None
    multiplier = {'亿元': 100000000, '亿': 100000000, '万元': 10000, '万': 10000, '元': 1}[unit]
    return round(number * multiplier, 2)


def safe_published(value: str, report_date: str) -> tuple[str, str | None]:
    """Return a publication value only when it is plausible for the report.

    A failed detail-page fallback in older reports copied the bid deadline
    (often a future date) into ``发布时间``.  Publication dates cannot be later
    than the date on which that daily report was generated, so future values
    are downgraded to ``未识别`` instead of being shown as facts.
    """
    value = (value or '').strip()
    parsed = date_value(value)
    if parsed and report_date and parsed > report_date:
        return UNKNOWN, None
    return (value or UNKNOWN), parsed


def infer_province(title: str, customer: str, current: str) -> str:
    """Prefer a place name in the notice title/customer over weak metadata."""
    text = f'{title} {customer}'
    for province, aliases in LOCATION_ALIASES.items():
        if any(alias in text for alias in aliases):
            return province
    return current or UNKNOWN


PROJECT_ID_PATTERNS = (
    re.compile(r'(?i)(?<![A-Za-z0-9])([A-Z]{1,8}[-_][A-Z0-9]+(?:[-_][A-Z0-9]+)+)(?![A-Za-z0-9])'),
    re.compile(r'(?i)(?<![A-Za-z0-9])([A-Z]{1,5}\d{6,}[A-Z0-9-]*)(?![A-Za-z0-9])'),
    re.compile(r'(?<!\d)(20\d{2}\d{4,})(?!\d)'),
)
PROJECT_SUFFIX_RE = re.compile(
    r'(采购需求征集意见|需求公示(?:（征询意见）)?|采购意向|采购更正|更正|变更|'
    r'公开招标|竞争性磋商|竞争性谈判|询价|招标|采购)公告(?:（第[一二三四五六七八九十0-9]+次）)?$'
)


def canonical_project_text(value: str) -> str:
    text = unicodedata.normalize('NFKC', value or '').lower()
    text = PROJECT_SUFFIX_RE.sub('', text)
    text = re.sub(r'（?第[一二三四五六七八九十0-9]+次）?', '', text)
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', text)


def project_identity(record: dict) -> tuple:
    # Corrections carry operationally important changes (deadline, documents,
    # requirements).  Keep each correction as its own visible record even
    # when it references the same project as the original announcement.
    if record.get('type') == '更正公告' or re.search(r'更正|变更', str(record.get('title') or '')):
        return ('correction', record.get('url', ''))
    haystack = ' '.join(str(record.get(key) or '') for key in ('title', 'projectName', 'summary'))
    for pattern in PROJECT_ID_PATTERNS:
        match = pattern.search(haystack)
        if match:
            return ('id', match.group(1).lower())
    title = canonical_project_text(record.get('projectName') or record.get('title'))
    customer = canonical_project_text(record.get('customer'))
    # Generic/very short titles are not safe project identities without an ID.
    if len(title) < 10:
        return ('url', record.get('url', ''))
    return ('title', customer, title)


def known(value) -> bool:
    return value not in (None, '', UNKNOWN, '采购人未识别', '暂无可用摘要，请查看公告原文。')


def record_quality(record: dict) -> tuple:
    fields = ('province', 'customer', 'method', 'budgetYuan', 'publishedDate', 'acquisitionTime', 'deadlineDate', 'documents')
    score = sum(1 for field in fields if known(record.get(field)) and (field != 'documents' or record.get(field)))
    if '历史摘要包含无效页面内容' not in str(record.get('summary') or ''):
        score += 1
    return (score, record.get('publishedDate') or '', record.get('lastSeen') or '')


def deduplicate_records(records: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = {}
    for record in records:
        groups.setdefault(project_identity(record), []).append(record)
    merged: list[dict] = []
    for group in groups.values():
        ordered = sorted(group, key=record_quality, reverse=True)
        chosen = dict(ordered[0])  # one type is intentionally retained
        for candidate in ordered[1:]:
            for field in ('province', 'customer', 'methodRaw', 'method', 'budgetRaw', 'budgetYuan',
                          'publishedRaw', 'publishedDate', 'acquisitionTime', 'deadlineRaw', 'deadlineDate',
                          'source', 'summary', 'relevance', 'verification'):
                if not known(chosen.get(field)) and known(candidate.get(field)):
                    chosen[field] = candidate[field]
            docs = {tuple(item.items()) for item in (chosen.get('documents') or [])}
            docs.update(tuple(item.items()) for item in (candidate.get('documents') or []))
            chosen['documents'] = [dict(item) for item in docs]
            chosen['firstSeen'] = min(chosen.get('firstSeen') or '9999-99-99', candidate.get('firstSeen') or '9999-99-99')
            chosen['lastSeen'] = max(chosen.get('lastSeen') or '', candidate.get('lastSeen') or '')
        merged.append(chosen)
    return sorted(merged, key=lambda x: (x.get('publishedDate') or '', x.get('lastSeen') or ''), reverse=True)

def export(source, destination):
    records, rejected, reports = {}, [], []
    for file in sorted(source.glob('*_档案项目采购公告日报.md')):
        text = file.read_text(encoding='utf-8-sig')
        stamp = re.search(r'生成时间：([\d-]+ \d{2}:\d{2})', text)
        report_date = file.name[:10]
        reports.append({'date': report_date, 'generatedAt': stamp[1] if stamp else report_date})
        for section in re.split(r'^## \d+\. ', text, flags=re.M)[1:]:
            title, _, body = section.partition('\n')
            fields = dict(re.findall(r'^- ([^：\n]+)：(.*)$', body, re.M))
            links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', fields.get('招标网站', fields.get('来源', '')))
            url = safe_url(links[0][1]) if links else ''
            reason = None
            if not url: reason = '缺少有效公开原文链接'
            elif re.search(r'中标|成交|废标|流标|终止|结果公告|候选人', title) or re.search(r'/(?:cjgg|zbgg|zbhxrgs|zbjggg)/', url): reason = '结果类公告'
            elif not re.search(r'档案|电子文件归档', title): reason = '标题不属于档案采购'
            if reason:
                rejected.append({'report': report_date, 'title': title.strip(), 'reason': reason})
                continue
            relevance = fields.get('相关度', '相关').split('；')[0]
            kind = '采购公告'
            if re.search(r'更正|变更', title): kind = '更正公告'
            elif re.search(r'采购意向|采购意愿', title + fields.get('公告类型', '')): kind = '采购意向'
            elif re.search(r'需求|征集意见', title): kind = '采购需求'
            summary = fields.get('摘要', '').strip()
            inaccessible = bool(re.search(r'不可访问|无法访问|访问失败|暂时不可|<!doctype|<html|<head', summary, re.I))
            if re.search(r'<[!a-zA-Z]', summary): summary = '历史摘要包含无效页面内容，请查看公告原文。'
            method_raw = fields.get('采购方式', UNKNOWN)
            method_match = re.search(r'公开招标|竞争性磋商|竞争性谈判|询价|单一来源|邀请招标|框架协议', method_raw)
            method = method_match[0] if method_match else UNKNOWN
            docs = [{'label': label, 'url': safe_url(link)} for label, link in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', fields.get('招标文件', '')) if safe_url(link)]
            published, published_date = safe_published(
                fields.get('公告发布日期', fields.get('发布时间', UNKNOWN)), report_date
            )
            province = infer_province(title, fields.get('客户', fields.get('采购人', UNKNOWN)), fields.get('省份', UNKNOWN).strip())
            budget_raw = fields.get('预算金额', UNKNOWN).strip()
            if budget_raw and budget_value(budget_raw) is None and re.fullmatch(r'(?:金额\s*)?0+(?:\.0+)?\s*元', budget_raw):
                budget_raw = UNKNOWN
            record = {
                'id': hashlib.sha256(url.encode()).hexdigest()[:16],
                'title': title.strip(), 'projectName': fields.get('项目名称', title).strip(),
                'url': url, 'province': province,
                'customer': fields.get('客户', fields.get('采购人', UNKNOWN)).strip(),
                'type': kind, 'method': method, 'methodRaw': method_raw,
                'budgetRaw': budget_raw,
                'budgetYuan': budget_value(budget_raw),
                'publishedRaw': published, 'publishedDate': published_date,
                'acquisitionTime': fields.get('报名时间/获取采购文件时间', UNKNOWN).strip(),
                'deadlineRaw': fields.get('投标截止时间', UNKNOWN).strip(),
                'deadlineDate': date_value(fields.get('投标截止时间', '')),
                'source': fields.get('招标网站', '').split('（[查看公告]')[0] or fields.get('来源站点', urlsplit(url).hostname),
                'documents': docs, 'documentNote': re.sub(r'\[[^\]]+\]\([^)]+\)', '', fields.get('招标文件', '未提供公开文件')).strip('、 '),
                'summary': summary or '暂无可用摘要，请查看公告原文。', 'relevance': relevance,
                'verification': '详情待核验' if inaccessible else '日报收录',
                'firstSeen': records[url]['firstSeen'] if url in records else report_date,
                'lastSeen': report_date,
            }
            records[url] = record
    items = deduplicate_records(list(records.values()))
    dataset = {'schemaVersion': 1, 'exportedAt': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds'),
        'latestReportAt': max((r['generatedAt'] for r in reports), default=None),
        'reportCount': len(reports), 'noticeCount': len(items), 'records': items}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(destination)
    (ROOT / 'data-quality.json').write_text(json.dumps({'excluded': rejected, 'reports': reports}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'records': len(items), 'reports': len(reports), 'excluded': len(rejected), 'latestReportAt': dataset['latestReportAt']}, ensure_ascii=False))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    p.add_argument('--output', type=Path, default=ROOT / 'dist' / 'data.json')
    args = p.parse_args()
    export(args.source, args.output)
