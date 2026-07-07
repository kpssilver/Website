// Section registry — the render order of the page, top to bottom.
// Add / remove / reorder sections here (e.g. drop in a <Products/> section
// when the storefront is ready).
import { Atmosphere } from './atmosphere.js';
import { Nav } from './nav.js';
import { Hero } from './hero.js';
import { Ticker } from './ticker.js';
import { Signature } from './signature.js';
import { Collections } from './collections.js';
import { Heritage } from './heritage.js';
import { Occasions } from './occasions.js';
import { Promise } from './promise.js';
import { Visit } from './visit.js';
import { Footer } from './footer.js';
import { ContactModal } from '../components/contactModal.js';

const sections = [
  Atmosphere,
  Nav,
  Hero,
  Ticker,
  Signature,
  Collections,
  Heritage,
  Occasions,
  Promise,
  Visit,
  Footer,
  ContactModal,
];

// Concatenate every section's markup into a single HTML string.
export function renderPage() {
  return sections.map((section) => section()).join('\n');
}
