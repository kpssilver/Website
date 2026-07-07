// Wires up the "Call or WhatsApp" chooser. Any element with [data-contact]
// opens the modal; the two choices are plain anchors (tel: / wa.me) so the
// dialpad and WhatsApp open natively. Works regardless of reduced-motion.
export function initContact() {
  const modal = document.getElementById('contactModal');
  if (!modal) return;

  let lastFocus = null;

  const open = (trigger) => {
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    const first = modal.querySelector('.contact-choice');
    if (first) first.focus();
  };

  const close = () => {
    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    const done = () => {
      modal.hidden = true;
      modal.removeEventListener('transitionend', done);
    };
    modal.addEventListener('transitionend', done);
    // fallback if transitionend doesn't fire
    setTimeout(() => {
      if (!modal.classList.contains('is-open')) modal.hidden = true;
    }, 400);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  };

  document.querySelectorAll('[data-contact]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(el);
    }),
  );

  modal.querySelectorAll('[data-contact-close]').forEach((el) =>
    el.addEventListener('click', close),
  );

  // After a choice is made, let the native tel:/wa.me action run, then close.
  modal.querySelectorAll('[data-contact-choice]').forEach((el) =>
    el.addEventListener('click', () => setTimeout(close, 80)),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}
