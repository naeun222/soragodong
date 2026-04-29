import { describe, it, expect, vi } from 'vitest';
import { getDayKey, todayKey, daysBetweenKeys, DAY_CUTOFF_HOUR } from '../src/utils/date';

describe('date utils', () => {
  describe('DAY_CUTOFF_HOUR', () => {
    it('4시간으로 박혀있음', () => {
      expect(DAY_CUTOFF_HOUR).toBe(4);
    });
  });

  describe('getDayKey', () => {
    it('UTC 기준 정오 시각은 그날 키 반환', () => {
      const noon = new Date('2026-04-29T12:00:00');
      expect(getDayKey(noon)).toBe('2026-04-29');
    });

    it('새벽 3시는 전날로 처리 (cutoff)', () => {
      const earlyMorning = new Date('2026-04-29T03:00:00');
      expect(getDayKey(earlyMorning)).toBe('2026-04-28');
    });

    it('새벽 5시는 그날 (cutoff 지남)', () => {
      const post = new Date('2026-04-29T05:00:00');
      expect(getDayKey(post)).toBe('2026-04-29');
    });

    it('ISO 문자열 input 처리', () => {
      expect(getDayKey('2026-04-29T12:00:00')).toBe('2026-04-29');
    });

    it('input 없으면 현재 시각 사용', () => {
      const fixed = new Date('2026-04-29T12:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      expect(getDayKey()).toBe('2026-04-29');
      vi.useRealTimers();
    });
  });

  describe('todayKey', () => {
    it('getDayKey() 와 동일', () => {
      const fixed = new Date('2026-04-29T12:00:00').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      expect(todayKey()).toBe(getDayKey());
      vi.useRealTimers();
    });
  });

  describe('daysBetweenKeys', () => {
    it('같은 날 = 0', () => {
      expect(daysBetweenKeys('2026-04-29', '2026-04-29')).toBe(0);
    });

    it('하루 차이 = 1', () => {
      expect(daysBetweenKeys('2026-04-29', '2026-04-30')).toBe(1);
    });

    it('과거 날짜는 음수', () => {
      expect(daysBetweenKeys('2026-04-29', '2026-04-28')).toBe(-1);
    });

    it('한 달 차이', () => {
      expect(daysBetweenKeys('2026-04-29', '2026-05-29')).toBe(30);
    });

    it('빈 문자열 처리', () => {
      expect(daysBetweenKeys('', '2026-04-29')).toBe(0);
      expect(daysBetweenKeys('2026-04-29', '')).toBe(0);
    });
  });
});
