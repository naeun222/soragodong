async function makeSquareThumb(dataUrl, size = 200, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const _settle = (v) => { if (done) return; done = true; resolve(v); };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const m = Math.min(img.width, img.height);
        const sx = (img.width - m) / 2;
        const sy = (img.height - m) / 2;
        ctx.drawImage(img, sx, sy, m, m, 0, 0, size, size);
        _settle(canvas.toDataURL('image/jpeg', quality));
      } catch(_) { _settle(null); }
    };
    // V4 fix v5 (사용자 보고 2026-05-04): img decode fail 시 promise hang 방지 — null resolve.
    img.onerror = () => _settle(null);
    setTimeout(() => _settle(null), 5000);
    img.src = dataUrl;
  });
}

async function verifyMissionPhoto(mission, photoBase64) {
  if (!_canAI()) {
    return { verified: true, reason: 'API 키가 없어서 통과.' };
  }
  const base64 = photoBase64.split(',')[1];
  // 사용자 명시 2026-05-11 ultrathink: prompt template backend 이전 — buildMissionVerifyText 가 합성. image part 보존, text part 만 server-side.
  const resp = await callAnthropic({
    _endpoint: 'mission_verify',
    _vars: { missionTitle: mission.title, missionDescription: mission.description || '' },
    // 사용자 요청 2026-04-30: 미션 사진 검증 = 단순 vision 분류 → haiku 4.5 (재시도 옵션 있어 안전).
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: '' }
      ]
    }]
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { verified: true, reason: '판단 어려워서 통과.' };
  try {
    const parsed = JSON.parse(match[0]);
    return { verified: !!parsed.verified, reason: parsed.reason || '통과.' };
  } catch {
    return { verified: true, reason: '파싱 실패라 통과.' };
  }
}

