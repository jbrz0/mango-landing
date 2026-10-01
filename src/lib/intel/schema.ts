import { z } from 'zod';

export const TIMEZONE = 'Asia/Bangkok' as const;
const text = z.string().trim().min(1).max(1600);
const short = z.string().trim().min(1).max(160);
const symbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9:^!._/=-]{1,40}$/);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a real calendar date');
export const timestampSchema = z.iso.datetime({ offset: true });
const nullableText = text.nullable();
const bias = z.enum(['bullish', 'mildly_bullish', 'neutral', 'mildly_bearish', 'bearish']);
const confidence = z.enum(['low', 'medium', 'high']);
const volatility = z.enum(['falling', 'stable', 'rising']);
const httpUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use an HTTPS URL without credentials');
const texts = z.array(text).max(20);
const numbers = z.array(z.number().finite()).max(10);

export function bangkokDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

const marketSchema = z.strictObject({
  symbol,
  label: short,
  instrumentType: z.enum(['futures', 'cash_index', 'cfd', 'spot', 'crypto_spot', 'yield', 'volatility_index', 'fx']),
  price: z.number().finite().nullable(),
  changePct: z.number().finite().nullable(),
  unit: z.enum(['USD', 'points', 'percent', 'rate']),
  source: short.nullable(),
  updatedAt: timestampSchema.nullable(),
  // "live" describes the originating feed; a stored quote is still a snapshot.
  status: z.enum(['live', 'delayed', 'snapshot', 'unavailable']),
}).superRefine((value, ctx) => {
  const types: Record<string, string> = { NQ: 'futures', ES: 'futures', GC: 'futures', NDX: 'cash_index', SPX: 'cash_index', NAS100: 'cfd', XAUUSD: 'spot', DXY: 'cash_index', US10Y: 'yield', VIX: 'volatility_index', VXN: 'volatility_index' };
  if (types[value.symbol] && types[value.symbol] !== value.instrumentType) ctx.addIssue({ code: 'custom', message: `${value.symbol} must be identified as ${types[value.symbol]}` });
  if (value.instrumentType === 'yield' && value.unit !== 'percent') ctx.addIssue({ code: 'custom', message: 'Yield quotes must use percent units' });
  if (value.status === 'unavailable' && (value.price !== null || value.changePct !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Unavailable quotes must have null price and changePct' });
  }
  if (value.status !== 'unavailable' && (value.price === null || !value.source || !value.updatedAt)) {
    ctx.addIssue({ code: 'custom', message: 'Available quotes require price, source and updatedAt' });
  }
});

const mover = z.strictObject({ symbol, changePct: z.number().finite().nullable(), context: text, source: short, updatedAt: timestampSchema.nullable() })
  .refine(v => v.changePct === null || v.updatedAt !== null, 'Numeric moves require updatedAt');

export const intelSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.enum(['briefing', 'example']),
  asOfDate: dateSchema,
  generatedAt: timestampSchema,
  timezone: z.literal(TIMEZONE),
  provenance: z.strictObject({ source: short, note: nullableText }),
  overview: z.strictObject({
    sentiment: bias.nullable(), confidence: confidence.nullable(), volatilityOutlook: volatility.nullable(),
    oneLineTake: nullableText, themes: texts, risks: texts,
  }).nullable(),
  markets: z.array(marketSchema).max(80),
  nq: z.strictObject({
    bias: bias.nullable(), conviction: confidence.nullable(), regime: short.nullable(),
    summary: nullableText, primaryCatalyst: nullableText, primaryRisk: nullableText,
    overnight: nullableText, macro: nullableText, volatility: nullableText,
    sentimentShortTerm: bias.nullable(), sentimentMediumTerm: bias.nullable(),
    megaCaps: z.array(mover).max(30), semiconductors: z.array(mover).max(30), premarket: z.array(mover).max(30),
  }).nullable(),
  fx: z.strictObject({
    macroPulse: nullableText,
    instruments: z.array(z.strictObject({
      symbol, bias: bias.nullable(), driver: nullableText, posture: nullableText,
      support: numbers, resistance: numbers, comments: nullableText,
    })).max(30),
  }).nullable(),
  events: z.array(z.strictObject({
    id: short, datetime: timestampSchema.nullable(), date: dateSchema,
    timeLabel: z.enum(['tentative', 'all_day']).nullable(), timezone: z.literal(TIMEZONE),
    currency: z.string().regex(/^[A-Z]{3}$/), country: short,
    impact: z.enum(['low', 'medium', 'high']), title: short,
    forecast: short.nullable(), previous: short.nullable(), actual: short.nullable(), source: httpUrl,
  }).superRefine((event, ctx) => {
    if (event.datetime ? event.timeLabel !== null || bangkokDate(event.datetime) !== event.date : event.timeLabel === null) {
      ctx.addIssue({ code: 'custom', message: 'Timed events require matching Bangkok date and null timeLabel; untimed events require timeLabel' });
    }
  })).max(250),
  intelligence: z.array(z.strictObject({
    id: short, source: short, headline: z.string().trim().min(1).max(240), url: httpUrl,
    summary: z.string().trim().min(1).max(600), publishedAt: timestampSchema.nullable(),
    tags: z.array(short).max(8), symbols: z.array(symbol).max(20),
  })).max(80),
}).superRefine((data, ctx) => {
  if (bangkokDate(data.generatedAt) !== data.asOfDate) {
    ctx.addIssue({ code: 'custom', path: ['asOfDate'], message: 'Must match generatedAt calendar date in Asia/Bangkok' });
  }
  for (const [name, values] of [
    ['markets', data.markets.map(m => m.symbol)], ['events', data.events.map(e => e.id)],
    ['intelligence', data.intelligence.map(i => i.id)], ['fx', data.fx?.instruments.map(i => i.symbol) ?? []],
  ] as const) {
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [name], message: 'Duplicate identifiers are not allowed' });
  }
  const generated = Date.parse(data.generatedAt);
  const quoted = [...data.markets, ...(data.nq?.megaCaps ?? []), ...(data.nq?.semiconductors ?? []), ...(data.nq?.premarket ?? [])];
  if (quoted.some(item => item.updatedAt && Date.parse(item.updatedAt) > generated)) {
    ctx.addIssue({ code: 'custom', path: ['markets'], message: 'Quote timestamps cannot be later than generatedAt' });
  }
  if (data.intelligence.some(item => item.publishedAt && Date.parse(item.publishedAt) > generated)) {
    ctx.addIssue({ code: 'custom', path: ['intelligence'], message: 'Article timestamps cannot be later than generatedAt' });
  }
});

export type Intel = z.infer<typeof intelSchema>;
export type Market = Intel['markets'][number];
export type EconomicEvent = Intel['events'][number];

export function parseIntel(input: unknown, production = true, now = Date.now()): Intel {
  const data = intelSchema.parse(input);
  if (production && data.kind !== 'briefing') throw new Error('Example fixtures cannot be published as production intelligence');
  if (production && Date.parse(data.generatedAt) > now + 5 * 60_000) throw new Error('generatedAt is in the future (maximum clock tolerance: 5 minutes)');
  return data;
}

export function validationError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map(issue => `${issue.path.join('.') || 'payload'}: ${issue.message}`).join('\n');
  return error instanceof Error ? error.message : String(error);
}
