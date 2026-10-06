import activity from '../assets/icons/activity.svg?raw';
import calendar from '../assets/icons/calendar-days.svg?raw';
import nasdaq from '../assets/icons/chart-no-axes-combined.svg?raw';
import macro from '../assets/icons/landmark.svg?raw';
import chart from '../assets/icons/chart-candlestick.svg?raw';
import radar from '../assets/icons/radar.svg?raw';
import fx from '../assets/icons/globe.svg?raw';
import wire from '../assets/icons/newspaper.svg?raw';
import history from '../assets/icons/history.svg?raw';

// Vendored Lucide SVGs keep card icons available without a runtime request.
const icons: Record<string, string> = {
  'overview-title': activity, 'events-title': calendar, 'nq-title': nasdaq,
  'macro-title': macro, 'chart-title': chart, 'themes-title': radar,
  'fx-title': fx, 'feed-title': wire, 'changes-title': history,
};
export function sectionIcon(id: string) {
  return icons[id]?.replace('<svg', '<svg class="section-icon" aria-hidden="true" focusable="false"') ?? '';
}
