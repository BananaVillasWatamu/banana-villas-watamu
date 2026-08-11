document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Inline form error/success helpers
    const showFormError = (id, message) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    };

    const showFormSuccess = (id, message) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
    };

    const hideFormMessage = (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };

    const escapeHtml = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            
            // Animate hamburger to X
            const spans = mobileMenuBtn.querySelectorAll('span');
            if (navLinks.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });

        // Close mobile menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const spans = mobileMenuBtn.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }

    // Navbar Scrolled State
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // Intersection Observer for scroll animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-up, .fade-right, .fade-left');
    animatedElements.forEach(el => observer.observe(el));

    // Smooth Scroll for Anchor Links (polyfill/fallback)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navEl = document.querySelector('.navbar');
                const navHeight = navEl ? navEl.offsetHeight : 0;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Date min validation + night count
    const today = new Date().toISOString().split('T')[0];
    const checkinInput = document.getElementById('checkin');
    const checkoutInput = document.getElementById('checkout');
    const stripNights = document.getElementById('stripNights');
    const nightsCount = document.getElementById('nightsCount');

    const updateNightCount = () => {
        const ci = checkinInput?.value;
        const co = checkoutInput?.value;
        if (ci && co && new Date(co) > new Date(ci)) {
            const nights = Math.round((new Date(co) - new Date(ci)) / 86400000);
            nightsCount.textContent = nights;
            stripNights.style.display = 'flex';
        } else {
            stripNights.style.display = 'none';
        }
    };

    if (checkinInput) {
        checkinInput.min = today;
        checkinInput.addEventListener('change', () => {
            if (checkinInput.value) {
                checkoutInput.min = checkinInput.value;
                if (checkoutInput.value && checkoutInput.value <= checkinInput.value) {
                    checkoutInput.value = '';
                }
            }
            updateNightCount();
        });
    }
    if (checkoutInput) {
        checkoutInput.min = today;
        checkoutInput.addEventListener('change', updateNightCount);
    }

    // Contact form date min validation
    const contactCheckin = document.getElementById('contactCheckin');
    const contactCheckout = document.getElementById('contactCheckout');
    if (contactCheckin && contactCheckout) {
        contactCheckin.min = today;
        contactCheckout.min = today;
        contactCheckin.addEventListener('change', () => {
            if (contactCheckin.value) {
                contactCheckout.min = contactCheckin.value;
                if (contactCheckout.value && contactCheckout.value <= contactCheckin.value) {
                    contactCheckout.value = '';
                }
            }
        });
    }

    // ---- Availability: shared date-range helpers ----
    // (blockedRanges is populated later by the /api/blocked-dates fetch
    // near the bottom of this file; these helpers just read whatever it
    // currently holds, which is safe since none of them run until a user
    // interaction happens well after that fetch kicks off.)
    const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isValidDateRange = (checkin, checkout) => Boolean(checkin && checkout && new Date(checkout) > new Date(checkin));
    const nightsBetween = (checkin, checkout) => Math.round((new Date(checkout) - new Date(checkin)) / 86400000);
    const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

    let blockedRanges = [];

    const hasOverlap = (checkin, checkout) => {
        const start = new Date(checkin);
        const end = new Date(checkout);
        return blockedRanges.some(r => rangesOverlap(start, end, new Date(r.checkin), new Date(r.checkout)));
    };

    // Walks forward from the requested check-in, jumping past any blocked
    // range it collides with, until it finds a stretch of `nights` free
    // nights — used to suggest an alternative instead of a dead-end error.
    const findNextAvailableRange = (desiredCheckin, nights) => {
        const ranges = blockedRanges
            .map(r => ({ start: new Date(r.checkin), end: new Date(r.checkout) }))
            .sort((a, b) => a.start - b.start);

        let candidateStart = new Date(desiredCheckin);
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 730);

        let moved = true;
        while (moved && candidateStart <= horizon) {
            moved = false;
            const candidateEnd = new Date(candidateStart);
            candidateEnd.setDate(candidateEnd.getDate() + nights);
            for (const r of ranges) {
                if (candidateStart < r.end && candidateEnd > r.start) {
                    candidateStart = new Date(r.end);
                    moved = true;
                    break;
                }
            }
        }
        if (candidateStart > horizon) return null;
        const candidateEnd = new Date(candidateStart);
        candidateEnd.setDate(candidateEnd.getDate() + nights);
        return { checkin: toISODate(candidateStart), checkout: toISODate(candidateEnd) };
    };

    const formatDateRangeLabel = (checkin, checkout) => {
        const opts = { month: 'short', day: 'numeric' };
        const s = new Date(`${checkin}T00:00:00`).toLocaleDateString('en-US', opts);
        const e = new Date(`${checkout}T00:00:00`).toLocaleDateString('en-US', opts);
        return `${s} – ${e}`;
    };

    const renderAvailabilityNotice = (warningId, html) => {
        const el = document.getElementById(warningId);
        if (!el) return;
        el.innerHTML = html;
        el.style.display = 'block';
    };

    const hideAvailabilityNotice = (warningId) => {
        const el = document.getElementById(warningId);
        if (el) el.style.display = 'none';
    };

    const renderUnavailableSuggestion = (warningId, checkin, checkout) => {
        const nights = nightsBetween(checkin, checkout);
        const suggestion = findNextAvailableRange(checkin, nights);
        if (!suggestion) {
            renderAvailabilityNotice(warningId, "Sorry, those dates aren't available and we couldn't find an open stretch nearby. Please try different dates or message us on WhatsApp.");
            return;
        }
        renderAvailabilityNotice(
            warningId,
            `Those dates aren't available. Next open ${nights}-night stretch: <strong>${formatDateRangeLabel(suggestion.checkin, suggestion.checkout)}</strong> — ` +
            `<button type="button" class="availability-suggest-btn" data-checkin="${suggestion.checkin}" data-checkout="${suggestion.checkout}">Use these dates</button>`
        );
    };

    const checkAndWarn = (checkinId, checkoutId, warningId) => {
        const ci = document.getElementById(checkinId)?.value;
        const co = document.getElementById(checkoutId)?.value;
        if (!isValidDateRange(ci, co) || blockedRanges.length === 0) {
            hideAvailabilityNotice(warningId);
            return;
        }
        if (hasOverlap(ci, co)) {
            renderUnavailableSuggestion(warningId, ci, co);
        } else {
            hideAvailabilityNotice(warningId);
        }
    };

    // "Use these dates" buttons rendered inside a suggestion (hero and
    // contact form share this one delegated handler).
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.availability-suggest-btn');
        if (!btn) return;
        const { checkin, checkout } = btn.dataset;
        const warningEl = btn.closest('[id$="AvailabilityWarning"]');
        if (!warningEl) return;
        const isHero = warningEl.id === 'stripAvailabilityWarning';

        const ciEl = document.getElementById(isHero ? 'checkin' : 'contactCheckin');
        const coEl = document.getElementById(isHero ? 'checkout' : 'contactCheckout');
        if (ciEl) { ciEl.value = checkin; ciEl.dispatchEvent(new Event('change')); }
        if (coEl) { coEl.value = checkout; coEl.dispatchEvent(new Event('change')); }

        hideAvailabilityNotice(warningEl.id);

        if (isHero) {
            copyHeroToContact();
            scrollToBooking();
        }
    });

    // ---- Hero "Check Availability" / "Reserve Now" button ----
    // Carries the strip values into the booking form at the bottom and
    // smooth-scrolls to it (no popup) once the chosen dates check out.
    const scrollToBooking = () => {
        const target = document.getElementById('contact');
        if (!target) return;
        const navEl = document.querySelector('.navbar');
        const navHeight = navEl ? navEl.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
    };

    const copyHeroToContact = () => {
        const fieldMap = [
            ['checkin', 'contactCheckin', 'change'],
            ['checkout', 'contactCheckout', 'change'],
            ['adults', 'contactAdults', 'input'],
            ['kids', 'contactKids', 'input'],
        ];
        fieldMap.forEach(([from, to, evt]) => {
            const src = document.getElementById(from);
            const dst = document.getElementById(to);
            if (src && dst && src.value !== '') {
                dst.value = src.value;
                dst.dispatchEvent(new Event(evt));
            }
        });
    };

    const checkAvailabilityBtn = document.getElementById('checkAvailabilityBtn');

    const updateHeroButtonLabel = () => {
        if (!checkAvailabilityBtn) return;
        checkAvailabilityBtn.textContent = isValidDateRange(checkinInput?.value, checkoutInput?.value)
            ? 'Reserve Now'
            : 'Check Availability';
    };
    updateHeroButtonLabel();

    if (checkAvailabilityBtn) {
        checkAvailabilityBtn.addEventListener('click', () => {
            const checkin = checkinInput?.value;
            const checkout = checkoutInput?.value;

            if (!isValidDateRange(checkin, checkout)) {
                renderAvailabilityNotice('stripAvailabilityWarning', 'Please select both a check-in and check-out date.');
                return;
            }

            if (hasOverlap(checkin, checkout)) {
                renderUnavailableSuggestion('stripAvailabilityWarning', checkin, checkout);
                return;
            }

            hideAvailabilityNotice('stripAvailabilityWarning');
            copyHeroToContact();
            scrollToBooking();
        });
    }

    // ---- Mobile CTA + sticky bar ----
    // Neither has its own date inputs (the booking strip is hidden on
    // mobile), so both track the contact form's own check-in/check-out —
    // the only date inputs mobile guests actually see until they scroll
    // down. Both just navigate to the contact form; the real validation
    // and suggestion UI live there via contactAvailabilityWarning.
    const heroCtaMobile = document.getElementById('heroCtaMobile');
    const stickyBar = document.getElementById('stickyAvailabilityBar');
    const stickyBtn = document.getElementById('stickyAvailabilityBtn');
    const stickyText = document.getElementById('stickyAvailabilityText');

    const updateMobileAvailabilityUI = () => {
        const ci = contactCheckin?.value;
        const co = contactCheckout?.value;
        const valid = isValidDateRange(ci, co);
        const label = valid ? 'Reserve Now' : 'Check Availability';

        if (heroCtaMobile) heroCtaMobile.textContent = label;
        if (stickyBtn) stickyBtn.textContent = label;
        if (stickyText) {
            if (valid) {
                const nights = nightsBetween(ci, co);
                stickyText.textContent = `${formatDateRangeLabel(ci, co)} · ${nights} night${nights === 1 ? '' : 's'}`;
            } else {
                stickyText.textContent = 'Select your dates to reserve';
            }
        }
    };
    updateMobileAvailabilityUI();

    // Opens the check-in field's native date picker. Called synchronously
    // inside the click handlers below (not after a delay) so it still
    // counts as part of the same user gesture — required by showPicker()
    // in most browsers. preventScroll stops the browser's own "scroll the
    // focused field into view" from fighting with our smooth scroll.
    const openMobileDatePicker = () => {
        if (!contactCheckin) return;
        contactCheckin.focus({ preventScroll: true });
        if (typeof contactCheckin.showPicker === 'function') {
            try {
                contactCheckin.showPicker();
            } catch {
                // Needs a user gesture or unsupported in this browser;
                // the focus() above still opens it on iOS Safari.
            }
        }
    };

    const goToBookingForm = () => {
        scrollToBooking();
        if (!isValidDateRange(contactCheckin?.value, contactCheckout?.value)) {
            openMobileDatePicker();
        }
    };

    if (heroCtaMobile) {
        heroCtaMobile.addEventListener('click', (e) => {
            e.preventDefault();
            goToBookingForm();
        });
    }
    if (stickyBtn) stickyBtn.addEventListener('click', goToBookingForm);

    const heroSection = document.getElementById('hero');
    if (stickyBar && heroSection) {
        const heroObserver = new IntersectionObserver(
            ([entry]) => stickyBar.classList.toggle('visible', !entry.isIntersecting),
            { threshold: 0 }
        );
        heroObserver.observe(heroSection);
    }

    // Max Guest Logic (Max 10)
    const MAX_GUESTS = 10;
    const enforceMaxGuests = (adultsInput, kidsInput) => {
        const updateMax = (e) => {
            let adults = parseInt(adultsInput.value) || 0;
            let kids = parseInt(kidsInput.value) || 0;

            if (adults + kids > MAX_GUESTS) {
                if (e && e.target === adultsInput) {
                    kidsInput.value = Math.max(0, MAX_GUESTS - adults);
                } else if (e && e.target === kidsInput) {
                    adultsInput.value = Math.max(1, MAX_GUESTS - kids);
                }
            }

            adults = parseInt(adultsInput.value) || 0;
            kids = parseInt(kidsInput.value) || 0;

            adultsInput.max = MAX_GUESTS - kids;
            kidsInput.max = MAX_GUESTS - adults;
        };

        adultsInput.addEventListener('input', updateMax);
        kidsInput.addEventListener('input', updateMax);
        updateMax();
    };

    const heroAdults = document.getElementById('adults');
    const heroKids = document.getElementById('kids');
    const contactAdults = document.getElementById('contactAdults');
    const contactKids = document.getElementById('contactKids');

    if (heroAdults && heroKids) enforceMaxGuests(heroAdults, heroKids);
    if (contactAdults && contactKids) enforceMaxGuests(contactAdults, contactKids);

    // Contact Form WhatsApp Logic (booking request)
    // Saves the request to the backend first (which enforces the 48h hold /
    // double-booking check) and only opens WhatsApp once the save succeeds.
    const btnContactFormWhatsapp = document.getElementById('btnContactFormWhatsapp');
    if (btnContactFormWhatsapp) {
        btnContactFormWhatsapp.addEventListener('click', async () => {
            const checkin = document.getElementById('contactCheckin').value;
            const checkout = document.getElementById('contactCheckout').value;
            const adults = document.getElementById('contactAdults').value;
            const kids = document.getElementById('contactKids').value;
            const name = document.getElementById('contactName').value;
            const email = document.getElementById('contactEmail').value;
            const phone = document.getElementById('contactPhone').value;
            const transfer = document.getElementById('contactTransfer').checked;
            const notes = document.getElementById('contactMessage').value;

            hideFormMessage('contactFormSuccess');

            if (!name || !phone || !checkin || !checkout) {
                showFormError('contactFormError', 'Please fill in your Name, Phone Number, Check-in, and Check-out dates.');
                return;
            }

            if (new Date(checkout) <= new Date(checkin)) {
                showFormError('contactFormError', 'Check-out date must be after your Check-in date.');
                return;
            }

            const originalLabel = btnContactFormWhatsapp.textContent;
            btnContactFormWhatsapp.disabled = true;
            btnContactFormWhatsapp.textContent = 'Checking availability...';

            try {
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ checkin, checkout, name, email, phone, adults, kids, notes }),
                });
                const result = await response.json().catch(() => ({ ok: false }));

                if (!response.ok || !result.ok) {
                    if (result.error === 'unavailable') {
                        showFormError('contactFormError', 'Sorry, those dates just became unavailable. Please choose different dates.');
                    } else if (result.error === 'too_many_guests') {
                        showFormError('contactFormError', `We can take a maximum of ${MAX_GUESTS} guests per booking. Please adjust your guest count.`);
                    } else if (result.error === 'invalid_email') {
                        showFormError('contactFormError', 'That email address doesn\'t look right — please double-check it.');
                    } else if (result.error === 'invalid_phone') {
                        showFormError('contactFormError', 'That phone number doesn\'t look right — please double-check it.');
                    } else if (result.error === 'invalid_dates') {
                        showFormError('contactFormError', 'Please choose valid check-in/check-out dates (not in the past, within the next 2 years).');
                    } else if (result.error === 'rate_limited') {
                        showFormError('contactFormError', "You've submitted a few requests already — please wait a bit before trying again, or message us on WhatsApp directly.");
                    } else {
                        showFormError('contactFormError', "Couldn't save your request right now. Please try again, or message us directly on WhatsApp.");
                    }
                    return;
                }

                showFormSuccess('contactFormSuccess', "Your request has been saved! Opening WhatsApp so you can send it to us directly — we'll confirm availability shortly.");

                const whatsappNumber = "254715257111";
                const message = encodeURIComponent(
                    `Hello Banana Villas Watamu! I would like to request a booking.\n\n*Name:* ${name}\n*Email:* ${email ? email : 'N/A'}\n*Phone:* ${phone}\n*Check-in:* ${checkin}\n*Check-out:* ${checkout}\n*Guests:* ${adults} Adults, ${kids} Kids\n*Airport transfer:* ${transfer ? 'Yes, please' : 'Not needed'}${notes ? `\n*Message:* ${notes}` : ''}\n\nPlease let me know about availability!`
                );
                const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;

                window.open(whatsappUrl, '_blank');
            } catch (err) {
                console.error('booking request failed', err);
                showFormError('contactFormError', "Couldn't save your request right now. Please try again, or message us directly on WhatsApp.");
            } finally {
                btnContactFormWhatsapp.disabled = false;
                btnContactFormWhatsapp.textContent = originalLabel;
            }
        });
    }

    // Lightbox Logic
    // galleryItems is re-populated by initLightbox(), which is called again
    // after the gallery grid is replaced with images loaded from Supabase
    // (see loadGallery below), so dynamically-added photos stay clickable.
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');

    let galleryItems = [];
    let currentImageIndex = 0;

    const updateLightboxImage = () => {
        if (galleryItems[currentImageIndex]) {
            lightboxImg.src = galleryItems[currentImageIndex].src;
        }
    };

    const closeLightbox = () => {
        lightbox.classList.remove('show');
        document.body.style.overflow = ''; // Restore scrolling
    };

    const initLightbox = () => {
        galleryItems = Array.from(document.querySelectorAll('.gallery-item img'));
        galleryItems.forEach((item, index) => {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                currentImageIndex = index;
                updateLightboxImage();
                lightbox.classList.add('show');
                document.body.style.overflow = 'hidden'; // Prevent scrolling
            });
        });
    };

    if (lightbox) {
        initLightbox();

        lightboxClose.addEventListener('click', closeLightbox);

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === document.querySelector('.lightbox-content')) {
                closeLightbox();
            }
        });

        lightboxPrev.addEventListener('click', () => {
            if (galleryItems.length === 0) return;
            currentImageIndex = (currentImageIndex - 1 + galleryItems.length) % galleryItems.length;
            updateLightboxImage();
        });

        lightboxNext.addEventListener('click', () => {
            if (galleryItems.length === 0) return;
            currentImageIndex = (currentImageIndex + 1) % galleryItems.length;
            updateLightboxImage();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('show')) return;

            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') lightboxPrev.click();
            if (e.key === 'ArrowRight') lightboxNext.click();
        });

        // Touch swipe support
        let touchStartX = 0;
        lightbox.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        lightbox.addEventListener('touchend', (e) => {
            const delta = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(delta) > 50) {
                if (delta < 0) lightboxNext.click();
                else lightboxPrev.click();
            }
        }, { passive: true });
    }

    // FAQ Accordion
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const answer = btn.nextElementSibling;
            const isOpen = btn.getAttribute('aria-expanded') === 'true';

            document.querySelectorAll('.faq-question').forEach(b => {
                b.setAttribute('aria-expanded', 'false');
                b.nextElementSibling.classList.remove('open');
            });

            if (!isOpen) {
                btn.setAttribute('aria-expanded', 'true');
                answer.classList.add('open');
            }
        });
    });

    // Sticky WhatsApp float button
    const whatsappFloat = document.querySelector('.whatsapp-float');
    if (whatsappFloat) {
        window.addEventListener('scroll', () => {
            whatsappFloat.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
    }

    // Reviews — loaded from Supabase, replacing the hardcoded testimonial
    // cards. If the fetch fails or there's nothing published yet, the
    // hardcoded cards already in the HTML are left in place as a fallback.
    const loadReviews = async () => {
        if (typeof sbClient === 'undefined') return;
        try {
            const { data, error } = await sbClient
                .from('reviews')
                .select('*')
                .eq('published', true)
                .order('review_date', { ascending: false });

            if (error || !data || data.length === 0) return;

            const grid = document.getElementById('testimonialsGrid');
            if (!grid) return;

            grid.innerHTML = data.map((r, i) => {
                const initials = (r.guest_name || '')
                    .split(' ')
                    .filter(Boolean)
                    .map(w => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || '?';
                const rating = Math.max(0, Math.min(5, r.rating || 0));
                const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                const dateLabel = r.review_date
                    ? new Date(r.review_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '';

                return `
                    <div class="glass-card testimonial-card fade-up" style="transition-delay: ${(i % 3) * 0.1}s;">
                        <div class="stars">${stars}</div>
                        <p class="testimonial-text">"${escapeHtml(r.body)}"</p>
                        <div class="testimonial-author">
                            <div class="author-avatar">${escapeHtml(initials)}</div>
                            <div>
                                <div class="author-name">${escapeHtml(r.guest_name)}</div>
                                <div class="author-meta">${escapeHtml(dateLabel)}</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            grid.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
        } catch (err) {
            console.error('failed to load reviews', err);
        }
    };

    // Gallery — loaded from Supabase, replacing the hardcoded <img> list.
    // Bento layout variety is auto-assigned by cycling through the same
    // visual rhythm the original hardcoded markup used, so admins never
    // have to pick CSS classes when uploading photos.
    const GALLERY_BENTO_PATTERN = [
        'bento-large', '', 'bento-wide', '', 'bento-tall', '', '', '',
        'bento-wide', '', '', '', 'bento-large', '', '', 'bento-wide', '', '', 'bento-tall', ''
    ];

    // Mobile "peek-a-boo" carousel overlay — a live position counter and,
    // for reasonably-sized galleries, tappable dots. Only visible on
    // mobile via CSS; harmless to run unconditionally since the grid
    // doesn't scroll horizontally on desktop.
    const MAX_GALLERY_DOTS = 10;
    const initGalleryCarousel = () => {
        const grid = document.getElementById('galleryGrid');
        const counter = document.getElementById('galleryCounter');
        const dotsWrap = document.getElementById('galleryDots');
        if (!grid || !counter || !dotsWrap) return;

        const items = Array.from(grid.querySelectorAll('.gallery-item'));
        if (items.length === 0) {
            counter.style.display = 'none';
            dotsWrap.style.display = 'none';
            return;
        }
        counter.style.display = '';
        counter.textContent = `1 / ${items.length}`;

        const showDots = items.length <= MAX_GALLERY_DOTS;
        dotsWrap.style.display = showDots ? '' : 'none';
        dotsWrap.innerHTML = showDots
            ? items.map((_, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Go to photo ${i + 1}"></button>`).join('')
            : '';

        // Content (counter/dots) is rebuilt every call since the image set
        // can change (Supabase load replacing the static fallback), but
        // the scroll/click listeners are bound to the grid element once —
        // it's reused across calls, so re-adding them would stack
        // duplicate listeners.
        if (!grid.dataset.carouselBound) {
            grid.dataset.carouselBound = 'true';

            const updateActive = () => {
                const els = Array.from(grid.querySelectorAll('.gallery-item'));
                if (els.length === 0) return;
                const step = els.length > 1 ? (els[1].offsetLeft - els[0].offsetLeft) : els[0].offsetWidth;
                const index = Math.min(els.length - 1, Math.max(0, Math.round(grid.scrollLeft / (step || 1))));
                counter.textContent = `${index + 1} / ${els.length}`;
                dotsWrap.querySelectorAll('button').forEach((d, i) => d.classList.toggle('active', i === index));
            };

            let ticking = false;
            grid.addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => { updateActive(); ticking = false; });
            }, { passive: true });

            dotsWrap.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-index]');
                if (!btn) return;
                const target = grid.querySelectorAll('.gallery-item')[parseInt(btn.dataset.index, 10)];
                if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            });
        }
    };
    initGalleryCarousel();

    const loadGallery = async () => {
        if (typeof sbClient === 'undefined') return;
        try {
            const { data, error } = await sbClient
                .from('gallery_images')
                .select('*')
                .eq('visible', true)
                .order('sort_order', { ascending: true });

            if (error || !data || data.length === 0) return;

            const grid = document.getElementById('galleryGrid');
            if (!grid) return;

            grid.innerHTML = data.map((img, i) => {
                const bentoClass = GALLERY_BENTO_PATTERN[i % GALLERY_BENTO_PATTERN.length];
                const classes = ['gallery-item', 'fade-up', bentoClass].filter(Boolean).join(' ');
                const alt = escapeHtml(img.alt_text || 'Banana Villas Watamu');
                return `<div class="${classes}"><img src="${escapeHtml(img.public_url)}" loading="lazy" alt="${alt}"></div>`;
            }).join('');

            grid.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
            initLightbox();
            initGalleryCarousel();
        } catch (err) {
            console.error('failed to load gallery', err);
        }
    };

    loadReviews();
    loadGallery();

    // Populates blockedRanges (declared up with the availability helpers
    // above) and wires up live re-checking as any date field changes. The
    // real double-booking guard still runs server-side in
    // request_booking() when the form is actually submitted — this is
    // just the live heads-up + "next available" suggestion UI.
    fetch('/api/blocked-dates')
        .then(r => (r.ok ? r.json() : []))
        .then(ranges => {
            blockedRanges = Array.isArray(ranges) ? ranges : [];
            checkAndWarn('checkin', 'checkout', 'stripAvailabilityWarning');
            checkAndWarn('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning');
        })
        .catch(err => console.error('failed to load blocked dates', err));

    if (checkinInput) checkinInput.addEventListener('change', () => {
        checkAndWarn('checkin', 'checkout', 'stripAvailabilityWarning');
        updateHeroButtonLabel();
    });
    if (checkoutInput) checkoutInput.addEventListener('change', () => {
        checkAndWarn('checkin', 'checkout', 'stripAvailabilityWarning');
        updateHeroButtonLabel();
    });
    if (contactCheckin) contactCheckin.addEventListener('change', () => {
        checkAndWarn('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning');
        updateMobileAvailabilityUI();
    });
    if (contactCheckout) contactCheckout.addEventListener('change', () => {
        checkAndWarn('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning');
        updateMobileAvailabilityUI();
    });

});
