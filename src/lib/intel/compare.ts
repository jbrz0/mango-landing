import type { Intel } from './schema';

export function changesSince(current: Intel, previous: Intel | null) {
  if (!previous) return [];
  const pairs = [
    ['Sentiment', previous.overview?.sentiment, current.overview?.sentiment],
    ['Confidence', previous.overview?.confidence, current.overview?.confidence],
    ['NQ bias', previous.nq?.bias, current.nq?.bias],
    ['NQ regime', previous.nq?.regime, current.nq?.regime],
    ['Volatility', previous.overview?.volatilityOutlook, current.overview?.volatilityOutlook],
  ];
  return pairs.flatMap(([label, before, after]) => before && after && before !== after ? [{ label: label!, before, after }] : []);
}
