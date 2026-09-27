// Activities page.
//
// The cards are already in the HTML — the server renders them so search
// engines see the content without running any JavaScript. This file only
// adds the interactive layer on top: the category chips, the mobile menu and
// the icons. If it fails to load, the page still shows every activity.

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Mobile menu — same behaviour as the homepage.
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            });
        });
    }

    // Category filter. Hides and shows cards that are already on the page
    // rather than re-fetching anything, so it stays instant and the full text
    // remains in the HTML.
    const filters = document.querySelector('.activity-filters');
    const grid = document.getElementById('activityGrid');

    if (filters && grid) {
        const cards = [...grid.querySelectorAll('.activity-card')];

        const matches = (card, filter) => {
            if (filter === 'all') return true;
            // Kid-friendly is a flag across every category, not one of them.
            if (filter === 'kid-friendly') return card.dataset.kidFriendly === 'true';
            return card.dataset.category === filter;
        };

        const applyFilter = (category) => {
            let shown = 0;
            cards.forEach((card) => {
                const match = matches(card, category);
                card.hidden = !match;
                if (match) shown += 1;
            });

            filters.querySelectorAll('.activity-chip').forEach((chip) => {
                const active = chip.dataset.filter === category;
                chip.classList.toggle('active', active);
                chip.setAttribute('aria-pressed', String(active));
            });

            const empty = document.getElementById('activityFilterEmpty');
            if (empty) empty.hidden = shown > 0;
        };

        filters.addEventListener('click', (e) => {
            const chip = e.target.closest('.activity-chip');
            if (!chip) return;
            applyFilter(chip.dataset.filter);
            // Keep the chosen category in the URL so a filtered view can be
            // shared or reloaded without resetting.
            const url = new URL(window.location.href);
            if (chip.dataset.filter === 'all') url.searchParams.delete('type');
            else url.searchParams.set('type', chip.dataset.filter);
            history.replaceState(null, '', url);
        });

        const requested = new URL(window.location.href).searchParams.get('type');
        if (requested && cards.some((c) => matches(c, requested))) {
            applyFilter(requested);
        }
    }

    // Activity request form. Posts to the same endpoint the booking form uses,
    // so these land in the Enquiries tab with everything else — one inbox,
    // the same rate limiting, the same reply buttons.
    const activityForm = document.getElementById('activityBookingForm');
    if (activityForm) {
        const show = (id, message) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = message;
            el.style.display = 'block';
        };
        const hide = (id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        };

        activityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hide('activityFormError');
            hide('activityFormSuccess');

            const data = Object.fromEntries(new FormData(activityForm).entries());
            if (!data.name || !data.phone) {
                show('activityFormError', 'Please give us your name and a number we can reach you on.');
                return;
            }

            const btn = document.getElementById('actSubmit');
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Sending…';

            try {
                const response = await fetch('/api/enquiries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...data,
                        activity: activityForm.dataset.activity,
                        channel: 'form',
                        outcome: 'activity_request',
                    }),
                });

                if (!response.ok) throw new Error(`status ${response.status}`);

                activityForm.reset();
                show('activityFormSuccess',
                    `Thanks — we've got your request for ${activityForm.dataset.activity}. `
                    + `We'll come back to you on the number you gave us to confirm the details.`);
            } catch (err) {
                console.error('activity request failed', err);
                show('activityFormError',
                    "Sorry, that didn't send. Please try again, or message us on WhatsApp and we'll sort it.");
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
        });
    }

    // Reveal-on-scroll, matching the homepage's feel.
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.activity-card').forEach((card, i) => {
        card.classList.add('fade-up');
        card.style.transitionDelay = `${(i % 3) * 0.08}s`;
        observer.observe(card);
    });
});
