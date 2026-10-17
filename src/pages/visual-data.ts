import { day, number, readable, signed, timestamp } from '../lib/format';
import { changesSince } from '../lib/intel/compare';
import { fxBiasLabel } from '../lib/intel/fx';
import { localizeResearch } from '../lib/intel/localize';
import type { Intel } from '../lib/intel/schema';
import { FX_LEVEL_COLORS } from './visual-layout';

export type LensId = 'overview' | 'markets' | 'leadership' | 'levels' | 'history' | 'catalysts' | 'themes' | 'wire';

export interface VisualNode {
  id: string;
  label: string;
  value: string;
  group: string;
  color: string;
  metric: number | null;
  note: string;
  details: { label: string; value: string }[];
  url?: string;
  date?: string;
  shape?: 'bar' | 'orb' | 'ring' | 'plate';
  levels?: { kind: 'support' | 'resistance' | 'price'; value: number; label?: string }[];
}

export interface VisualLink {
  from: string;
  to: string;
  color?: string;
}

export interface VisualLens {
  id: LensId;
  title: string;
  kicker: string;
  description: string;
  legend: { label: string; color: string }[];
  nodes: VisualNode[];
  links: VisualLink[];
  stats: { label: string; value: string }[];
  empty?: string;
}

export const LENSES: { id: LensId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Pulse', icon: '◉' },
  { id: 'markets', label: 'Markets', icon: '▥' },
  { id: 'leadership', label: 'Leaders', icon: '↗' },
  { id: 'levels', label: 'FX levels', icon: '≋' },
  { id: 'history', label: 'History', icon: '⌁' },
  { id: 'catalysts', label: 'Calendar', icon: '◷' },
  { id: 'themes', label: 'Themes', icon: '✦' },
  { id: 'wire', label: 'Wire', icon: '⌘' },
];

export function buildLens(data: Intel, history: Intel[], id: LensId): VisualLens {
  return createLens(localizeResearch(data), history, id);
}

const COLOR = { orange: '#ffad45', positive: '#b8e986', negative: '#fa817e', blue: '#7fb8e6', missing: '#858c8b' };
const BIAS_SCORE: Record<string, number> = { bearish: -2, mildly_bearish: -1, neutral: 0, mildly_bullish: 1, bullish: 2 };
const absent = 'Not supplied';
type Detail = VisualNode['details'][number];

const field = (label: string, value: string | number | null | undefined): Detail => ({ label, value: value == null || value === '' ? absent : String(value) });
const text = (value: string | null | undefined) => value ? readable(value) : absent;
const prose = (...values: (string | null | undefined)[]) => values.filter((value): value is string => Boolean(value)).join('\n\n');
const biasScore = (value: string | null | undefined) => value && value in BIAS_SCORE ? BIAS_SCORE[value]! : null;
const biasColor = (value: string | null | undefined) => {
  const score = biasScore(value);
  return score == null ? COLOR.missing : score > 0 ? COLOR.positive : score < 0 ? COLOR.negative : COLOR.orange;
};
const moveColor = (value: number | null) => value == null ? COLOR.missing : value > 0 ? COLOR.positive : value < 0 ? COLOR.negative : COLOR.blue;
const move = (value: number | null) => value == null ? absent : signed(value);
const exact = (value: number) => number(value, 12);
const price = (value: number | null, unit: string) => value == null ? absent : `${exact(value)}${unit === 'percent' ? '%' : ''}`;
const shortLabel = (value: string, max = 42) => {
  const clause = value.split(/[;:\n]|\.\s/)[0]!.trim();
  if (clause.length <= max) return clause;
  const words = clause.slice(0, max + 1).trim().split(/\s+/);
  words.pop();
  return `${words.join(' ') || clause.slice(0, max)}…`;
};

function lens(id: LensId, title: string, kicker: string, description: string): VisualLens {
  return { id, title, kicker, description, legend: [], nodes: [], links: [], stats: [] };
}

function nqDetails(data: Intel): Detail[] {
  if (!data.nq) return [];
  const nq = data.nq;
  return [
    field('Nasdaq bias', text(nq.bias)), field('Nasdaq conviction', text(nq.conviction)), field('Regime', nq.regime),
    field('Nasdaq summary', nq.summary), field('Overnight', nq.overnight), field('Macro', nq.macro),
    field('Volatility research', nq.volatility), field('Primary catalyst', nq.primaryCatalyst), field('Primary risk', nq.primaryRisk),
    field('Short-term sentiment', text(nq.sentimentShortTerm)), field('Medium-term sentiment', text(nq.sentimentMediumTerm)),
  ];
}

function overviewLens(data: Intel): VisualLens {
  const result = lens('overview', 'The market pulse', 'REGIME / CONVICTION / RISK', 'Five research signals orbit the broad regime. Select a signal for the complete published research.');
  const overview = data.overview;
  const nq = data.nq;
  if (!overview && !nq) { result.empty = 'This briefing has no overview or Nasdaq research.'; return result; }
  result.nodes = [
    {
      id: 'regime', label: 'MARKET REGIME', value: text(overview?.sentiment), group: 'Regime', color: biasColor(overview?.sentiment), metric: null,
      note: overview?.oneLineTake ?? '', shape: 'orb',
      details: [field('Broad sentiment', text(overview?.sentiment)), field('Market takeaway', overview?.oneLineTake), field('Briefing date', day(data.asOfDate)), field('Published', timestamp(data.generatedAt)), field('Source', data.provenance.source), field('Source note', data.provenance.note)],
    },
    {
      id: 'nq-bias', label: 'NASDAQ', value: text(nq?.bias), group: 'Nasdaq', color: biasColor(nq?.bias), metric: null,
      note: prose(nq?.regime, nq?.summary, nq?.overnight, nq?.macro), shape: 'orb', details: nqDetails(data),
    },
    {
      id: 'confidence', label: 'CONVICTION', value: text(overview?.confidence), group: 'Conviction', color: overview?.confidence ? COLOR.orange : COLOR.missing, metric: null,
      note: prose(nq?.summary, nq?.macro), shape: 'ring',
      details: [field('Broad confidence', text(overview?.confidence)), field('Nasdaq conviction', text(nq?.conviction)), field('Nasdaq summary', nq?.summary), field('Macro research', nq?.macro)],
    },
    {
      id: 'volatility', label: 'VOLATILITY', value: text(overview?.volatilityOutlook), group: 'Volatility', color: overview?.volatilityOutlook ? COLOR.blue : COLOR.missing, metric: null,
      note: nq?.volatility ?? '', shape: 'ring',
      details: [field('Broad volatility outlook', text(overview?.volatilityOutlook)), field('Nasdaq volatility research', nq?.volatility), ...data.markets.filter(item => item.instrumentType === 'volatility_index').flatMap(item => [field(item.symbol, price(item.price, item.unit)), field(`${item.symbol} change`, move(item.changePct))])],
    },
    {
      id: 'catalyst', label: 'CATALYST', value: nq?.primaryCatalyst ? shortLabel(nq.primaryCatalyst, 34) : absent, group: 'Catalyst', color: nq?.primaryCatalyst ? COLOR.orange : COLOR.missing, metric: null,
      note: nq?.primaryCatalyst ?? '', shape: 'orb', details: [field('Primary catalyst', nq?.primaryCatalyst), field('Overnight', nq?.overnight), field('Macro research', nq?.macro)],
    },
    {
      id: 'risk', label: 'PRIMARY RISK', value: nq?.primaryRisk ? shortLabel(nq.primaryRisk, 34) : absent, group: 'Risk', color: nq?.primaryRisk ? COLOR.negative : COLOR.missing, metric: null,
      note: prose(nq?.primaryRisk, ...(overview?.risks ?? [])), shape: 'orb',
      details: [field('Nasdaq primary risk', nq?.primaryRisk), ...(overview?.risks ?? []).map((item, index) => field(`Risk ${index + 1}`, item))],
    },
  ];
  result.links = result.nodes.slice(1).map(node => ({ from: 'regime', to: node.id, color: node.color }));
  result.legend = [{ label: 'Bullish', color: COLOR.positive }, { label: 'Bearish', color: COLOR.negative }, { label: 'Neutral / research', color: COLOR.orange }, { label: 'Not supplied', color: COLOR.missing }];
  result.stats = [field('Broad bias', text(overview?.sentiment)), field('NQ bias', text(nq?.bias)), field('Confidence', text(overview?.confidence))];
  return result;
}

function marketFamily(symbol: string, instrumentType: string): string {
  if (['GC', 'SI', 'XAUUSD', 'XAGUSD'].includes(symbol)) return 'Metals';
  if (symbol === 'DXY' || instrumentType === 'fx') return 'FX';
  if (instrumentType === 'yield') return 'Rates';
  if (instrumentType === 'volatility_index') return 'Volatility';
  if (instrumentType === 'crypto_spot') return 'Crypto';
  return 'Indices';
}

function moveLegend(): VisualLens['legend'] {
  return [{ label: 'Positive %', color: COLOR.positive }, { label: 'Negative %', color: COLOR.negative }, { label: 'Zero', color: COLOR.blue }, { label: 'Missing', color: COLOR.missing }];
}

function moveStats(nodes: VisualNode[]): Detail[] {
  return [field('Published moves', nodes.filter(node => node.metric !== null).length), field('Positive', nodes.filter(node => (node.metric ?? 0) > 0).length), field('Negative', nodes.filter(node => (node.metric ?? 0) < 0).length), field('Missing', nodes.filter(node => node.metric === null).length)];
}

function marketsLens(data: Intel): VisualLens {
  const result = lens('markets', 'Across the market', 'PUBLISHED SNAPSHOT / % CHANGE', 'Columns compare the published percent moves. Select an instrument for its exact quote, timestamp and source.');
  result.nodes = data.markets.map(item => ({
    id: `market:${item.symbol}`, label: item.symbol, value: move(item.changePct), group: marketFamily(item.symbol, item.instrumentType), color: moveColor(item.changePct), metric: item.changePct, shape: 'bar',
    note: `${item.label}. ${readable(item.status)} snapshot${item.source ? ` from ${item.source}` : ''}.`,
    details: [field('Instrument', item.label), field('Snapshot price', price(item.price, item.unit)), field('Published change', move(item.changePct)), field('Exact change (%)', item.changePct), field('Instrument type', readable(item.instrumentType)), field('Unit', item.unit), field('Status', readable(item.status)), field('Source', item.source), field('Observed', item.updatedAt ? timestamp(item.updatedAt) : null), field('Observation timestamp', item.updatedAt)],
  }));
  result.legend = moveLegend(); result.stats = moveStats(result.nodes);
  if (!result.nodes.length) result.empty = 'No market snapshots were published in this briefing.';
  return result;
}

function leadershipLens(data: Intel): VisualLens {
  const result = lens('leadership', 'Who is leading?', 'LEADERS / PUBLISHED % CHANGE', 'One row, one column per leader, ranked by published percent change. Select a symbol for all its research.');
  const groups = [
    { key: 'mega-caps', label: 'Mega-caps', items: data.nq?.megaCaps ?? [] },
    { key: 'semiconductors', label: 'Semiconductors', items: data.nq?.semiconductors ?? [] },
    { key: 'premarket', label: 'Premarket', items: data.nq?.premarket ?? [] },
  ];
  const benchmarks = new Set(['NQ', 'NQ=F', 'NDX', '^NDX', 'NASDAQ', 'NAS100', 'QQQ', '^IXIC']);
  const entries = groups.flatMap(group => group.items.map(item => ({ item, group: group.label })));
  const symbols = [...new Set(entries.map(({ item }) => item.symbol))].filter(symbol => !benchmarks.has(symbol));
  result.nodes = symbols.map(symbol => {
    const research = entries.filter(({ item }) => item.symbol === symbol);
    // Missing premarket research must not replace an actual published move.
    const { item } = [...research].sort((a, b) => Number(b.item.changePct !== null) - Number(a.item.changePct !== null)
      || (b.item.updatedAt ? Date.parse(b.item.updatedAt) : 0) - (a.item.updatedAt ? Date.parse(a.item.updatedAt) : 0))[0]!;
    return {
      id: `leadership:${symbol}`, label: symbol, value: move(item.changePct), group: 'Leaders',
      color: moveColor(item.changePct), metric: item.changePct, shape: 'bar' as const,
      note: [...new Set(research.map(entry => entry.item.context))].join('\n\n'),
      details: [field('Published change', move(item.changePct)), field('Exact change (%)', item.changePct), field('Source', item.source), field('Observed', item.updatedAt ? timestamp(item.updatedAt) : null), field('Observation timestamp', item.updatedAt),
        ...research.flatMap(entry => [field(`${entry.group} research`, entry.item.context), field(`${entry.group} change`, move(entry.item.changePct)), field(`${entry.group} source`, entry.item.source), field(`${entry.group} observed`, entry.item.updatedAt)])],
    };
  }).sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity) || a.label.localeCompare(b.label));
  result.legend = moveLegend(); result.stats = moveStats(result.nodes);
  if (!result.nodes.length) result.empty = 'No mega-cap, semiconductor or premarket movers were published in this briefing.';
  return result;
}

function levelsLens(data: Intel): VisualLens {
  const result = lens('levels', 'The FX terrain', 'SUPPORT / SNAPSHOT / RESISTANCE', 'Prices rise upward on each pair’s own scale: teal resistance above, red support below. Outlined planes mark missing data; gold futures proxies are labeled.');
  result.nodes = (data.fx?.instruments ?? []).map(item => {
    const spot = data.markets.find(market => market.symbol === item.symbol && market.price !== null);
    const quote = spot ?? (item.symbol === 'XAUUSD' ? data.markets.find(market => market.symbol === 'GC' && market.price !== null) : undefined);
    const proxy = quote !== undefined && quote.symbol !== item.symbol;
    const levels: NonNullable<VisualNode['levels']> = [
      ...item.support.map(value => ({ kind: 'support' as const, value })),
      ...(quote?.price == null ? [] : [{ kind: 'price' as const, value: quote.price, ...(proxy ? { label: `${quote.symbol} futures proxy` } : {}) }]),
      ...item.resistance.map(value => ({ kind: 'resistance' as const, value })),
    ];
    return {
      id: `fx:${item.symbol}`, label: item.symbol, value: item.bias ? text(item.bias) : fxBiasLabel(item) ?? absent, group: 'FX', color: biasColor(item.bias), metric: null, shape: 'plate' as const, levels,
      note: prose(item.posture, item.driver, item.comments, data.fx?.macroPulse),
      details: [field('Bias', item.bias ? text(item.bias) : fxBiasLabel(item)), field('Macro pulse', data.fx?.macroPulse), field('Driver', item.driver), field('Posture', item.posture), field('Comments', item.comments), field('Support', item.support.length ? item.support.map(exact).join(' / ') : null), field('Snapshot price', `${price(quote?.price ?? null, quote?.unit ?? 'rate')}${proxy ? ` (${quote.symbol} futures proxy)` : ''}`), field('Resistance', item.resistance.length ? item.resistance.map(exact).join(' / ') : null), field('Snapshot instrument', quote?.label), ...(proxy ? [field('Quote basis', 'Gold futures proxy, not a spot XAUUSD quote. The futures basis can differ from the published spot levels.')] : []), field('Snapshot source', quote?.source), field('Snapshot observed', quote?.updatedAt ? timestamp(quote.updatedAt) : null), field('Price scale', 'Normalized separately for this pair; distances do not compare across pairs. Outlined planes have no published price.')],
    };
  });
  result.legend = [{ label: 'Support / downside', color: FX_LEVEL_COLORS.support }, { label: 'Snapshot / labeled proxy', color: FX_LEVEL_COLORS.price }, { label: 'Resistance / upside', color: FX_LEVEL_COLORS.resistance }, { label: 'Not supplied (outline)', color: COLOR.missing }];
  result.stats = [field('Pairs', result.nodes.length), field('Supports', result.nodes.reduce((total, node) => total + (node.levels?.filter(level => level.kind === 'support').length ?? 0), 0)), field('Resistances', result.nodes.reduce((total, node) => total + (node.levels?.filter(level => level.kind === 'resistance').length ?? 0), 0))];
  if (!result.nodes.length) result.empty = 'No FX instruments or levels were published in this briefing.';
  return result;
}

function comparisonDetails(current: Intel, previous: Intel | undefined): Detail[] {
  if (!previous) return [field('Previous session', 'No earlier published briefing in this window.')];
  const shifts = changesSince(current, previous);
  const details = [field('Previous session', day(previous.asOfDate)), ...shifts.map(shift => field(shift.label, `${text(shift.before)} → ${text(shift.after)}`))];
  if (!shifts.length) details.push(field('Research shifts', 'No published change in broad sentiment, confidence, Nasdaq bias, regime or volatility.'));
  const prior = new Map(previous.markets.map(item => [item.symbol, item]));
  for (const item of current.markets) {
    const before = prior.get(item.symbol);
    if (item.price == null || before?.price == null || before.unit !== item.unit || before.instrumentType !== item.instrumentType) continue;
    details.push(field(`${item.symbol} snapshots`, `${price(before.price, before.unit)} → ${price(item.price, item.unit)}`));
  }
  return details;
}

function historyLens(data: Intel, history: Intel[]): VisualLens {
  const result = lens('history', 'How the bias moved', 'PUBLISHED BRIEFINGS / CATEGORICAL BIAS', 'Two paths track broad and Nasdaq bias. Height is a category from −2 bearish to +2 bullish; select a session to open its briefing.');
  const byDate = new Map(history.map(item => [item.asOfDate, item]));
  byDate.set(data.asOfDate, data);
  const sessions = [...byDate.values()].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).map(item => item === data ? item : localizeResearch(item));
  result.nodes = sessions.flatMap((item, index) => {
    const comparison = comparisonDetails(item, sessions[index - 1]);
    const shared = [field('Briefing', day(item.asOfDate)), field('Published', timestamp(item.generatedAt)), field('Source', item.provenance.source), field('Source note', item.provenance.note), ...comparison];
    const broad: VisualNode = {
      id: `history:broad:${item.asOfDate}`, label: day(item.asOfDate).replace(/ \d{4}$/, ''), value: text(item.overview?.sentiment), group: 'Broad', color: COLOR.orange, metric: biasScore(item.overview?.sentiment), date: item.asOfDate, shape: 'orb',
      note: item.overview?.oneLineTake ?? '', details: [field('Broad sentiment', text(item.overview?.sentiment)), field('Category score', biasScore(item.overview?.sentiment)), field('Confidence', text(item.overview?.confidence)), field('Volatility outlook', text(item.overview?.volatilityOutlook)), field('Market takeaway', item.overview?.oneLineTake), ...shared],
    };
    const nasdaq: VisualNode = {
      id: `history:nq:${item.asOfDate}`, label: day(item.asOfDate).replace(/ \d{4}$/, ''), value: text(item.nq?.bias), group: 'Nasdaq', color: COLOR.blue, metric: biasScore(item.nq?.bias), date: item.asOfDate, shape: 'orb',
      note: prose(item.nq?.summary, item.nq?.regime, item.nq?.overnight, item.nq?.macro, item.nq?.volatility), details: [field('Category score', biasScore(item.nq?.bias)), ...nqDetails(item), ...shared],
    };
    if (broad.metric == null) broad.color = COLOR.missing;
    if (nasdaq.metric == null) nasdaq.color = COLOR.missing;
    return [broad, nasdaq];
  });
  for (const group of ['Broad', 'Nasdaq']) {
    const path = result.nodes.filter(node => node.group === group);
    for (let index = 1; index < path.length; index++) {
      const before = path[index - 1]!; const after = path[index]!;
      if (before.metric !== null && after.metric !== null) result.links.push({ from: before.id, to: after.id, color: after.color });
    }
  }
  result.legend = [{ label: 'Broad bias', color: COLOR.orange }, { label: 'Nasdaq bias', color: COLOR.blue }, { label: 'Missing bias', color: COLOR.missing }];
  result.stats = [field('Sessions', sessions.length), field('First session', sessions[0] ? day(sessions[0].asOfDate) : absent), field('Category scale', '−2 / −1 / 0 / +1 / +2')];
  if (sessions.length < 2) result.empty = 'One published session is available. More briefings will extend these paths.';
  return result;
}

function catalystsLens(data: Intel): VisualLens {
  const result = lens('catalysts', 'The catalyst runway', 'PUBLISHED ECONOMIC CALENDAR', 'Events follow their published dates. Height denotes ordinal impact: low 1, medium 2, high 3. Select an event for the exact local time and release data.');
  const events = [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.datetime ? Date.parse(a.datetime) : Infinity) - (b.datetime ? Date.parse(b.datetime) : Infinity) || a.id.localeCompare(b.id));
  const impactMetric = { high: 3, medium: 2, low: 1 };
  const impactColor = { high: COLOR.negative, medium: COLOR.orange, low: COLOR.blue };
  result.nodes = events.map(item => ({
    id: `event:${item.id}`, label: shortLabel(item.title, 38), value: item.datetime ? timestamp(item.datetime).split(' · ').at(-1)! : text(item.timeLabel), group: item.currency,
    color: impactColor[item.impact], metric: impactMetric[item.impact], shape: 'orb', date: item.date, url: item.source,
    note: `${item.title}. ${item.country} / ${item.currency}. ${readable(item.impact)} impact. ${item.datetime ? timestamp(item.datetime) : `${day(item.date)} / ${text(item.timeLabel)}`}.`,
    details: [field('Event', item.title), field('Country', item.country), field('Currency', item.currency), field('Date', day(item.date)), field('Local time', item.datetime ? timestamp(item.datetime) : text(item.timeLabel)), field('Original timestamp', item.datetime), field('Published calendar timezone', item.timezone), field('Impact', readable(item.impact)), field('Forecast', item.forecast), field('Previous', item.previous), field('Actual', item.actual), field('Source', item.source)],
  }));
  result.legend = [{ label: 'High impact', color: COLOR.negative }, { label: 'Medium impact', color: COLOR.orange }, { label: 'Low impact', color: COLOR.blue }];
  result.stats = [field('Events', events.length), field('High impact', events.filter(item => item.impact === 'high').length), field('Calendar days', new Set(events.map(item => item.date)).size)];
  if (!result.nodes.length) result.empty = 'No economic events were published in this briefing.';
  return result;
}

function themesLens(data: Intel): VisualLens {
  const result = lens('themes', 'Themes and fault lines', 'PUBLISHED THEMES / RISKS', 'Each research item has equal visual weight. Select a theme or risk to read the complete published observation.');
  result.nodes = [
    ...(data.overview?.themes ?? []).map((item, index): VisualNode => ({ id: `theme:${index}`, label: shortLabel(item, 38), value: `Theme ${index + 1}`, group: 'Theme', color: COLOR.orange, metric: null, shape: 'orb', note: item, details: [field('Theme', item), field('Briefing', day(data.asOfDate))] })),
    ...(data.overview?.risks ?? []).map((item, index): VisualNode => ({ id: `risk:${index}`, label: shortLabel(item, 38), value: `Risk ${index + 1}`, group: 'Risk', color: COLOR.negative, metric: null, shape: 'orb', note: item, details: [field('Risk', item), field('Briefing', day(data.asOfDate))] })),
  ];
  result.legend = [{ label: 'Theme', color: COLOR.orange }, { label: 'Risk', color: COLOR.negative }];
  result.stats = [field('Themes', data.overview?.themes.length ?? 0), field('Risks', data.overview?.risks.length ?? 0), field('Weight', 'Equal / unranked')];
  if (!result.nodes.length) result.empty = 'No themes or risks were published in this briefing.';
  return result;
}

function wireLens(data: Intel): VisualLens {
  const result = lens('wire', 'The research network', 'STORIES / TOPICS / SOURCES', 'Topic hubs connect to stories carrying that published tag. Hub size reflects story count. Select a story for its complete summary and source link.');
  const topicCounts = new Map<string, number>();
  for (const item of data.intelligence) for (const tag of new Set(item.tags)) topicCounts.set(tag, (topicCounts.get(tag) ?? 0) + 1);
  const topics: VisualNode[] = [...topicCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({
    id: `topic:${encodeURIComponent(tag)}`, label: tag, value: `${count} ${count === 1 ? 'story' : 'stories'}`, group: 'Topic', color: COLOR.orange, metric: count, shape: 'ring',
    note: `${count} published ${count === 1 ? 'story carries' : 'stories carry'} the ${tag} tag.`,
    details: [field('Published tag', tag), field('Story count', count), ...data.intelligence.filter(item => item.tags.includes(tag)).map(item => field(item.source, item.headline))],
  }));
  const stories: VisualNode[] = data.intelligence.map(item => ({
    id: `story:${item.id}`, label: shortLabel(item.headline, 42), value: item.source, group: 'Story', color: COLOR.blue, metric: null, shape: 'orb', date: item.publishedAt ?? undefined, url: item.url,
    note: item.summary,
    details: [field('Headline', item.headline), field('Source', item.source), field('Published', item.publishedAt ? timestamp(item.publishedAt) : null), field('Original timestamp', item.publishedAt), field('Summary', item.summary), field('Tags', item.tags.length ? item.tags.join(' · ') : null), field('Symbols', item.symbols.length ? item.symbols.join(' · ') : null), field('Source URL', item.url)],
  }));
  result.nodes = [...topics, ...stories];
  result.links = data.intelligence.flatMap(item => [...new Set(item.tags)].map(tag => ({ from: `topic:${encodeURIComponent(tag)}`, to: `story:${item.id}`, color: COLOR.blue })));
  result.legend = [{ label: 'Topic / story count', color: COLOR.orange }, { label: 'Published story', color: COLOR.blue }];
  result.stats = [field('Stories', stories.length), field('Topics', topics.length), field('Sources', new Set(data.intelligence.map(item => item.source)).size)];
  if (!stories.length) result.empty = 'No wire stories were published in this briefing.';
  return result;
}

export function buildShiftLens(data: Intel, history: Intel[]): VisualLens {
  const result = lens('markets', 'Since the last brief', 'BRIEF TO BRIEF / SNAPSHOT CHANGE', 'Columns show the percent difference between stored quotes in consecutive published briefings. This interval can span several days; it is not a daily session return.');
  const previous = [...history].filter(item => item.asOfDate < data.asOfDate).sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0];
  result.legend = [{ label: 'Positive difference', color: COLOR.positive }, { label: 'Negative difference', color: COLOR.negative }, { label: 'Not comparable', color: COLOR.missing }];
  if (!previous) {
    result.empty = 'No earlier published briefing is available to compare with this session.';
    result.stats = [field('Previous brief', absent), field('Comparable moves', 0), field('Snapshot interval', absent)];
    return result;
  }
  const interval = `${day(previous.asOfDate)} → ${day(data.asOfDate)}`;
  const prior = new Map(previous.markets.map(item => [item.symbol, item]));
  result.nodes = data.markets.map(item => {
    const before = prior.get(item.symbol);
    const comparable = before !== undefined && before.price !== null && before.price !== 0 && item.price !== null && before.unit === item.unit && before.instrumentType === item.instrumentType;
    const metric = comparable ? (item.price! - before.price!) / Math.abs(before.price!) * 100 : null;
    let reason = '';
    if (!before) reason = 'The previous briefing has no snapshot for this symbol.';
    else if (before.unit !== item.unit || before.instrumentType !== item.instrumentType) reason = 'The unit or instrument type differs between briefings.';
    else if (before.price === null || item.price === null) reason = 'A snapshot price is missing from one or both briefings.';
    else if (before.price === 0) reason = 'The previous price is zero, so a percent difference cannot be computed.';
    return {
      id: `shift:${item.symbol}`, label: item.symbol, value: metric === null ? 'Not comparable' : signed(metric), group: marketFamily(item.symbol, item.instrumentType), color: metric === null ? COLOR.missing : moveColor(metric), metric, shape: 'bar' as const,
      note: `${item.label}. Stored quote comparison over the published briefing interval ${interval}. Quote observation times can predate either briefing and may be stale. ${reason || 'The column measures the difference between the two stored prices.'}`,
      details: [
        field('Instrument', item.label), field('Briefing interval', interval), field('Previous snapshot', price(before?.price ?? null, before?.unit ?? item.unit)), field('Current snapshot', price(item.price, item.unit)),
        field('Snapshot difference', metric === null ? 'Not comparable' : signed(metric)), field('Exact snapshot difference (%)', metric), field('Calculation', '(current stored price − previous stored price) / absolute previous stored price × 100'),
        field('Previous observed', before?.updatedAt ? timestamp(before.updatedAt) : null), field('Previous observation timestamp', before?.updatedAt), field('Current observed', item.updatedAt ? timestamp(item.updatedAt) : null), field('Current observation timestamp', item.updatedAt),
        field('Previous source', before?.source), field('Current source', item.source), field('Previous instrument type', before ? readable(before.instrumentType) : null), field('Current instrument type', readable(item.instrumentType)), field('Previous unit', before?.unit), field('Current unit', item.unit),
        ...(reason ? [field('Comparison unavailable', reason)] : []), field('Timing', 'Stored quote observations can be stale or unchanged across briefings. This comparison does not establish a daily session return.'),
      ],
    };
  });
  const comparableCount = result.nodes.filter(node => node.metric !== null).length;
  const currentResearch = localizeResearch(data);
  const previousResearch = localizeResearch(previous);
  const shifts = changesSince(currentResearch, previousResearch);
  result.nodes.push({
    id: 'shift:research', label: 'RESEARCH SHIFTS', value: shifts.length ? `${shifts.length} categorical ${shifts.length === 1 ? 'shift' : 'shifts'}` : 'No categorical shifts', group: 'Research', color: COLOR.orange, metric: null, shape: 'orb',
    note: shifts.length ? shifts.map(shift => `${shift.label}: ${text(shift.before)} → ${text(shift.after)}`).join('\n') : 'No published change in broad sentiment, confidence, Nasdaq bias, regime or volatility.',
    details: [field('Briefing interval', interval), ...comparisonDetails(currentResearch, previousResearch).filter(detail => !detail.label.endsWith(' snapshots')), field('Current takeaway', currentResearch.overview?.oneLineTake), field('Previous takeaway', previousResearch.overview?.oneLineTake), field('Research scale', 'These are categorical editorial assessments; no numerical weight is assigned.')],
  });
  result.stats = [field('Previous brief', day(previous.asOfDate)), field('Comparable moves', comparableCount), field('Snapshot interval', interval)];
  return result;
}

function createLens(data: Intel, history: Intel[], id: LensId): VisualLens {
  switch (id) {
    case 'overview': return overviewLens(data);
    case 'markets': return marketsLens(data);
    case 'leadership': return leadershipLens(data);
    case 'levels': return levelsLens(data);
    case 'history': return historyLens(data, history);
    case 'catalysts': return catalystsLens(data);
    case 'themes': return themesLens(data);
    case 'wire': return wireLens(data);
  }
}
