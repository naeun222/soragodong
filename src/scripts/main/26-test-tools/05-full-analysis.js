// V4-fix v3 (사용자 요청): 시드 데이터로 통합 분석 강제 (forceAnalyze wrapper)
async function testForceFullAnalysis() {
  if (!state.preferences || !state.preferences.testerMode) {
    showToast('⚠️ 테스터 모드 ON 후 사용');
    return;
  }
  if (!_canAI()) {
    // 사용자 보고 2026-04-30: Phase C 후 키 모델 폐기 — 로그인이 게이트.
    showToast('⚠️ 로그인 필요 — 다시 로그인 해줘');
    return;
  }
  if (typeof forceAnalyze !== 'function') {
    showToast('⚠️ forceAnalyze 함수 X');
    return;
  }
  showToast('📊 통합 분석 진행 중... (시드 데이터 기반)');
  try {
    await forceAnalyze();
    showToast('✅ 통합 분석 완료 — 나 탭에서 확인 (NEW 항목 ✓ 맞아 / 아니야)');
  } catch (e) {
    showToast('❌ 분석 실패: ' + (e.message || ''));
  }
}

