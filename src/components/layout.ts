const primary = ['overview', 'nasdaq', 'charts', 'fx', 'changes'];
const secondary = ['catalysts', 'macro', 'themes', 'intelligence'];
const mobile = ['overview', 'catalysts', 'nasdaq', 'charts', 'themes', 'macro', 'fx', 'intelligence', 'changes'];

export function attachDashboardLayout() {
  const grid = document.querySelector<HTMLDivElement>('.dashboard-grid')!;
  const panels = new Map([...grid.children].map(panel => [panel.id, panel]));
  panels.set('changes', document.querySelector('#changes')!);
  const columns = [document.createElement('div'), document.createElement('div')];
  columns.forEach(column => { column.className = 'dashboard-column'; });
  const narrow = matchMedia('(max-width: 760px)');
  const sections = (ids: string[]) => ids.map(id => panels.get(id)!);

  function arrange() {
    const focused = document.activeElement instanceof HTMLElement && grid.contains(document.activeElement) ? document.activeElement : null;
    // Move the existing panels so their state, handlers and chart references survive.
    // Mobile DOM order follows its visual order for keyboard and screen-reader use.
    if (narrow.matches) grid.replaceChildren(...sections(mobile));
    else {
      columns[0].replaceChildren(...sections(primary));
      columns[1].replaceChildren(...sections(secondary));
      grid.replaceChildren(...columns);
    }
    focused?.focus({ preventScroll: true });
  }
  arrange();
  narrow.addEventListener('change', arrange);
}
