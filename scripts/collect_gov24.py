"""gov24(행안부 공공서비스) 전체 수집 → 취준 관련 필터 → JSON 저장 (적재는 load_policies가)"""
import json, os, time, hashlib, re, sys
import urllib.request, urllib.parse
from pathlib import Path

for line in Path(".env.local").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
# (과거) gov24 키가 READY_TO_WORK .env에 있던 시절의 폴백 — 지금은 .env.local에 있음
_legacy = Path("../READY_TO_WORK/.env")
if "DATA_GO_KR_API_KEY" not in os.environ and _legacy.exists():
    for line in _legacy.read_text().splitlines():
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
Path(str(out_dir) if (out_dir := Path(sys.argv[1]).parent if len(sys.argv) > 1 else Path("/tmp")) else "/tmp").mkdir(parents=True, exist_ok=True)
(out_dir / "gov24_all.json").write_text(json.dumps(items, ensure_ascii=False))

# 필터 모드: jobseeker(취준, 기본) / employed(취업 후 — 재직자·자산형성·주거·결혼)
MODE = sys.argv[2] if len(sys.argv) > 2 else "jobseeker"
RES = {
    "jobseeker": r"구직|취업|미취업|취준|면접|자격증|어학|직업훈련|인턴|일경험|채용|청년.{0,6}(수당|지원|활동)",
    "employed": r"재직|근로자|직장인|자산형성|저축|통장|청약|전세|월세|주거비|신혼|결혼|근속|내일채움|공제|도약계좌|연금|이차보전|주택.{0,4}(대출|구입|자금)",
}
RE = re.compile(RES[MODE])
def relevant(r):
    text = f"{r.get('서비스명','')} {r.get('지원대상','')} {r.get('서비스목적요약','')} {r.get('지원내용','')}"
    return bool(RE.search(text))
picked = [r for r in items if relevant(r)]
print(f"{MODE} 관련: {len(picked)}건")
out = Path(sys.argv[1] if len(sys.argv) > 1 else f"/tmp/gov24_{MODE}.json")
out.write_text(json.dumps(picked, ensure_ascii=False))
print(f"저장: {out}")
