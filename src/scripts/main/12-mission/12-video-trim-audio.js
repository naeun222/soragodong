// 사용자 명시 2026-05-10 (재정정): 자르기 modal — 동영상 미리 재생 (video element + controls) 복구.
// 단 썸네일 strip 8장 + "미리보기 만드는 중..." 흐름은 영구 제거. 손잡이 drag 시 video.currentTime 도 함께 seek.
async function pickVideoTrimRange(file, maxSec) {
  maxSec = maxSec || 5;
  _vtmState = null;
  document.querySelectorAll('.vtm-overlay').forEach(o => { try { o.remove(); } catch(_) {} });

  const dur = await _getVideoDuration(file);
  if (!Number.isFinite(dur) || dur <= 0.05) {
    try { showToast('영상 길이 읽기 실패 — 다른 영상 시도'); } catch(_) {}
    return null;
  }

  const previewUrl = URL.createObjectURL(file);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'vtm-overlay';
    overlay.innerHTML = `
      <div class="vtm-card">
        <div class="vtm-title">영상 자르기 (최대 ${maxSec}초)</div>
        <div class="vtm-sub">손잡이 끌어서 ${maxSec}초 구간 골라</div>
        <div class="vtm-video-wrap">
          <video class="vtm-video" controls playsinline preload="metadata"></video>
        </div>
        <div class="vtm-track">
          <div class="vtm-selection"></div>
          <div class="vtm-handle vtm-handle-start"></div>
          <div class="vtm-handle vtm-handle-end"></div>
        </div>
        <div class="vtm-meta">
          <span class="vtm-meta-start">0.0s</span>
          <span class="vtm-meta-dur">0.0s</span>
          <span class="vtm-meta-end">0.0s</span>
        </div>
        <div class="vtm-actions">
          <button class="vtm-btn vtm-btn-cancel">취소</button>
          <button class="vtm-btn primary vtm-btn-ok">자르기 ✦</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const videoEl = overlay.querySelector('.vtm-video');
    videoEl.src = previewUrl;
    videoEl.muted = false;
    videoEl.volume = 1.0;

    let cleaned = false;
    const cleanup = (result) => {
      if (cleaned) return; cleaned = true;
      try { videoEl.pause(); } catch(_) {}
      try { videoEl.removeAttribute('src'); videoEl.load(); } catch(_) {}
      try { URL.revokeObjectURL(previewUrl); } catch(_) {}
      overlay.classList.remove('show');
      setTimeout(() => { try { overlay.remove(); } catch(_) {} _vtmState = null; resolve(result); }, 180);
    };

    _vtmState = { dur, start: 0, end: Math.min(maxSec, dur), maxSec, overlay };
    const minSel = Math.min(0.5, dur);

    const sel = overlay.querySelector('.vtm-selection');
    const hStart = overlay.querySelector('.vtm-handle-start');
    const hEnd = overlay.querySelector('.vtm-handle-end');
    const track = overlay.querySelector('.vtm-track');
    const lblS = overlay.querySelector('.vtm-meta-start');
    const lblE = overlay.querySelector('.vtm-meta-end');
    const lblD = overlay.querySelector('.vtm-meta-dur');

    const render = () => {
      const sP = (_vtmState.start / dur) * 100;
      const eP = (_vtmState.end / dur) * 100;
      sel.style.left = sP + '%';
      sel.style.width = (eP - sP) + '%';
      hStart.style.left = sP + '%';
      hEnd.style.left = eP + '%';
      lblS.textContent = _vtmState.start.toFixed(1) + 's';
      lblE.textContent = _vtmState.end.toFixed(1) + 's';
      lblD.textContent = (_vtmState.end - _vtmState.start).toFixed(1) + 's';
    };

    // drag 도중 video 를 seek 해서 자른 구간이 시각적으로 보이게.
    let _seekBusy = false;
    let _pendingSeek = null;
    const seekTo = (t) => {
      if (_seekBusy) { _pendingSeek = t; return; }
      _seekBusy = true;
      try { videoEl.pause(); } catch(_) {}
      const onSeeked = () => {
        videoEl.removeEventListener('seeked', onSeeked);
        _seekBusy = false;
        if (_pendingSeek != null) {
          const next = _pendingSeek; _pendingSeek = null;
          seekTo(next);
        }
      };
      videoEl.addEventListener('seeked', onSeeked);
      try { videoEl.currentTime = Math.max(0, Math.min(dur - 0.01, t)); } catch(_) { _seekBusy = false; }
    };

    const dragHandle = (handle, isStart) => {
      const onDown = (e) => {
        e.preventDefault();
        const onMove = (ev) => {
          const rect = track.getBoundingClientRect();
          const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
          const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
          const t = pct * dur;
          if (isStart) {
            _vtmState.start = Math.min(t, _vtmState.end - minSel);
            if (_vtmState.start < 0) _vtmState.start = 0;
            if (_vtmState.end - _vtmState.start > maxSec) _vtmState.end = _vtmState.start + maxSec;
            seekTo(_vtmState.start);
          } else {
            _vtmState.end = Math.max(t, _vtmState.start + minSel);
            if (_vtmState.end > dur) _vtmState.end = dur;
            if (_vtmState.end - _vtmState.start > maxSec) _vtmState.start = _vtmState.end - maxSec;
            seekTo(_vtmState.end);
          }
          render();
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
      };
      handle.addEventListener('mousedown', onDown);
      handle.addEventListener('touchstart', onDown, { passive: false });
    };
    dragHandle(hStart, true);
    dragHandle(hEnd, false);
    render();

    overlay.querySelector('.vtm-btn-ok').onclick = () => {
      cleanup({ startTime: _vtmState.start, endTime: _vtmState.end });
    };
    overlay.querySelector('.vtm-btn-cancel').onclick = () => cleanup(null);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    setTimeout(() => overlay.classList.add('show'), 10);
  });
}

// 사용자 명시 2026-05-03: .mov / iOS Safari decodeAudioData 미지원 fallback.
// video element captureStream + AudioContext.createMediaStreamSource + ScriptProcessor 로 capture.
// 5초 영상 = real-time 5초 처리 — UX 는 fullscreen loader 표시로 OK.
async function _captureAudioFromVideo(file, startSec, endSec, sampleRate) {
  return new Promise(async (resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.muted = false;
    v.volume = 1.0;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true;
      try { v.pause(); } catch(_) {}
      try { v.remove(); } catch(_) {}
      try { URL.revokeObjectURL(url); } catch(_) {}
    };

    try {
      await new Promise((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error('비디오 로드 실패'));
        setTimeout(() => rej(new Error('비디오 로드 timeout')), 8000);
      });

      // 사용자 보고 2026-05-03 ultrathink: iOS Safari 의 captureStream 미지원 → createMediaElementSource fallback path 추가.
      // path A (Chrome / Firefox / Edge): v.captureStream() → MediaStreamSource → ScriptProcessor
      // path B (iOS Safari 14+): createMediaElementSource(v) → ScriptProcessor → gain(0) → destination
      const hasCaptureStream = typeof v.captureStream === 'function';
      let usePathB = !hasCaptureStream;

      // startSec seek (path A/B 공통)
      if (startSec > 0) {
        await new Promise((res) => {
          let done = false;
          const onSeeked = () => { if (done) return; done = true; v.removeEventListener('seeked', onSeeked); res(); };
          v.addEventListener('seeked', onSeeked);
          try { v.currentTime = startSec; } catch(_) { onSeeked(); }
          setTimeout(() => { if (!done) onSeeked(); }, 2000);
        });
      }

      // path A 시도 (지원 시) — audio track 없으면 path B 로 fallback
      let stream = null;
      if (!usePathB) {
        try {
          stream = v.captureStream();
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
            stream = null;
            usePathB = true;
          }
        } catch (_) {
          stream = null;
          usePathB = true;
        }
      }

      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): path B (createMediaElementSource = iOS Safari 17.4 이하 fallback) 는
      // source 의 native sampleRate 와 ctx.sampleRate 가 일치해야 throw 안 함. ctx 에 강제 sampleRate 옵션 주면 mismatch → throw.
      // → path B 시 인자 없이 default 로 만들어 system 매칭. path A (captureStream) 는 createMediaStreamSource 가 자동 resample 이라 OK.
      if (usePathB) {
        try { ctx = new AC(); } catch(e) {
          cleanup();
          return reject(new Error('AudioContext 생성 실패: ' + (e?.message || e)));
        }
      } else {
        try { ctx = new AC({ sampleRate }); } catch(_) { ctx = new AC(); }
      }
      // iOS Safari = AudioContext suspended start. 명시적 resume 필요.
      try { if (ctx.state === 'suspended') await ctx.resume(); } catch(_) {}
      const actualSR = ctx.sampleRate;

      const BUFFER = 4096;
      const numCh = 2;
      const captured = [[], []];

      let source = null;
      let processor = null;
      let gain = null;

      const onProcess = (e) => {
        const ib = e.inputBuffer;
        const ch0 = ib.getChannelData(0);
        const ch1 = ib.numberOfChannels > 1 ? ib.getChannelData(1) : ch0;
        captured[0].push(new Float32Array(ch0));
        captured[1].push(new Float32Array(ch1));
      };

      if (usePathB) {
        // path B: createMediaElementSource — iOS Safari fallback
        try {
          source = ctx.createMediaElementSource(v);
        } catch (e) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return reject(new Error('createMediaElementSource 실패: ' + (e?.message || e)));
        }
        // ScriptProcessor onaudioprocess trigger 위해 destination 연결 필요 + 사용자 무음 = gain 0
        gain = ctx.createGain();
        gain.gain.value = 0;
        processor = ctx.createScriptProcessor(BUFFER, numCh, numCh);
        processor.onaudioprocess = onProcess;
        source.connect(processor);
        processor.connect(gain);
        gain.connect(ctx.destination);
      } else {
        // path A: captureStream
        source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(BUFFER, numCh, numCh);
        processor.onaudioprocess = onProcess;
        source.connect(processor);
        processor.connect(ctx.destination);
      }

      let stopped = false;
      const finish = (err) => {
        if (stopped) return; stopped = true;
        try { v.pause(); } catch(_) {}
        try { if (processor) processor.disconnect(); } catch(_) {}
        try { if (source) source.disconnect(); } catch(_) {}
        try { if (gain) gain.disconnect(); } catch(_) {}
        try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch(_) {}
        if (err) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return reject(err);
        }
        const totalLen = captured[0].reduce((a, c) => a + c.length, 0);
        if (totalLen === 0) {
          try { ctx.close(); } catch(_) {}
          cleanup();
          return resolve(null);
        }
        const buf = ctx.createBuffer(numCh, totalLen, actualSR);
        let off0 = 0, off1 = 0;
        for (const chunk of captured[0]) { buf.copyToChannel(chunk, 0, off0); off0 += chunk.length; }
        for (const chunk of captured[1]) { buf.copyToChannel(chunk, 1, off1); off1 += chunk.length; }
        try { ctx.close(); } catch(_) {}
        cleanup();
        resolve(buf);
      };

      try {
        await v.play();
      } catch (e) {
        return finish(new Error('비디오 재생 실패: ' + (e?.message || e)));
      }

      const durSec = endSec - startSec;
      const watchT = setInterval(() => {
        const cur = v.currentTime;
        if (cur >= endSec || v.ended) {
          clearInterval(watchT);
          finish(null);
        }
      }, 50);
      // safety timeout = duration * 2 + 5초
      setTimeout(() => { clearInterval(watchT); finish(null); }, durSec * 1000 * 2 + 5000);

    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// V4 fix v3 (사용자 명시 ultrathink): WebCodecs API 동영상 압축 — 4K → 720p 다운스케일 + H.264 mp4.
// mp4-muxer CDN dynamic import (~30KB, 첫 사용 시만 fetch). iOS 17+ / Chrome 94+ 지원.
// V4 fix v4 (사용자 보고): 오디오 트랙 추가 — AudioEncoder(AAC) + decodeAudioData. 무음이던 진주 동영상 소리 복구.
// 직전 MediaRecorder broken 의심 우회.
