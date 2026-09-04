"""gov24(행안부 공공서비스) 전체 수집 → 취준 관련 필터 → JSON 저장 (적재는 load_policies가)"""
import json, os, time, hashlib, re, sys
import urllib.request, urllib.parse
from pathlib import Path

for line in Path(".env.local").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
# gov24 키는 READY_TO_WORK .env에 있음
for line in Path("../READY_TO_WORK/.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
KEY = urllib.parse.unquote(os.environ["DATA_GO_KR_API_KEY"])
EP = "https://api.odcloud.kr/api/gov24/v3/serviceList"

def page(n, size=100):
    params = {"page": n, "perPage": size, "returnType": "JSON", "serviceKey": KEY}
    url = f"{EP}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "tikkeul/0.1"}), timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception:
            if attempt == 3: raise
            time.sleep(1.5 * (attempt + 1))

first = page(1)
total = first.get("totalCount", 0)
items = list(first.get("data", []))
pages = (total + 99) // 100
print(f"gov24 전체 {total}건 / {pages}페이지 수집 시작")
for n in range(2, pages + 1):
    items += page(n).get("data", [])
    if n % 20 == 0: print(f"  {n}/{pages}")
    time.sleep(0.1)
print(f"수집 완료: {len(items)}건")

# 취준 관련 필터: 서비스명/지원대상/목적에 취준 신호
RE = re.compile(r"구직|취업|미취업|취준|면접|자격증|어학|직업훈련|인턴|일경험|채용|청년.{0,6}(수당|지원|활동)")
def relevant(r):
    text = f"{r.get('서비스명','')} {r.get('지원대상','')} {r.get('서비스목적요약','')} {r.get('지원내용','')}"
    return bool(RE.search(text))
picked = [r for r in items if relevant(r)]
print(f"취준 관련: {len(picked)}건")
out = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/gov24_jobseeker.json")
out.write_text(json.dumps(picked, ensure_ascii=False))
print(f"저장: {out}")
