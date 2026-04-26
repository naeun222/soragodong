#!/bin/bash
# 5 commit마다 가성(실패/fail)·Anti-sycophancy 단어 audit. 차단 X, 경고만.
# 설치: cp scripts/pre-commit-audit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# 또는 .git/hooks/pre-commit 안에서 exec ./scripts/pre-commit-audit.sh

COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
# 5번에 1번만 (4, 9, 14, ...번째 commit 직전)
if [ $((COMMIT_COUNT % 5)) -ne 4 ]; then
  exit 0
fi

echo "🔍 5-commit audit (가성 + Anti-sycophancy)..."

# 부정적 의미로 쓰인 '실패' 계열 (anti-sycophancy 핵심 — 가성은 실패 단어 회피)
NEGATIVE='실패\|실패해\|실패함\|실패하는\|failed\|^fail$\|fail '

# 안티-시코판시 금지어 (인계 문서 + V4 비전)
SYCOPHANT='대박\|멋있고 이로워\|힘내\|파이팅\|할 수 있어\|오늘도 멋진 하루\|당신은 대단해\|대단하시네요\|멋지세요\|사랑해요\|훌륭해요\|짱이에요'

CHANGED_FILES=$(git diff --cached --name-only --diff-filter=AM -- 'src/**/*.ts' 'src/**/*.css' '*.html' 2>/dev/null)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

N_HITS=0
S_HITS=0
for f in $CHANGED_FILES; do
  if [ -f "$f" ]; then
    if grep -q -E "$NEGATIVE" "$f" 2>/dev/null; then
      N_HITS=$((N_HITS + 1))
      echo "  ⚠️  [가성] $f"
    fi
    if grep -q -E "$SYCOPHANT" "$f" 2>/dev/null; then
      S_HITS=$((S_HITS + 1))
      echo "  ⚠️  [sycophancy] $f"
    fi
  fi
done

if [ $N_HITS -gt 0 ] || [ $S_HITS -gt 0 ]; then
  echo "⚠️  가성 $N_HITS · sycophancy $S_HITS 파일에서 hit. 검토 후 commit (차단 X)."
else
  echo "✓ clean"
fi

exit 0
