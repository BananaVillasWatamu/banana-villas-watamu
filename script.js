document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Inline form error helper
    const showFormError = (id, message) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
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

    // Hero "Request Availability" — carry the strip values into the booking
    // form at the bottom and smooth-scroll to it (no popup).
    const scrollToBooking = () => {
        const target = document.getElementById('contact');
        if (!target) return;
        const navEl = document.querySelector('.navbar');
        const navHeight = navEl ? navEl.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
    };

    const checkAvailabilityBtn = document.getElementById('checkAvailabilityBtn');
    if (checkAvailabilityBtn) {
        checkAvailabilityBtn.addEventListener('click', () => {
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
            scrollToBooking();
        });
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
        } catch (err) {
            console.error('failed to load gallery', err);
        }
    };

    loadReviews();
    loadGallery();

    // Blocked-dates heads-up — a UX nicety only. The real double-booking
    // guard runs server-side in request_booking() when the form is
    // actually submitted, so this is purely informational.
    let blockedRanges = [];

    const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

    const checkBlockedDates = (checkinId, checkoutId, warningId) => {
        const warningEl = document.getElementById(warningId);
        if (!warningEl) return;

        const ci = document.getElementById(checkinId)?.value;
        const co = document.getElementById(checkoutId)?.value;

        if (!ci || !co || blockedRanges.length === 0) {
            warningEl.style.display = 'none';
            return;
        }

        const start = new Date(ci);
        const end = new Date(co);
        const overlaps = blockedRanges.some(r =>
            rangesOverlap(start, end, new Date(r.checkin), new Date(r.checkout))
        );

        warningEl.textContent = overlaps
            ? "Heads up: part of this date range looks unavailable. We'll confirm when you submit."
            : '';
        warningEl.style.display = overlaps ? 'block' : 'none';
    };

    fetch('/api/blocked-dates')
        .then(r => (r.ok ? r.json() : []))
        .then(ranges => {
            blockedRanges = Array.isArray(ranges) ? ranges : [];
            checkBlockedDates('checkin', 'checkout', 'stripAvailabilityWarning');
            checkBlockedDates('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning');
        })
        .catch(err => console.error('failed to load blocked dates', err));

    if (checkinInput) checkinInput.addEventListener('change', () => checkBlockedDates('checkin', 'checkout', 'stripAvailabilityWarning'));
    if (checkoutInput) checkoutInput.addEventListener('change', () => checkBlockedDates('checkin', 'checkout', 'stripAvailabilityWarning'));
    if (contactCheckin) contactCheckin.addEventListener('change', () => checkBlockedDates('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning'));
    if (contactCheckout) contactCheckout.addEventListener('change', () => checkBlockedDates('contactCheckin', 'contactCheckout', 'contactAvailabilityWarning'));

});
