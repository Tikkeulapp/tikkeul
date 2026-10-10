"""온통청년 정책 전수 수집 → JSON 저장 (적재는 scripts/load_policies.mts가)
실행: python3 scripts/collect_ontong.py [출력경로=/tmp/ontong_all.json]
API 응답은 크론(/api/cron/discover)과 같은 getPlcy — result.youthPolicyList를 끝 페이지까지 모은다."""
import json, os, time, sys
import urllib.request, urllib.parse
from pathlib import Path

env = Path(".env.local")
if env.exists():
    for line in env.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            # .env.example처럼 "KEY=값   # 설명" 형태의 줄 끝 주석은 값에서 뺀다
            os.environ.setdefault(k.strip(), v.split(" #")[0].strip())
KEY = os.environ.get("ONTONG_YOUTH_API_KEY")
if not KEY:
    sys.exit("❌ ONTONG_YOUTH_API_KEY가 없습니다 (.env.local 확인)")
EP = "https://www.youthcenter.go.kr/go/ythip/getPlcy"
SIZE = 100

def page(n):
    params = {"apiKeyNm": KEY, "pageNum": n, "pageSize": SIZE, "rtnType": "json"}
    url = f"{EP}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "tikkeul/0.1"}), timeout=30) as r:
                return json.loads(r.read().decode()).get("result") or {}
        except Exception:
            if attempt == 3: raise
            time.sleep(1.5 * (attempt + 1))

first = page(1)
total = int((first.get("pagging") or {}).get("totCount") or 0)
items = list(first.get("youthPolicyList") or [])
print(f"온통청년 전체 {total or '?'}건 수집 시작")
n = 1
# totCount를 못 받으면 빈 페이지가 나올 때까지 돈다
while (len(items) < total) if total else True:
    n += 1
    batch = page(n).get("youthPolicyList") or []
    if not batch: break
    items += batch
    if n % 5 == 0: print(f"  {len(items)}건")
    time.sleep(0.2)

# 페이지 경계에서 순서가 바뀌면 중복이 생길 수 있어 정책번호로 dedupe
uniq = list({str(it.get("plcyNo")): it for it in items if it.get("plcyNo")}.values())
print(f"수집 완료: {len(uniq)}건 (원본 {len(items)})")
out = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ontong_all.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(uniq, ensure_ascii=False))
print(f"저장: {out}")
