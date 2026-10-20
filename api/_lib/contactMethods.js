// Phone numbers and email addresses, editable from the dashboard.
//
// Every page that shows a way of reaching the villa reads from here, so a
// number changed in the Contact tab follows through to the contact section,
// the floating WhatsApp button, the activities pages, the 404 page, the
// llms.txt feed and the structured data Google reads.
//
// The defaults below are what the templates used to hardcode. They are the
// floor, not the source: if Supabase is unreachable or the table is empty the
// site still shows a working number rather than an empty contact section.

const { getSupabaseAdmin } = require('./supabaseAdmin');

const DEFAULTS = [
  { kind: 'phone', label: '', value: '+254715257111', is_primary: true, sort_order: 0 },
  { kind: 'whatsapp', label: '', value: '+254715257111', is_primary: true, sort_order: 1 },
  { kind: 'email', label: '', value: 'contact@bananavillaswatamu.com', is_primary: true, sort_order: 2 },
];

const ICONS = { phone: 'phone', whatsapp: 'message-circle', email: 'mail' };

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// wa.me and tel: want digits only; wa.me additionally rejects a leading "+".
// Guests type numbers in every imaginable shape, so normalise rather than
// trusting whatever was pasted into the dashboard.
function digits(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

// "+254715257111" reads as a wall of digits. Kenyan numbers group as
// +254 7XX XXX XXX; anything else is left exactly as it was typed, since
// guessing at an unfamiliar country's grouping looks worse than not trying.
function prettyPhone(value) {
  const raw = String(value ?? '').trim();
  const d = digits(raw);
  if (d.length === 12 && d.startsWith('254')) {
    return `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }
  return raw;
}

function waUrl(value) {
  return `https://wa.me/${digits(value)}`;
}

async function fetchContactMethods() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('contact_methods')
      .select('*')
      .eq('visible', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return DEFAULTS;
    return data;
  } catch (err) {
    console.error('failed to load contact_methods, falling back to defaults', err);
    return DEFAULTS;
  }
}

// The single number or address the rest of the site uses when it can only
// show one. Falls back to the first of that kind, then to the built-in
// default, so these never return undefined and callers never have to guard.
function primary(methods, kind) {
  const ofKind = (methods || []).filter((m) => m.kind === kind);
  const chosen = ofKind.find((m) => m.is_primary) || ofKind[0];
  if (chosen) return chosen.value;
  return DEFAULTS.find((m) => m.kind === kind).value;
}

function primaryWhatsAppUrl(methods) {
  return waUrl(primary(methods, 'whatsapp'));
}

// The rows of the contact section. Each kind gets the link type that actually
// does something useful when tapped on a phone.
function renderContactDetails(methods) {
  return (methods || [])
    .map((m) => {
      const icon = ICONS[m.kind];
      if (!icon) return '';

      // A label reads as a bracketed aside after the number. WhatsApp rows
      // carry their own "(WhatsApp)" last, so the label slots in before it:
      // "+254 722 000 111 (Backup) (WhatsApp)".
      const label = m.label ? ` (${escapeHtml(m.label)})` : '';
      let href;
      let body;
      let attrs = '';

      if (m.kind === 'email') {
        href = `mailto:${encodeURI(m.value)}`;
        body = `${escapeHtml(m.value)}${label}`;
      } else if (m.kind === 'whatsapp') {
        href = waUrl(m.value);
        body = `${escapeHtml(prettyPhone(m.value))}${label} (WhatsApp)`;
        attrs = ' target="_blank" rel="noopener noreferrer"';
      } else {
        href = `tel:+${digits(m.value)}`;
        body = `${escapeHtml(prettyPhone(m.value))}${label}`;
      }

      return `                            <div class="contact-detail">
                                <span class="icon"><i data-lucide="${icon}"></i></span>
                                <a href="${escapeHtml(href)}"${attrs}>${body}</a>
                            </div>`;
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  DEFAULTS,
  fetchContactMethods,
  primary,
  primaryWhatsAppUrl,
  renderContactDetails,
  prettyPhone,
  waUrl,
  digits,
};
