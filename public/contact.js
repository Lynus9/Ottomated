const trigger = document.querySelector('#contact-trigger');
const dialog = document.querySelector('#contact-dialog');
const form = document.querySelector('#contact-form');
const fields = [...form.querySelectorAll('input, textarea')];
const fieldset = form.querySelector('fieldset');
const submit = form.querySelector('[type="submit"]');
const errorMessage = document.querySelector('#contact-error');
const status = document.querySelector('#contact-status');
const compose = document.querySelector('#contact-compose');
const success = document.querySelector('#contact-success');
let sending = false;
let closing = false;

function closeContact() {
  if (!dialog.open || closing) return;
  closing = true;
  dialog.classList.add('is-closing');
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
  window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove('is-closing');
    document.body.classList.remove('contact-open');
    closing = false;
    trigger.focus({ preventScroll: true });
  }, duration);
}

trigger.addEventListener('click', () => {
  if (dialog.open) return;
  if (!success.hidden) {
    success.hidden = true;
    compose.hidden = false;
    dialog.setAttribute('aria-labelledby', 'contact-title');
  }
  dialog.showModal();
  document.body.classList.add('contact-open');
  // When reopened during a request, the fields remain disabled until it settles.
  (sending ? dialog.querySelector('.contact-close') : fields[0]).focus({ preventScroll: true });
});

dialog.querySelectorAll('[data-close-contact]').forEach(button => button.addEventListener('click', closeContact));
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeContact();
});

// Require both ends of the click to be outside, so dragging from a field is safe.
let pointerStartedOutside = false;
function outside(event) {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
dialog.addEventListener('pointerdown', event => { pointerStartedOutside = outside(event); });
dialog.addEventListener('click', event => {
  if (event.target === dialog && pointerStartedOutside && outside(event)) closeContact();
  pointerStartedOutside = false;
});

// Native modal dialogs make the page inert; keep Tab cycling inside the panel.
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button, input, textarea')]
    .filter(element => !element.matches(':disabled') && element.getClientRects().length);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function fieldError(field, message = '') {
  const error = document.querySelector(`#${field.name}-error`);
  error.textContent = message;
  error.hidden = !message;
  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

fields.forEach(field => field.addEventListener('input', () => fieldError(field)));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !success.hidden) return;
  errorMessage.textContent = '';
  fields.forEach(field => {
    fieldError(field);
    if (!field.value.trim()) fieldError(field, `Please enter your ${field.name}.`);
    else if (!field.validity.valid) fieldError(field, 'Please enter a valid email address.');
  });
  const invalid = fields.find(field => field.hasAttribute('aria-invalid'));
  if (invalid) {
    errorMessage.textContent = 'Please check the highlighted fields.';
    invalid.focus();
    return;
  }

  // Capture values before disabling controls (disabled fields are omitted from FormData).
  const data = new FormData(form);
  sending = true;
  fieldset.disabled = true;
  submit.disabled = true;
  submit.textContent = 'Sending...';
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Sending your message.';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(form.action, {
      method: form.method,
      body: data,
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok === true) {
      form.reset();
      compose.hidden = true;
      success.hidden = false;
      dialog.setAttribute('aria-labelledby', 'contact-success-title');
      if (dialog.open && !closing) document.querySelector('#contact-success-title').focus();
      return;
    }

    const messages = [];
    if (Array.isArray(result?.errors)) {
      for (const error of result.errors) {
        if (typeof error?.message !== 'string') continue;
        const field = fields.find(field => field.name === error.field);
        if (field) fieldError(field, error.message);
        else messages.push(error.message);
      }
    }
    errorMessage.textContent = messages.join(' ') || (fields.some(field => field.hasAttribute('aria-invalid'))
      ? 'Please check the highlighted fields and try again. Your message is still here.'
      : 'We couldn’t send your message. Your text is still here. Please try again in a moment.');
  } catch {
    errorMessage.textContent = 'We couldn’t confirm your message was sent. Your text is still here. Please check your connection and try again later.';
  } finally {
    window.clearTimeout(timeout);
    sending = false;
    fieldset.disabled = false;
    submit.disabled = false;
    submit.textContent = 'Send Message';
    form.removeAttribute('aria-busy');
    status.textContent = '';
  }
  const firstError = fields.find(field => field.hasAttribute('aria-invalid'));
  if (dialog.open && !closing && firstError) firstError.focus();
});

// Avoid a dead control when JavaScript is unavailable or blocked.
trigger.hidden = false;
