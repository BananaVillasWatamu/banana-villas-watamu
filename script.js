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

    if (heroCtaMobile) {
        heroCtaMobile.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToBooking();
        });
    }
    if (stickyBtn) stickyBtn.addEventListener('click', scrollToBooking);

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

    // An activity card on /activities links back here as ?activity=Bike+Hire.
    // Prefilling the message means the enquiry lands in the dashboard saying
    // what the guest actually wanted, so demand per activity is visible
    // rather than guessed at.
    const prefillActivityEnquiry = () => {
        const requested = new URLSearchParams(window.location.search).get('activity');
        if (!requested) return;

        const message = document.getElementById('contactMessage');
        const contact = document.getElementById('contact');
        if (!message || !contact) return;

        const line = `I'd like to know more about: ${requested.slice(0, 120)}`;
        message.value = message.value ? `${message.value}\n${line}` : line;

        // Land on the form rather than the top of the page.
        requestAnimationFrame(() => {
            contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
            message.classList.add('field-highlight');
            setTimeout(() => message.classList.remove('field-highlight'), 2500);
        });
    };

    prefillActivityEnquiry();

    // The form never submits on its own — both paths are driven by the two
    // buttons below. This used to be an inline onsubmit attribute, which
    // would have forced 'unsafe-inline' into the page's script policy.
    const contactFormEl = document.getElementById('contactForm');
    if (contactFormEl) {
        contactFormEl.addEventListener('submit', (e) => e.preventDefault());
    }

    // Contact form (booking request)
    //
    // Two ways out of this form, and both leave the guest's details with us:
    // "Confirm Booking" saves the request (which enforces the 48h hold and
    // the double-booking check), while the WhatsApp link opens the chat
    // immediately and logs the enquiry in the background — so a half-filled
    // form, or dates that turn out to be taken, still reach the owner
    // instead of disappearing into a chat we never see.
    const WHATSAPP_NUMBER = '254715257111';

    const readContactForm = () => ({
        checkin: document.getElementById('contactCheckin').value,
        checkout: document.getElementById('contactCheckout').value,
        adults: document.getElementById('contactAdults').value,
        kids: document.getElementById('contactKids').value,
        name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        phone: document.getElementById('contactPhone').value,
        transfer: document.getElementById('contactTransfer').checked,
        notes: document.getElementById('contactMessage').value,
    });

    // Returns an error message, or null when the form is complete enough to
    // ask for a hold.
    const validateContactForm = (f) => {
        if (!f.name || !f.phone || !f.checkin || !f.checkout) {
            return 'Please fill in your Name, Phone Number, Check-in, and Check-out dates.';
        }
        if (new Date(f.checkout) <= new Date(f.checkin)) {
            return 'Check-out date must be after your Check-in date.';
        }
        return null;
    };

    const buildWhatsappUrl = (f) => {
        const lines = [
            'Hello Banana Villas Watamu! I would like to request a booking.',
            '',
            `*Name:* ${f.name || 'N/A'}`,
            `*Email:* ${f.email || 'N/A'}`,
            `*Phone:* ${f.phone || 'N/A'}`,
            `*Check-in:* ${f.checkin || 'N/A'}`,
            `*Check-out:* ${f.checkout || 'N/A'}`,
            `*Guests:* ${f.adults || 0} Adults, ${f.kids || 0} Kids`,
            `*Airport transfer:* ${f.transfer ? 'Yes, please' : 'Not needed'}`,
        ];
        if (f.notes) lines.push(`*Message:* ${f.notes}`);
        lines.push('', 'Please let me know about availability!');
        return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
    };

    const bookingErrorMessage = (result) => {
        switch (result.error) {
            case 'unavailable':
                return 'Sorry, those dates just became unavailable. Please choose different dates.';
            case 'too_many_guests':
                return `We can take a maximum of ${MAX_GUESTS} guests per booking. Please adjust your guest count.`;
            case 'invalid_email':
                return "That email address doesn't look right — please double-check it.";
            case 'invalid_phone':
                return "That phone number doesn't look right — please double-check it.";
            case 'invalid_dates':
                return 'Please choose valid check-in/check-out dates (not in the past, within the next 2 years).';
            case 'rate_limited':
                return "You've submitted a few requests already — please wait a bit before trying again, or message us on WhatsApp directly.";
            default:
                return "Couldn't save your request right now. Please try again, or message us directly on WhatsApp.";
        }
    };

    // channel records how the guest chose to reach us, so the owner can see
    // in the dashboard which enquiries are still waiting in WhatsApp.
    const postBookingRequest = (f, channel, keepalive = false) =>
        fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive,
            body: JSON.stringify({
                checkin: f.checkin,
                checkout: f.checkout,
                name: f.name,
                email: f.email,
                phone: f.phone,
                adults: f.adults,
                kids: f.kids,
                notes: f.notes,
                transfer: f.transfer,
                channel,
            }),
        });

    const btnContactFormSubmit = document.getElementById('btnContactFormSubmit');
    if (btnContactFormSubmit) {
        btnContactFormSubmit.addEventListener('click', async () => {
            const fields = readContactForm();
            hideFormMessage('contactFormSuccess');

            const validationError = validateContactForm(fields);
            if (validationError) {
                showFormError('contactFormError', validationError);
                return;
            }

            const originalLabel = btnContactFormSubmit.innerHTML;
            btnContactFormSubmit.disabled = true;
            btnContactFormSubmit.textContent = 'Checking availability...';

            try {
                const response = await postBookingRequest(fields, 'form');
                const result = await response.json().catch(() => ({ ok: false }));

                if (!response.ok || !result.ok) {
                    showFormError('contactFormError', bookingErrorMessage(result));
                    return;
                }

                showFormSuccess('contactFormSuccess', "Your request is in! We're holding these dates for you and will confirm shortly — send it over on WhatsApp too if you'd like a faster reply.");
            } catch (err) {
                console.error('booking request failed', err);
                showFormError('contactFormError', "Couldn't save your request right now. Please try again, or message us directly on WhatsApp.");
            } finally {
                btnContactFormSubmit.disabled = false;
                btnContactFormSubmit.innerHTML = originalLabel;
            }
        });
    }

    const btnContactFormWhatsapp = document.getElementById('btnContactFormWhatsapp');
    if (btnContactFormWhatsapp) {
        btnContactFormWhatsapp.addEventListener('click', () => {
            const fields = readContactForm();
            hideFormMessage('contactFormSuccess');

            // Opened synchronously, before any await, so the browser still
            // counts it as part of the click and doesn't block the popup.
            // Nothing about saving the enquiry should stand between the guest
            // and the chat.
            window.open(buildWhatsappUrl(fields), '_blank');

            // A complete form can still take the 48h hold; anything less is
            // logged as a plain enquiry so the lead isn't lost either way.
            // keepalive keeps the request going once the tab is backgrounded
            // on the way to WhatsApp.
            const isComplete = validateContactForm(fields) === null;
            const request = isComplete
                ? postBookingRequest(fields, 'whatsapp', true)
                : fetch('/api/enquiries', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      keepalive: true,
                      body: JSON.stringify({ ...fields, channel: 'whatsapp', outcome: 'whatsapp_only' }),
                  });

            request
                .then(async (response) => {
                    if (!isComplete) return;
                    const result = await response.json().catch(() => ({ ok: false }));
                    if (result.ok) {
                        showFormSuccess('contactFormSuccess', "Sent to WhatsApp — and we're holding these dates for you while we confirm.");
                    } else if (result.error === 'unavailable') {
                        showFormError('contactFormError', "We've got your enquiry, but those dates look taken — mention alternative dates in your message and we'll find you a spot.");
                    } else {
                        showFormError('contactFormError', bookingErrorMessage(result));
                    }
                })
                .catch((err) => {
                    console.error('enquiry capture failed', err);
                });
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

    // FAQ Accordion — delegated, so it keeps working after loadFaqs()
    // swaps the list out for the questions stored in Supabase.
    const faqList = document.getElementById('faqList');
    if (faqList) {
        faqList.addEventListener('click', (e) => {
            const btn = e.target.closest('.faq-question');
            if (!btn) return;

            const answer = btn.nextElementSibling;
            const isOpen = btn.getAttribute('aria-expanded') === 'true';

            faqList.querySelectorAll('.faq-question').forEach(b => {
                b.setAttribute('aria-expanded', 'false');
                b.nextElementSibling.classList.remove('open');
            });

            if (!isOpen) {
                btn.setAttribute('aria-expanded', 'true');
                answer.classList.add('open');
            }
        });
    }

    // Sticky WhatsApp float button
    const whatsappFloat = document.querySelector('.whatsapp-float');
    if (whatsappFloat) {
        window.addEventListener('scroll', () => {
            whatsappFloat.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
    }

    // Skeleton loaders.
    //
    // Each section on this page ships with real content baked into the HTML,
    // which is also the fallback when Supabase can't be reached. So a
    // skeleton stashes that markup rather than discarding it: on success the
    // real rows replace it, and on failure (or an empty table) restore() puts
    // the built-in content straight back.
    const withSkeleton = (el, html) => {
        if (!el) return { restore: () => {} };
        const original = el.innerHTML;
        el.innerHTML = html;
        el.setAttribute('aria-busy', 'true');
        return {
            restore: () => {
                el.innerHTML = original;
                el.removeAttribute('aria-busy');
            },
            done: () => el.removeAttribute('aria-busy'),
        };
    };

    const repeat = (count, html) => Array.from({ length: count }, () => html).join('');

    const reviewsSkeleton = () => repeat(3, `
        <div class="skeleton-card">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line medium"></div>
            <div class="skeleton-author">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-line short"></div>
                    <div class="skeleton skeleton-line" style="width:30%;"></div>
                </div>
            </div>
        </div>`);

    const faqsSkeleton = () => repeat(6, '<div class="skeleton skeleton-faq"></div>');

    // Review sources.
    //
    // Marks are the official ones from simple-icons (CC0), inlined rather
    // than fetched so they cost no request and can take the brand colour.
    // Booking.com is not in that set — it was pulled at the brand's request —
    // and its logo is a wordmark anyway, so it is drawn as type.
    const REVIEW_SOURCES = {
        google: {
            label: 'Google',
            colour: '#4285F4',
            path: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
        },
        airbnb: {
            label: 'Airbnb',
            colour: '#FF5A5F',
            path: 'M12.001 18.275c-1.353-1.697-2.148-3.184-2.413-4.457-.263-1.027-.16-1.848.291-2.465.477-.71 1.188-1.056 2.121-1.056s1.643.345 2.12 1.063c.446.61.558 1.432.286 2.465-.291 1.298-1.085 2.785-2.412 4.458zm9.601 1.14c-.185 1.246-1.034 2.28-2.2 2.783-2.253.98-4.483-.583-6.392-2.704 3.157-3.951 3.74-7.028 2.385-9.018-.795-1.14-1.933-1.695-3.394-1.695-2.944 0-4.563 2.49-3.927 5.382.37 1.565 1.352 3.343 2.917 5.332-.98 1.085-1.91 1.856-2.732 2.333-.636.344-1.245.558-1.828.609-2.679.399-4.778-2.2-3.825-4.88.132-.345.395-.98.845-1.961l.025-.053c1.464-3.178 3.242-6.79 5.285-10.795l.053-.132.58-1.116c.45-.822.635-1.19 1.351-1.643.346-.21.77-.315 1.246-.315.954 0 1.698.558 2.016 1.007.158.239.345.557.582.953l.558 1.089.08.159c2.041 4.004 3.821 7.608 5.279 10.794l.026.025.533 1.22.318.764c.243.613.294 1.222.213 1.858zm1.22-2.39c-.186-.583-.505-1.271-.9-2.094v-.03c-1.889-4.006-3.642-7.608-5.307-10.844l-.111-.163C15.317 1.461 14.468 0 12.001 0c-2.44 0-3.476 1.695-4.535 3.898l-.081.16c-1.669 3.236-3.421 6.843-5.303 10.847v.053l-.559 1.22c-.21.504-.317.768-.345.847C-.172 20.74 2.611 24 5.98 24c.027 0 .132 0 .265-.027h.372c1.75-.213 3.554-1.325 5.384-3.317 1.829 1.989 3.635 3.104 5.382 3.317h.372c.133.027.239.027.265.027 3.37.003 6.152-3.261 4.802-6.975z',
        },
        tripadvisor: {
            label: 'Tripadvisor',
            colour: '#34E0A1',
            path: 'M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 0 0 4.04 10.43 5.976 5.976 0 0 0 4.075-1.6L12 19.705l1.922-2.09a5.972 5.972 0 0 0 4.072 1.598 6 6 0 0 0 6-5.998 5.982 5.982 0 0 0-1.957-4.432L24 6.648h-4.35a13.573 13.573 0 0 0-7.644-2.353zM12 6.255c1.531 0 3.063.303 4.504.903C13.943 8.138 12 10.43 12 13.1c0-2.671-1.942-4.962-4.504-5.942A11.72 11.72 0 0 1 12 6.256zM6.002 9.157a4.059 4.059 0 1 1 0 8.118 4.059 4.059 0 0 1 0-8.118zm11.992.002a4.057 4.057 0 1 1 .003 8.115 4.057 4.057 0 0 1-.003-8.115zm-11.992 1.93a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256zm11.992 0a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256z',
        },
        booking_com: {
            label: 'Booking.com',
            colour: '#003580',
            path: null,
        },
        direct: null,
    };

    const reviewSourceBadge = (review) => {
        const source = REVIEW_SOURCES[review.source];
        if (!source) return '';

        const mark = source.path
            ? `<svg class="review-source-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${source.path}"/></svg>`
            : '';

        const inner = `${mark}<span>${escapeHtml(source.label)}</span>`;
        const style = `--review-source-colour: ${source.colour};`;

        // A link only where there is one to give: a badge that looks
        // clickable and isn't is worse than a plain badge.
        return review.source_url
            ? `<a class="review-source review-source-link" style="${style}" href="${escapeHtml(review.source_url)}"
                  target="_blank" rel="noopener noreferrer"
                  aria-label="Read this review on ${escapeHtml(source.label)}">${inner}<span class="review-source-arrow" aria-hidden="true">&#8599;</span></a>`
            : `<span class="review-source" style="${style}">${inner}</span>`;
    };

    // Reviews — loaded from Supabase, replacing the hardcoded testimonial
    // cards. If the fetch fails or there's nothing published yet, the
    // hardcoded cards already in the HTML are left in place as a fallback.
    const loadReviews = async () => {
        if (typeof sbClient === 'undefined') return;

        const grid = document.getElementById('testimonialsGrid');
        if (!grid) return;
        const skeleton = withSkeleton(grid, reviewsSkeleton());

        try {
            const { data, error } = await sbClient
                .from('reviews')
                .select('*')
                .eq('published', true)
                .order('review_date', { ascending: false });

            if (error || !data || data.length === 0) {
                skeleton.restore();
                return;
            }

            skeleton.done();

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
                        <div class="testimonial-head">
                            <div class="stars">${stars}</div>
                            ${reviewSourceBadge(r)}
                        </div>
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
            skeleton.restore();
        }
    };

    // Header slider — the photos flagged for it in the dashboard, crossfading
    // behind the hero content. Falls back to the CSS background image on the
    // .hero section if nothing is flagged or Supabase can't be reached.
    const HERO_SLIDE_COUNT = 4;
    const HERO_SLIDE_MS = 6000;

    // Supabase public URLs are already percent-encoded, so encodeURI() here
    // would double-encode them (%20 -> %2520) and the image would 404. Only
    // the characters that would break out of url('...') need escaping.
    const cssUrl = (url) => escapeHtml(url).replace(/'/g, '%27');

    const loadHeroSlides = async () => {
        // supabaseClient.js already explains this case in the console.
        if (typeof sbClient === 'undefined') return;

        const stage = document.getElementById('heroSlides');
        const dotsWrap = document.getElementById('heroDots');
        if (!stage) return;

        let images = [];
        try {
            const { data, error } = await sbClient
                .from('gallery_images')
                .select('public_url, alt_text')
                .eq('visible', true)
                .eq('hero_slide', true)
                .order('sort_order', { ascending: true })
                .limit(HERO_SLIDE_COUNT);

            if (error) {
                console.error('[Banana Villas] Header slider query failed', error);
                return;
            }
            if (!data || data.length === 0) {
                console.info(
                    '[Banana Villas] No photos are ticked for the header slider in the ' +
                    'dashboard (Gallery tab), so the built-in hero image is showing instead.'
                );
                return;
            }
            images = data;
        } catch (err) {
            console.error('failed to load header slides', err);
            return;
        }

        stage.innerHTML = images.map((img, i) => `
            <div class="hero-slide${i === 0 ? ' active' : ''}" role="img"
                 aria-label="${escapeHtml(img.alt_text || 'Banana Villas Watamu')}"
                 style="background-image: url('${cssUrl(img.public_url)}');"></div>`).join('');

        const slides = [...stage.querySelectorAll('.hero-slide')];
        if (dotsWrap) {
            dotsWrap.innerHTML = slides.map((_, i) => `
                <button type="button" class="hero-dot${i === 0 ? ' active' : ''}" data-index="${i}"
                        aria-label="Show header image ${i + 1}"></button>`).join('');
        }

        // A single image needs no rotation, dots or timer.
        if (slides.length < 2) {
            if (dotsWrap) dotsWrap.innerHTML = '';
            return;
        }

        let current = 0;
        let timer = null;

        const show = (index) => {
            current = (index + slides.length) % slides.length;
            slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
            if (dotsWrap) {
                dotsWrap.querySelectorAll('.hero-dot').forEach((dot, i) => dot.classList.toggle('active', i === current));
            }
        };

        const stop = () => {
            if (timer) clearInterval(timer);
            timer = null;
        };

        const start = () => {
            stop();
            // Auto-advance is motion the guest didn't ask for; leave it off
            // when they've said they'd rather not have any.
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            timer = setInterval(() => show(current + 1), HERO_SLIDE_MS);
        };

        if (dotsWrap) {
            dotsWrap.addEventListener('click', (e) => {
                const dot = e.target.closest('.hero-dot');
                if (!dot) return;
                show(parseInt(dot.dataset.index, 10) || 0);
                start();
            });
        }

        // No point animating a hero nobody is looking at.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop();
            else start();
        });

        start();
    };

    // FAQs — loaded from Supabase, replacing the hardcoded questions. As
    // with reviews, the markup already in the HTML stays as the fallback if
    // the fetch fails or nothing is published.
    const loadFaqs = async () => {
        if (typeof sbClient === 'undefined') return;

        const list = document.getElementById('faqList');
        if (!list) return;
        const skeleton = withSkeleton(list, faqsSkeleton());

        try {
            const { data, error } = await sbClient
                .from('faqs')
                .select('question, answer')
                .eq('published', true)
                .order('sort_order', { ascending: true });

            if (error || !data || data.length === 0) {
                skeleton.restore();
                return;
            }

            skeleton.done();

            list.innerHTML = data.map((f) => {
                const paragraphs = escapeHtml(f.answer)
                    .split(/\n\s*\n/)
                    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
                    .join('');
                return `
                    <div class="faq-item">
                        <button class="faq-question" aria-expanded="false">${escapeHtml(f.question)} <span
                                class="faq-icon">+</span></button>
                        <div class="faq-answer">${paragraphs}</div>
                    </div>`;
            }).join('');
        } catch (err) {
            console.error('failed to load faqs', err);
            skeleton.restore();
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

    // The skeleton borrows the same bento rhythm the real grid uses, so the
    // layout doesn't jump when the photos arrive.
    const gallerySkeleton = () => Array.from({ length: 8 }, (_, i) => {
        const bentoClass = GALLERY_BENTO_PATTERN[i % GALLERY_BENTO_PATTERN.length];
        return `<div class="gallery-item ${bentoClass}"><div class="skeleton skeleton-tile"></div></div>`;
    }).join('');

    const loadGallery = async () => {
        if (typeof sbClient === 'undefined') return;

        const grid = document.getElementById('galleryGrid');
        if (!grid) return;
        const skeleton = withSkeleton(grid, gallerySkeleton());

        try {
            const { data, error } = await sbClient
                .from('gallery_images')
                .select('*')
                .eq('visible', true)
                .order('sort_order', { ascending: true });

            if (error || !data || data.length === 0) {
                skeleton.restore();
                return;
            }

            skeleton.done();

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
            skeleton.restore();
        }
    };

    loadHeroSlides();
    loadReviews();
    loadFaqs();
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
