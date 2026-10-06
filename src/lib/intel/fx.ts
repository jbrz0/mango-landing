import type { Intel } from './schema';

type Instrument = NonNullable<Intel['fx']>['instruments'][number];

export function fxBiasLabel(item: Instrument): string | undefined {
  if (item.bias) return undefined;
  // Only reflect an explicit non-directional posture from this same briefing.
  // Quotes and older briefings cannot supply a missing editorial prediction.
  const watchOnly = [item.posture, item.comments].some(text => text && /^\s*(watch only|stand aside|wait for confirmation|no trade)\b/i.test(text));
  return watchOnly ? 'Watch only' : 'Bias not supplied';
}
