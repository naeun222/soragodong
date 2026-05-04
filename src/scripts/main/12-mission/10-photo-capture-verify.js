async function captureAndVerifyMissionPhoto(mission) {
  const file = await pickPhotoFile();
  if (!file) return null;

  showFullscreenLoader('사진 확인 중... 🐚');
  try {
    const resized = await fileToResizedDataUrl(file, 1024);
    const thumb = await makeSquareThumb(resized, 200);
    const verification = await verifyMissionPhoto(mission, resized);
    hideFullscreenLoader();

    if (verification.verified) {
      // 인증 성공 → 짧은 succes 토스트 후 진행
      showToast('✓ 인증됨 — ' + verification.reason);
      return { thumb, verification };
    }
    // 실패 → 재시도 또는 취소
    const retry = await showConfirmModal({
      title: '⚠ 확인 안 됐어',
      message: verification.reason + '\n\n다시 찍어볼까?',
      okLabel: '📷 다시', cancelLabel: '취소'
    });
    if (retry) return captureAndVerifyMissionPhoto(mission);
    return null;
  } catch (err) {
    hideFullscreenLoader();
    // API 에러 시 fallback — 통과시켜 ADHD 사용자가 좌절 안 하도록
    const fallback = { verified: true, reason: '검증 못 했어. 통과시킬게.' };
    showToast('⚠ 검증 안 돼서 통과 처리.');
    try {
      const resized = await fileToResizedDataUrl(file, 1024);
      const thumb = await makeSquareThumb(resized, 200);
      return { thumb, verification: fallback };
    } catch {
      return { thumb: '', verification: fallback };
    }
  }
}

function pickPhotoFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // V3.13.x: capture 속성 제거 — iOS는 자동으로 '사진 촬영 / 사진 보관함 선택' action sheet 띄움
    // 알람 캡처 같은 스크린샷 미션도 갤러리에서 선택 가능
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      if (resolved) return; resolved = true;
      const file = input.files[0] || null;
      input.remove();
      resolve(file);
    });
    // Detect cancel via focus loss + empty files
    setTimeout(() => {
      window.addEventListener('focus', function once() {
        window.removeEventListener('focus', once);
        setTimeout(() => {
          if (resolved) return;
          if (!input.files || input.files.length === 0) {
            resolved = true;
            input.remove();
            resolve(null);
          }
        }, 400);
      }, { once: true });
    }, 100);
    input.click();
  });
}

// V4-fix: 사진 화질/용량 균형 (다른 앱들 수준) — quality 0.65 (용량 절약 우선)
async function fileToResizedDataUrl(file, maxSize = 1024, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// V4 fix v5 (사용자 명시 2026-05-04): 영상 진주 제목 = 이모티콘 prefix X.
// 옛 진주 / chat 추출 진주 등이 leading emoji 붙여 저장된 케이스 → 표시 시 strip.
// (음식/장소/순간 카테고리 icon prefix 는 사진 진주에서만 표시 — 영상은 bare content.)
