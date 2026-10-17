import './navigation.css';

const pages = [
  { href: '/', label: 'Dashboard' },
  { href: '/visual', label: 'Visual Atlas' },
  { href: '/global', label: 'Global Intel' },
  { href: '/tools', label: 'Tools' },
] as const;

export function siteNavigation(path: string) {
  return `<nav class="site-nav" aria-label="Main navigation">${pages.map(({ href, label }) => {
    const current = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
    return `<a href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('')}</nav>`;
}
