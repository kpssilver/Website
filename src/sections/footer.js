import { site } from '../config/site.js';
import { Logo } from '../components/logo.js';

export function Footer() {
  return `
<footer>
  <div class="foot">
    <div>
      <div class="foot-brand">${Logo('foot')}</div>
      <small>925 sterling to 999 fine silver · Nagarthpet, Bengaluru · Since ${site.established}</small>
    </div>
    <small>© 2026 ${site.brand}. All rights reserved.</small>
  </div>
</footer>`;
}
