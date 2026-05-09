async function compressVideoWebCodecs(file, opts = {}) {
  // 사용자 명시 2026-05-03: trim UI = startTime opt 추가. startTime ~ startTime+maxSec 구간만 인코딩.
  const { maxSec = 5, targetHeight = 720, bitrate = 1_500_000, fps = 30, audioBitrate = 96_000, startTime = 0 } = opts;

  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('이 브라우저 동영상 압축 미지원 — iOS 17+ / Chrome 94+ 필요');
  }

  // public/mp4-muxer.mjs (npm 5.2.2 ESM, same-origin) — vite-plugin-html bare specifier 회피.
  // 변수 import URL = vite static analysis skip.
  let Muxer, ArrayBufferTarget;
  try {
    const muxerUrl = '/mp4-muxer.mjs';
    const mod = await import(/* @vite-ignore */ muxerUrl);
    Muxer = mod.Muxer;
    ArrayBufferTarget = mod.ArrayBufferTarget;
    if (typeof Muxer !== 'function' || typeof ArrayBufferTarget !== 'function') {
      throw new Error('export 구조 X (M=' + typeof Muxer + ', T=' + typeof ArrayBufferTarget + ')');
    }
  } catch (e) {
    console.error('mp4-muxer import error:', e, e && e.stack);
    throw new Error('압축 라이브러리 로드 실패: ' + (e.message || e.toString()).slice(0, 80));
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);

  const cleanup = () => {
    try { URL.revokeObjectURL(url); } catch(_) {}
    try { video.remove(); } catch(_) {}
  };

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('비디오 로드 실패'));
      setTimeout(() => rej(new Error('비디오 로드 timeout')), 10000);
    });

    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error('비디오 사이즈 읽기 실패');
    const scale = Math.min(1, targetHeight / h);
    const cw = Math.max(2, Math.round((w * scale) / 2) * 2);
    const ch = Math.max(2, Math.round((h * scale) / 2) * 2);

    if (video.readyState < 2) {
      await new Promise((res) => {
        video.addEventListener('canplay', res, { once: true });
        setTimeout(res, 3000);
      });
    }

    const codecCandidates = ['avc1.42001f', 'avc1.42E01E', 'avc1.4D401F'];
    let chosenCodec = '';
    for (const c of codecCandidates) {
      try {
        const sup = await VideoEncoder.isConfigSupported({
          codec: c, width: cw, height: ch, bitrate, framerate: fps
        });
        if (sup && sup.supported) { chosenCodec = c; break; }
      } catch(_) {}
    }
    if (!chosenCodec) throw new Error('H.264 인코더 미지원');

    // V4 fix v4: 오디오 트랙 디코드 시도 (실패해도 무음 fallback). decodeAudioData 는 file 전체 디코드.
    // 사용자 보고 2026-05-09: 무음 저장 시 사용자가 console 못 봄 (모바일 PWA) → 진단 reason 추적해서 결과에 동봉.
    let audioBuffer = null;
    let audioSampleRate = 0;
    let audioChannels = 0;
    let audioCodec = '';
    let audioFailReason = null;        // 사용자 노출 메시지
    let audioFailDetail = null;        // 사용자 노출 추가 정보
    // 사용자 명시 2026-05-03: decode path = full file → audio encode = startTime 부터 trim.
    // captureStream fallback path = relative (0 부터 maxSec 까지만) → encode = 0 부터 trim.
    let _audioStartOffset = startTime;
    try {
      if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
        audioFailReason = 'AudioEncoder API 미지원';
        audioFailDetail = '이 브라우저는 WebCodecs AudioEncoder 지원 X. Chrome 94+ / Edge / Safari 17+ 필요.';
      } else {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          audioFailReason = 'AudioContext API 미지원';
          audioFailDetail = '이 브라우저는 Web Audio API 지원 X.';
        } else {
          const ab = await file.arrayBuffer();
          const tmpCtx = new AC();
          // Safari 호환 — promise + callback 혼용 가드
          audioBuffer = await new Promise((res, rej) => {
            // 사용자 보고 2026-05-03: Safari 의 옛 callback API 가 errorCallback 을 null/undefined 인자로 빈 호출하는 케이스 (e=null = 정보 X).
            // wrap → 의미 있는 Error 객체로 변환. audio track 없음 / 미지원 / corrupt 셋 다 가능.
            const _safeReject = (err) => {
              if (err == null) {
                rej(new Error('audio track 없음 또는 Safari decodeAudioData 의 빈 errorCallback (Codec 미지원 가능)'));
              } else {
                rej(err);
              }
            };
            try {
              const p = tmpCtx.decodeAudioData(ab.slice(0), res, _safeReject);
              if (p && typeof p.then === 'function') p.then(res, _safeReject);
            } catch (e) { _safeReject(e); }
          });
          try { tmpCtx.close(); } catch(_) {}
          if (audioBuffer && audioBuffer.numberOfChannels > 0 && audioBuffer.length > 0) {
            audioSampleRate = audioBuffer.sampleRate;
            audioChannels = Math.min(2, audioBuffer.numberOfChannels);
            // 사용자 보고 2026-05-09 ultrathink: 무음 진주 진단 — codec 후보 확장 + 진단 로그 + 빈 audioBuffer 케이스 분리.
            // 사용자 명시 2026-05-10 (재정정 — Opus 시도): mp4-muxer 5.2.2 가 ['aac','opus'] 둘 다 지원.
            // Opus 우선 시도 (mp4 안 opus track Chrome/Firefox/Safari 17+ 호환성 ↑) — AAC mp4 의 silently muted issue
            // 회피 시도. Opus 미지원 sr (예: 44100) 또는 isConfigSupported false 시 AAC fallback.
            // Opus sr 제약: 8/12/16/24/48 kHz 만. 다른 sr 은 AAC.
            const opusOk = [8000, 12000, 16000, 24000, 48000].includes(audioSampleRate);
            const candidates = [
              ...(opusOk ? ['opus'] : []),
              'mp4a.40.2', 'mp4a.40.5', 'mp4a.40.29',
            ];
            for (const c of candidates) {
              try {
                const sup = await AudioEncoder.isConfigSupported({
                  codec: c, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: audioBitrate
                });
                console.log('[video] codec isConfigSupported', c, 'sr=' + audioSampleRate, 'ch=' + audioChannels, '→', sup?.supported);
                if (sup && sup.supported) { audioCodec = c; break; }
              } catch(e) {
                console.log('[video] codec isConfigSupported throw', c, e?.message);
              }
            }
            if (!audioCodec) {
              console.warn('[video] audio codec 모두 미지원 — 무음 저장. sr=' + audioSampleRate + ' ch=' + audioChannels);
              audioFailReason = 'audio 인코더 미지원';
              audioFailDetail = `브라우저가 opus / mp4a.40.2 / mp4a.40.5 / mp4a.40.29 모두 미지원. (sr=${audioSampleRate}, ch=${audioChannels})`;
              audioBuffer = null;
            }
          } else {
            console.warn('[video] decodeAudioData 결과 audioBuffer 비어있음', audioBuffer?.numberOfChannels, audioBuffer?.length);
            audioFailReason = '영상에 audio track 없음';
            audioFailDetail = `decodeAudioData 결과 ch=${audioBuffer?.numberOfChannels || 0} length=${audioBuffer?.length || 0}. 원본 영상이 무음일 수 있음.`;
            audioBuffer = null;
          }
        }
      }
    } catch (e) {
      // 사용자 명시 2026-05-03: decodeAudioData 실패 시 (.mov / iOS Safari 호환) → captureStream fallback 시도.
      console.warn('[video] decodeAudioData fail, captureStream fallback 시도:', e?.message);
      try {
        const captured = await _captureAudioFromVideo(file, startTime, startTime + maxSec, 48000);
        if (captured && captured.numberOfChannels > 0 && captured.length > 0) {
          audioBuffer = captured;
          audioSampleRate = captured.sampleRate;
          audioChannels = Math.min(2, captured.numberOfChannels);
          // 사용자 명시 2026-05-10: capture path 도 Opus 우선 + AAC fallback.
          const capOpusOk = [8000, 12000, 16000, 24000, 48000].includes(audioSampleRate);
          const capCandidates = [
            ...(capOpusOk ? ['opus'] : []),
            'mp4a.40.2', 'mp4a.40.5', 'mp4a.40.29',
          ];
          for (const c of capCandidates) {
            try {
              const sup = await AudioEncoder.isConfigSupported({
                codec: c, sampleRate: audioSampleRate, numberOfChannels: audioChannels, bitrate: audioBitrate
              });
              console.log('[video] capture codec isConfigSupported', c, 'sr=' + audioSampleRate, 'ch=' + audioChannels, '→', sup?.supported);
              if (sup && sup.supported) { audioCodec = c; break; }
            } catch(e) {
              console.log('[video] capture codec isConfigSupported throw', c, e?.message);
            }
          }
          if (!audioCodec) {
            console.warn('[video] capture: codec 모두 미지원 — 무음 저장');
            audioFailReason = 'audio 인코더 미지원 (capture fallback)';
            audioFailDetail = `captureStream 으로 audio 잡았지만 opus / mp4a.40.2 / 40.5 / 40.29 모두 미지원. (sr=${audioSampleRate}, ch=${audioChannels})`;
            audioBuffer = null;
          }
          // capture path = relative (0 ~ maxSec) → encode startSample = 0
          _audioStartOffset = 0;
          console.log('[video] captureStream fallback 성공, sr=' + audioSampleRate + ' ch=' + audioChannels);
        } else {
          audioFailReason = 'captureStream fallback 빈 audio';
          audioFailDetail = `captureStream 으로 audio 잡았는데 ch=${captured?.numberOfChannels || 0} length=${captured?.length || 0}.`;
          audioBuffer = null;
        }
      } catch (captureFail) {
        // 둘 다 fail = 오류 모달 + 무음
        console.error('[video compress] audio decode + capture 둘 다 fail:', e, captureFail);
        const _fileInfo = `type: ${file?.type || '?'}\nsize: ${(file?.size || 0).toLocaleString()} bytes`;
        const _decodeErr = e == null ? '(error 정보 X)' : `${e?.name || 'Error'}: ${e?.message || String(e)}`;
        const _captureErr = captureFail == null ? '(error 정보 X)' : `${captureFail?.name || 'Error'}: ${captureFail?.message || String(captureFail)}`;
        if (typeof _reportErrorToAdmin === 'function') {
          _reportErrorToAdmin('영상 진주 audio 둘 다 fail', `${_fileInfo}\n\n[decodeAudioData]\n${_decodeErr}\n\n[captureStream]\n${_captureErr}\n\n${captureFail?.stack || '(no stack)'}`).catch(() => {});
        }
        // 사용자 보고 2026-05-09: 둘 다 fail 케이스 reason 동봉 — 29-music.js 가 modal 노출 (옛: 여기서 직접 modal 호출 → duplicate 회피 위해 제거).
        audioFailReason = 'audio decode + capture 둘 다 실패';
        audioFailDetail = `[file]\n${_fileInfo}\n\n[decodeAudioData]\n${_decodeErr}\n\n[captureStream fallback]\n${_captureErr}`;
        audioBuffer = null;
      }
    }

    const muxerOpts = {
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: cw, height: ch, frameRate: fps },
      fastStart: 'in-memory',
      // 사용자 보고 2026-05-02 (자동 오류 보고): iOS Safari 의 첫 chunk DTS != 0 (예: 0.174322) 케이스.
      // 원인: Safari 가 frame timestamp 를 document age 기준 계산 → mp4-muxer strict 검증 reject.
      // fix: firstTimestampBehavior: 'offset' = 첫 chunk timestamp 를 0 으로 자동 보정.
      firstTimestampBehavior: 'offset'
    };
    if (audioBuffer) {
      // 사용자 명시 2026-05-10: audioCodec 'opus' / 'mp4a.40.x' 에 따라 muxer codec 분기.
      // mp4-muxer 5.2.2 = SUPPORTED_AUDIO_CODECS = ['aac', 'opus'].
      const muxerAudioCodec = audioCodec === 'opus' ? 'opus' : 'aac';
      muxerOpts.audio = { codec: muxerAudioCodec, numberOfChannels: audioChannels, sampleRate: audioSampleRate };
      console.log('[video] muxer audio codec=' + muxerAudioCodec + ' (encoder=' + audioCodec + ')');
    }
    const muxer = new Muxer(muxerOpts);

    let encoderError = null;
    // V4 fix v5 (사용자 보고 2026-05-04): mp4-muxer v5 가 track.info.decoderConfig.colorSpace 의 4 필드 모두 필요.
    // partial colorSpace (예: { primaries: undefined } 만 있는 케이스) 도 fail. 항상 4필드 force-merge.
    const _DEFAULT_CS = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          let safeMeta = meta;
          if (meta && meta.decoderConfig) {
            const cs = meta.decoderConfig.colorSpace || {};
            safeMeta = {
              ...meta,
              decoderConfig: {
                ...meta.decoderConfig,
                colorSpace: {
                  primaries: cs.primaries || _DEFAULT_CS.primaries,
                  transfer: cs.transfer || _DEFAULT_CS.transfer,
                  matrix: cs.matrix || _DEFAULT_CS.matrix,
                  fullRange: typeof cs.fullRange === 'boolean' ? cs.fullRange : _DEFAULT_CS.fullRange
                }
              }
            };
          }
          // chunk.duration null 가드 — Safari WebCodec 일부 케이스 chunk.duration null → addVideoChunkRaw fail.
          // mp4-muxer 4번째 인자 = explicit duration override (microseconds).
          const dur = (chunk && typeof chunk.duration === 'number' && chunk.duration >= 0)
            ? chunk.duration
            : Math.round(1e6 / fps);
          muxer.addVideoChunk(chunk, safeMeta, undefined, dur);
        } catch (err) {
          encoderError = err || new Error('addVideoChunk fail (err empty)');
        }
      },
      // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): Safari 가 error callback 을 null/undefined 인자로 호출하는 케이스 → encoderError = null → infinite loop.
      // 의미 있는 Error 로 wrap.
      error: (e) => { encoderError = e || new Error('VideoEncoder error (empty callback)'); }
    });
    encoder.configure({ codec: chosenCodec, width: cw, height: ch, bitrate, framerate: fps });

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    // 사용자 명시 2026-05-03: trim UI = startTime set + seeked await. play() = startTime 부터 시작.
    if (startTime > 0) {
      await new Promise((res) => {
        const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res(); };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = startTime;
        setTimeout(res, 2000);  // safety timeout
      });
    }

    try {
      await video.play();
    } catch (e) {
      throw new Error('동영상 재생 시작 실패');
    }

    let frameIdx = 0;
    let firstFrameThumb = null;
    const startCt = video.currentTime;
    const frameDurationUs = Math.round(1e6 / fps);
    // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): rAF fallback (Safari 17.4 미만 = requestVideoFrameCallback X) 또는
    // video stalled 케이스 무한 루프 방지 — frame count safety cap.
    const maxFrames = Math.ceil(maxSec * fps) + 4;

    await new Promise((resolveLoop, rejectLoop) => {
      const onFrame = () => {
        try {
          if (encoderError) return rejectLoop(encoderError);
          const wallTs = video.currentTime - startCt;
          // V4 fix v6: wallTs > maxSec 또는 video.ended 또는 maxFrames 도달 → 종료.
          if (wallTs > maxSec || video.ended || frameIdx >= maxFrames) return resolveLoop();
          // V4 fix v6: wallTs >= 0 가드 — Safari 일부 케이스 currentTime 이 startCt 보다 살짝 작게 진동 → 음수 wallTs.
          // 음수 timestamp 는 mp4-muxer 가 reject ("must be non-negative") + VideoFrame 자체도 throw. → frame skip, 다음 callback 대기.
          if (video.readyState >= 2 && wallTs >= 0) {
            ctx.drawImage(video, 0, 0, cw, ch);
            // V4 (사용자 명시): 첫 frame 으로 썸네일 추출 (사진처럼 표시)
            if (frameIdx === 0) {
              try { firstFrameThumb = canvas.toDataURL('image/jpeg', 0.7); } catch(_) {}
            }
            // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): timestamp = frameIdx * frameDurationUs (단조 증가 + 음수 X 보장).
            // 직전 wallTs * 1e6 직접 사용 시 Safari currentTime 비단조 케이스 → mp4-muxer reject ("DTS must be monotonic" / "non-negative").
            // duration 명시 — mp4-muxer v5 가 chunk.duration null 거부
            const frame = new VideoFrame(canvas, {
              timestamp: frameIdx * frameDurationUs,
              duration: frameDurationUs
            });
            encoder.encode(frame, { keyFrame: frameIdx % (fps * 2) === 0 });
            frame.close();
            frameIdx++;
          }
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(onFrame);
          } else {
            requestAnimationFrame(onFrame);
          }
        } catch (e) {
          rejectLoop(e);
        }
      };
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
      setTimeout(() => resolveLoop(), (maxSec + 3) * 1000);
    });

    try { video.pause(); } catch(_) {}
    if (frameIdx === 0) throw new Error('녹화된 frame 없음');

    await encoder.flush();
    encoder.close();

    // V4 fix v4: 오디오 인코딩 (있을 때만). maxSec 만큼만 잘라 인코딩.
    // 사용자 보고 2026-05-09 (재정정): audioChunksEmitted 를 outer scope 으로 — 결과 audioMeta 동봉용.
    let audioChunksEmitted = 0;
    if (audioBuffer) {
      try {
        let audioErr = null;
        // 사용자 보고 2026-05-09: audio 가 chunk 0 emit silent fail (Safari/iOS) 케이스 → 무음 + modal X 였음.
        // chunk emit count 추적해서 0 이면 명시 throw → catch 분기 진입 → reason set + audioBuffer=null.
        // V4 fix v5 (사용자 보고 2026-05-04): Safari AudioEncoder 가 chunk.duration null/0 emit 가능 → addAudioChunkRaw fail.
        // 명시적 duration override (samples / sampleRate * 1e6 microseconds).
        const aenc = new AudioEncoder({
          output: (chunk, meta) => {
            audioChunksEmitted++;
            try {
              const dur = (chunk && typeof chunk.duration === 'number' && chunk.duration > 0)
                ? chunk.duration
                : Math.round((1024 / audioSampleRate) * 1e6);
              muxer.addAudioChunk(chunk, meta, undefined, dur);
            } catch (err) { audioErr = err || new Error('addAudioChunk fail (err empty)'); }
          },
          // V4 fix v6 (사용자 보고 ultrathink 2026-05-04): Safari empty error callback 가드 — null audioErr 면 catch 못 함.
          error: (e) => { audioErr = e || new Error('AudioEncoder error (empty callback)'); }
        });
        aenc.configure({
          codec: audioCodec,
          sampleRate: audioSampleRate,
          numberOfChannels: audioChannels,
          bitrate: audioBitrate
        });

        // 사용자 명시 2026-05-03: trim UI = startSample 추가. _audioStartOffset 부터 maxSec 만큼 인코딩.
        // decode path = full file → _audioStartOffset = startTime / capture fallback = relative → _audioStartOffset = 0.
        const startSample = Math.max(0, Math.round(_audioStartOffset * audioSampleRate));
        const endSample = Math.min(audioBuffer.length, startSample + Math.round(maxSec * audioSampleRate));
        const totalSamples = endSample - startSample;
        // 채널 인터리브 (planar f32 → interleaved f32)
        const ch0 = audioBuffer.getChannelData(0);
        const ch1 = audioChannels > 1 ? audioBuffer.getChannelData(1) : null;
        // 1024 샘플씩 chunk (AAC frame 크기 ≈)
        const CHUNK = 1024;
        for (let rel = 0; rel < totalSamples; rel += CHUNK) {
          if (audioErr) throw audioErr;
          const len = Math.min(CHUNK, totalSamples - rel);
          const off = startSample + rel;
          const interleaved = new Float32Array(len * audioChannels);
          if (audioChannels === 1) {
            interleaved.set(ch0.subarray(off, off + len));
          } else {
            for (let i = 0; i < len; i++) {
              interleaved[i * 2] = ch0[off + i];
              interleaved[i * 2 + 1] = ch1[off + i];
            }
          }
          const ad = new AudioData({
            format: 'f32',
            sampleRate: audioSampleRate,
            numberOfFrames: len,
            numberOfChannels: audioChannels,
            timestamp: Math.round((rel / audioSampleRate) * 1e6),
            data: interleaved
          });
          aenc.encode(ad);
          ad.close();
        }
        await aenc.flush();
        aenc.close();
        if (audioErr) throw audioErr;
        // 사용자 보고 2026-05-09: chunk 0 emit silent fail 가드 — 옛 코드는 catch 안 들어가서 무음 + modal X 였음.
        // throw 하면 아래 catch 진입 → audioBuffer=null + reason set → 29-music.js modal 노출.
        if (audioChunksEmitted === 0) {
          throw new Error(`AudioEncoder chunk 0 emit (silent fail). codec=${audioCodec} sr=${audioSampleRate} ch=${audioChannels} totalSamples=${totalSamples}`);
        }
        console.log('[video] audio encoded ' + audioChunksEmitted + ' chunks');
      } catch (audioFail) {
        // 사용자 명시 2026-05-03: toast → 오류 모달 + audioFail null 케이스에 의미 있는 메시지.
        console.error('[video compress] audio encode 실패 (무음으로 진행):', audioFail, audioFail?.stack);
        const _cfgInfo = `codec=${audioCodec || '?'} sr=${audioSampleRate} ch=${audioChannels} bitrate=${audioBitrate}`;
        const _errInfo = audioFail == null
          ? '(error 정보 X — encoder 의 빈 error callback)'
          : `${audioFail?.name || 'Error'}: ${audioFail?.message || String(audioFail)}`;
        if (typeof _reportErrorToAdmin === 'function') {
          _reportErrorToAdmin('영상 진주 audio encode 실패', `${_cfgInfo}\n\n${_errInfo}\n\n${audioFail?.stack || '(no stack)'}`).catch(() => {});
        }
        // 사용자 보고 2026-05-09: showErrorDetailModal 직접 호출 제거 — 29-music.js 가 통합 modal (duplicate 회피).
        // audioBuffer=null + reason set 으로 result.hasAudio=false → 호출자 modal 노출.
        audioFailReason = 'audio 인코딩 실패';
        audioFailDetail = `[config]\n${_cfgInfo}\n\n[error]\n${_errInfo}\n\n[stack]\n${(audioFail?.stack || '(no stack)').slice(0, 500)}`;
        audioBuffer = null;
      }
    }

    muxer.finalize();

    const buffer = muxer.target.buffer;
    if (!buffer || buffer.byteLength < 1000) throw new Error('압축 결과 너무 작음');

    const blob = new Blob([buffer], { type: 'video/mp4' });
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(new Error('dataURL 변환 실패'));
      reader.readAsDataURL(blob);
    });

    // V4 (사용자 명시): 썸네일 — 사진처럼 정사각 600px JPEG q=0.7 (사진과 동일 형식)
    let thumbnail = null;
    if (firstFrameThumb && typeof makeSquareThumb === 'function') {
      try { thumbnail = await makeSquareThumb(firstFrameThumb, 600, 0.7); } catch(_) {}
    }

    cleanup();
    // 사용자 보고 2026-05-02 ultrathink: hasAudio 메타 넣음 — 옛 진주 (audio fix 전 encoded = audio track X) vs 새 진주 (audio O) 구분.
    // 사용자 보고 2026-05-09: PWA 모바일에서 console 못 봄 → 무음 원인 reason / detail 도 동봉. 호출자가 modal 로 노출.
    // 사용자 보고 2026-05-09 (재정정): hasAudio=true 인데 무음 들리는 케이스 — chunk 수 / codec / sr / ch 도 동봉 (success 도) → toast 진단.
    const _audioMeta = {
      chunksEmitted: audioChunksEmitted,
      codec: audioCodec || null,
      sr: audioSampleRate || null,
      ch: audioChannels || null,
    };
    return {
      videoUrl: dataUrl,
      thumbnail,
      hasAudio: !!audioBuffer,
      audioFailReason: audioBuffer ? null : (audioFailReason || '알 수 없는 원인'),
      audioFailDetail: audioBuffer ? null : (audioFailDetail || ''),
      audioMeta: _audioMeta,
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}

// V4-fix: 정사각 thumb (용량 절약 우선, 인증샷 검증용은 작은 size로 호출됨)
