#!/usr/bin/env bash
# Curtaincall iOS — 빌드 헬퍼. 목적은 하나: **출력을 신호만 남기기.**
# raw xcodebuild 로그는 수천 줄이라 에이전트 컨텍스트를 통째로 태운다. 이 스크립트는
# 결과 1줄 + (있을 때만) 에러/경고만 찍는다.
#
#   ./scripts/build.sh              # 증분 빌드 (기본) — 평소엔 이것만 쓴다
#   ./scripts/build.sh --warnings   # 별도 DerivedData 로 클린 빌드 → '진짜' 경고 수
#   ./scripts/build.sh --run        # 증분 빌드 후 부팅된 시뮬레이터에 설치+실행
#
# ⚠️ --warnings 를 왜 따로 두나: 증분 빌드는 '바뀐 파일'만 다시 컴파일하므로 손대지 않은
# 파일의 경고가 다시 나오지 않는다. 그래서 증분 결과의 "warnings: 0" 은 신뢰할 수 없다
# (PR #188 이 이 함정으로 '경고 0' 을 보고했지만 클린 빌드엔 8건이 남아 있었다).
# 그렇다고 메인 체크아웃에서 clean 하면 warm DerivedData 가 날아가 다음 빌드가 느려지므로
# (AGENTS.md), 여기서는 /tmp 의 **별도** DerivedData 를 쓴다 — 워밍 캐시는 그대로 둔다.
set -euo pipefail

cd "$(dirname "$0")/.."

SCHEME="Curtaincall"
DEST="platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5"
# --warnings 전용 DerivedData. 메인 체크아웃의 warm 캐시(기본 경로)를 절대 건드리지 않기
# 위해 분리한다(AGENTS.md "never clean" 은 그 warm 캐시를 지키라는 뜻 — 별도 경로를
# clean 하는 건 그 규칙과 충돌하지 않는다). CC_CLEAN_DD 로 덮어쓸 수 있다.
CLEAN_DD="${CC_CLEAN_DD:-/tmp/curtaincall-clean-verify}"
LOG="$(mktemp -t curtaincall-build)"
trap 'rm -f "$LOG"' EXIT

MODE="${1:-incremental}"

case "$MODE" in
  --warnings)
    echo "클린 빌드(별도 DerivedData) — 경고 전수 집계…"
    # ⚠️ `clean` 이 반드시 붙어야 한다(Codex 리뷰 지적). 같은 derivedDataPath 를 재사용하는데
    # `build` 만 돌리면 **두 번째 실행부터 증분**이 되어, 이 옵션이 막으려던 바로 그 함정
    # (손대지 않은 파일이 재컴파일되지 않아 그 파일의 경고가 사라지고 "경고 0" 오보)에
    # 스스로 빠진다. clean 이 빌드 산출물을 지워 전 소스 재컴파일 → 경고 전수 재출력.
    # (매번 mktemp 새 경로를 쓰는 대안도 있지만 SPM 체크아웃까지 매번 새로 받아 훨씬 느리다.
    #  같은 경로 + clean 이면 패키지 캐시는 재사용하면서 소스 경고는 전수 확보된다.)
    xcodebuild clean build -scheme "$SCHEME" -destination "$DEST" \
      -derivedDataPath "$CLEAN_DD" > "$LOG" 2>&1 || true
    ;;
  *)
    xcodebuild build -scheme "$SCHEME" -destination "$DEST" > "$LOG" 2>&1 || true
    ;;
esac

# 결과 한 줄.
if grep -q "BUILD SUCCEEDED" "$LOG"; then RESULT="BUILD SUCCEEDED"; else RESULT="BUILD FAILED"; fi

# 에러는 항상, 전부.
ERRORS="$(grep -E "error:" "$LOG" | sort -u || true)"
# 경고는 프로젝트 소스만(SDK/패키지 잡음 제외) 중복 제거.
WARNINGS="$(grep -E "warning:" "$LOG" | grep -F "/Curtaincall/" | sort -u || true)"

echo "$RESULT"
[ -n "$ERRORS" ] && { echo "--- errors ---"; echo "$ERRORS"; }
if [ -n "$WARNINGS" ]; then
  echo "--- warnings ($(echo "$WARNINGS" | wc -l | tr -d ' ')) ---"
  echo "$WARNINGS"
elif [ "$MODE" = "--warnings" ]; then
  echo "warnings: 0 (clean build — 신뢰 가능)"
fi

if [ "$MODE" = "--run" ] && [ "$RESULT" = "BUILD SUCCEEDED" ]; then
  # 앱 경로는 로그 grep 이 아니라 빌드 설정에서 정확히 받는다(로그 포맷 변화에 안 깨짐).
  BUILT="$(xcodebuild -showBuildSettings -scheme "$SCHEME" -destination "$DEST" 2>/dev/null \
            | awk -F' = ' '/  BUILT_PRODUCTS_DIR/ {print $2; exit}')"
  APP="$BUILT/Curtaincall.app"
  # 부팅된 기기가 없으면 대상 시뮬레이터를 깨운다(이미 부팅됐으면 무해).
  if ! xcrun simctl list devices booted | grep -q "([0-9A-F-]\{36\})"; then
    xcrun simctl boot "iPhone 17 Pro" >/dev/null 2>&1 || true
    open -a Simulator >/dev/null 2>&1 || true
    sleep 6
  fi
  if xcrun simctl install booted "$APP" >/dev/null 2>&1 \
     && xcrun simctl launch booted com.curtaincall.Curtaincall >/dev/null 2>&1; then
    echo "installed + launched on booted simulator"
  else
    echo "install/launch 실패 — 부팅된 시뮬레이터 확인 필요 ($APP)"
  fi
fi

[ "$RESULT" = "BUILD SUCCEEDED" ] || exit 1
