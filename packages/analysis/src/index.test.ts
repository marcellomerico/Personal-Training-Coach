import { describe, expect, it } from 'vitest';
import {
  computeReadiness,
  decideFromScore,
  decisionText,
  summarizeReadiness,
  type ReadinessInput,
} from './index';

const baseInput: ReadinessInput = {
  date: '2026-06-09',
  health: {
    date: '2026-06-09',
    restingHr: 50,
    hrv: 70,
  },
  sleep: {
    date: '2026-06-09',
    sleepScore: 90,
    totalSleepSec: 8 * 3600,
  },
  recentActivities: [],
  recentHealth: [
    { date: '2026-06-06', restingHr: 55, hrv: 60 },
    { date: '2026-06-07', restingHr: 55, hrv: 60 },
    { date: '2026-06-08', restingHr: 55, hrv: 60 },
  ],
};

describe('computeReadiness', () => {
  it('returns a high score and hard decision for a recovered day', () => {
    const result = computeReadiness(baseInput);

    expect(result.readinessScore).toBe(100);
    expect(result.decision).toBe('hard');
    expect(result.hrvVsBaseline).toBe(1.17);
    expect(result.rhrVsBaseline).toBe(0.91);
    expect(result.sleepFactor).toBe(0.9);
    expect(result.loadSignal).toBe(0);
    expect(result.rationale.rules.every((rule) => rule.delta === 0)).toBe(true);
    expect(summarizeReadiness(result.rationale)).toBe('Alle Werte im grünen Bereich.');
  });

  it('applies deterministic penalties for poor sleep, low HRV, high RHR and hard previous load', () => {
    const result = computeReadiness({
      ...baseInput,
      health: {
        date: '2026-06-09',
        restingHr: 65,
        hrv: 42,
      },
      sleep: {
        date: '2026-06-09',
        sleepScore: 45,
        totalSleepSec: 4 * 3600,
      },
      recentActivities: [
        {
          startTime: '2026-06-08T18:00:00.000Z',
          type: 'run',
          durationSec: 95 * 60,
          avgHr: 155,
          trainingLoad: null,
        },
      ],
    });

    expect(result.readinessScore).toBe(18);
    expect(result.decision).toBe('rest');
    expect(result.hrvVsBaseline).toBe(0.7);
    expect(result.rhrVsBaseline).toBe(1.18);
    expect(result.sleepFactor).toBe(0.45);
    expect(result.loadSignal).toBe(1);
    expect(result.rationale.rules.map((rule) => [rule.rule, rule.delta])).toEqual([
      ['sleep', -30],
      ['hrv', -22],
      ['rhr', -20],
      ['load', -10],
    ]);
    expect(summarizeReadiness(result.rationale)).toBe(
      'Sehr schlechter Schlaf. HRV deutlich unter Baseline.',
    );
  });

  it('uses profile baselines before fallback averages', () => {
    const result = computeReadiness({
      ...baseInput,
      health: {
        date: '2026-06-09',
        restingHr: 60,
        hrv: 80,
      },
      baselines: {
        hrvBaseline: 100,
        restingHrBaseline: 50,
      },
    });

    expect(result.hrvVsBaseline).toBe(0.8);
    expect(result.rhrVsBaseline).toBe(1.2);
    expect(result.rationale.rules.find((rule) => rule.rule === 'hrv')?.baseline).toBe(100);
    expect(result.rationale.rules.find((rule) => rule.rule === 'rhr')?.baseline).toBe(50);
  });

  it('derives sleep factor from duration when sleep score is missing', () => {
    const result = computeReadiness({
      ...baseInput,
      sleep: {
        date: '2026-06-09',
        sleepScore: null,
        totalSleepSec: 6 * 3600,
      },
    });

    expect(result.sleepFactor).toBe(0.75);
    expect(result.rationale.rules.find((rule) => rule.rule === 'sleep')?.value).toBe(75);
  });
});

describe('decision helpers', () => {
  it('maps score ranges to decisions', () => {
    expect(decideFromScore(44)).toBe('rest');
    expect(decideFromScore(45)).toBe('easy');
    expect(decideFromScore(64)).toBe('easy');
    expect(decideFromScore(65)).toBe('normal');
    expect(decideFromScore(79)).toBe('normal');
    expect(decideFromScore(80)).toBe('hard');
  });

  it('returns German decision labels', () => {
    expect(decisionText('rest')).toBe('Ruhetag empfohlen');
    expect(decisionText('easy')).toBe('Lockeres Training');
    expect(decisionText('normal')).toBe('Normales Training möglich');
    expect(decisionText('hard')).toBe('Bereit für harte Einheit');
  });

  it('handles missing rationale safely', () => {
    expect(summarizeReadiness(null)).toBe('Keine Begründung verfügbar.');
    expect(summarizeReadiness({ rules: [] })).toBe('Alle Werte im grünen Bereich.');
  });
});
