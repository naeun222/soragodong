import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, formatDateKorean } from '../src/utils/format';

describe('format utils', () => {
  describe('escapeHtml', () => {
    it('falsy 입력은 빈 문자열', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(0)).toBe('');
    });

    it('일반 문자열은 그대로', () => {
      expect(escapeHtml('hello')).toBe('hello');
      expect(escapeHtml('안녕')).toBe('안녕');
      expect(escapeHtml('emoji 🐚 OK')).toBe('emoji 🐚 OK');
    });

    it('5가지 특수문자 각각 entity로 변환', () => {
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml("'")).toBe('&#39;');
    });

    it('XSS 시도 패턴 — 모두 escape', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('숫자 등 비문자 입력도 String() 강제 변환', () => {
      expect(escapeHtml(42)).toBe('42');
      expect(escapeHtml(true)).toBe('true');
    });

    it('일반 + 특수문자 혼합', () => {
      expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
    });
  });

  describe('formatDateKorean', () => {
    it('빈 문자열 → 빈 문자열', () => {
      expect(formatDateKorean('')).toBe('');
    });

    it('오늘 → "오늘 · " 접두사', () => {
      const fixed = new Date('2026-04-29T12:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      expect(formatDateKorean('2026-04-29')).toMatch(/^오늘 · /);
      vi.useRealTimers();
    });

    it('어제 → "어제 · " 접두사', () => {
      const fixed = new Date('2026-04-29T12:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      expect(formatDateKorean('2026-04-28')).toMatch(/^어제 · /);
      vi.useRealTimers();
    });

    it('그 외 날짜 → 연도 포함 한국어 표기 (오늘/어제 접두사 없음)', () => {
      const fixed = new Date('2026-04-29T12:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      const result = formatDateKorean('2026-01-15');
      expect(result).toMatch(/2026/);
      expect(result).not.toMatch(/^오늘 ·/);
      expect(result).not.toMatch(/^어제 ·/);
      vi.useRealTimers();
    });

    it('새벽 3시(cutoff 이전) → 전날을 "오늘"로 인식', () => {
      // 2026-04-29 03:00 → DAY_CUTOFF_HOUR=4 적용 → todayKey 반환값 = '2026-04-28'
      const fixed = new Date('2026-04-29T03:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      expect(formatDateKorean('2026-04-28')).toMatch(/^오늘 · /);
      vi.useRealTimers();
    });
  });
});
