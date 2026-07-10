import { site } from '../config/site.js';
import { Logo } from '../components/logo.js';
import { cd } from '../content/schema.js';

export function Footer() {
  return `
<footer>
  <div class="foot">
    <div>
      <div class="foot-brand">${Logo('foot')}</div>
      <small data-ck="footer.tagline">${cd('footer.tagline')}</small>
    </div>
    <small data-ck="footer.copyright">${cd('footer.copyright')}</small>
  </div>
</footer>`;
}
