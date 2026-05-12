// POST /api/embeddings/bge
// V4 (사용자 명시 2026-05-13 ultrathink): RAG embedding endpoint — Cloudflare Workers AI BGE-M3.
//
// 사용처:
//   - chatArchive 생성 시 평문 요약 → embedding 벡터 → state.archiveEmbeddings 저장 (1회성).
//   - 사용자 chat 메시지 보낼 때 query → embedding → 클라이언트 측 cosine + MMR retrieve.
//
// Privacy: Cloudflare AI binding = 우리 backend infrastructure 안에서 처리.
//   외부 partner (Voyage 등) 미사용. E2EE 정책 정합.
//   ⚠ 단 archive 평문 자체는 한 번 외부 API 노출됨 — Cloudflare 의 ZDR 정책 의존.
//
// 모델: '@cf/baai/bge-m3' (multilingual, 1024 dim, 한국어 강함).
//
// 비용: 100K req/일 무료. 그 후 paid (~$0.011/1K neurons).
//   사용자 3000명 도달 시 Voyage 와 재비교 — USER_TODO P2-10-3.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface EnvWithAI extends Env {
  AI: {
    run(model: string, input: any): Promise<any>;
  };
}

const MAX_TEXT_LEN = 8000;  // 한국어 ~ 3000-4000 자, 영어 ~ 2000 토큰

export async function onRequestPost(context: { request: Request; env: EnvWithAI }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse({
      error: 'AI binding 미설정 — wrangler.jsonc 의 [ai] binding 확인 + Cloudflare Pages 재배포 필요.',
      code: 'AI_BINDING_MISSING'
    }, 500);
  }

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid JSON' }, 400); }

  const text = body?.text;
  if (!text || typeof text !== 'string') {
    return jsonResponse({ error: 'text (string) 필수' }, 400);
  }
  if (text.length > MAX_TEXT_LEN) {
    return jsonResponse({
      error: `text 너무 김 (max ${MAX_TEXT_LEN} chars). 자르거나 요약 후 다시.`,
      code: 'TEXT_TOO_LONG'
    }, 400);
  }

  try {
    // BGE-M3 input format: { text: string | string[] }. 응답: { shape: [N, 1024], data: number[N][1024] }.
    const result: any = await env.AI.run('@cf/baai/bge-m3', { text: [text] });
    const embedding = result?.data?.[0];
    if (!Array.isArray(embedding) || embedding.length < 100) {
      console.error('[embeddings/bge] unexpected response shape:', result);
      return jsonResponse({ error: 'embedding 생성 실패 — 응답 형식 오류', code: 'INVALID_RESPONSE' }, 502);
    }
    return jsonResponse({ embedding, dim: embedding.length });
  } catch (e: any) {
    console.error('[embeddings/bge] AI.run throw:', e?.message || e);
    return jsonResponse({
      error: 'embedding service error: ' + (e?.message || String(e)),
      code: 'AI_RUN_ERROR'
    }, 502);
  }
}
