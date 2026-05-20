document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

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

    // Modal Logic
    const modal = document.getElementById('bookingModal');
    const checkAvailabilityBtn = document.getElementById('checkAvailabilityBtn');
    const closeModal = document.querySelector('.close-modal');
    
    if (checkAvailabilityBtn && modal) {
        checkAvailabilityBtn.addEventListener('click', () => {
            document.getElementById('modalCheckin').value = document.getElementById('checkin').value;
            document.getElementById('modalCheckout').value = document.getElementById('checkout').value;
            document.getElementById('modalAdults').value = document.getElementById('adults').value;
            document.getElementById('modalKids').value = document.getElementById('kids').value;
            
            modal.classList.add('show');
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }
    
    // Close modal when clicking outside of modal content
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // Max Guest Logic (Max 8)
    const enforceMaxGuests = (adultsInput, kidsInput) => {
        const updateMax = (e) => {
            let adults = parseInt(adultsInput.value) || 0;
            let kids = parseInt(kidsInput.value) || 0;
            
            if (adults + kids > 8) {
                if (e && e.target === adultsInput) {
                    kidsInput.value = Math.max(0, 8 - adults);
                } else if (e && e.target === kidsInput) {
                    adultsInput.value = Math.max(1, 8 - kids);
                }
            }
            
            adults = parseInt(adultsInput.value) || 0;
            kids = parseInt(kidsInput.value) || 0;

            adultsInput.max = 8 - kids;
            kidsInput.max = 8 - adults;
        };

        adultsInput.addEventListener('input', updateMax);
        kidsInput.addEventListener('input', updateMax);
        updateMax();
    };

    const heroAdults = document.getElementById('adults');
    const heroKids = document.getElementById('kids');
    const modalAdults = document.getElementById('modalAdults');
    const modalKids = document.getElementById('modalKids');

    if (heroAdults && heroKids) enforceMaxGuests(heroAdults, heroKids);
    if (modalAdults && modalKids) enforceMaxGuests(modalAdults, modalKids);

    // WhatsApp Booking Logic
    const btnWhatsapp = document.getElementById('btnWhatsapp');
    if (btnWhatsapp) {
        btnWhatsapp.addEventListener('click', () => {
            const checkin = document.getElementById('modalCheckin').value;
            const checkout = document.getElementById('modalCheckout').value;
            const adults = document.getElementById('modalAdults').value;
            const kids = document.getElementById('modalKids').value;
            const name = document.getElementById('modalName').value;
            const email = document.getElementById('modalEmail').value;
            const phone = document.getElementById('modalPhone').value;
            
            if (!name || !phone || !checkin || !checkout) {
                alert("Please fill in your Name, Phone Number, Check-in, and Check-out dates to request via WhatsApp.");
                return;
            }

            if (new Date(checkout) <= new Date(checkin)) {
                alert("Check-out date must be after your Check-in date.");
                return;
            }

            const message = encodeURIComponent(
                `Hello Banana Villas Watamu! I would like to request a booking.\n\n*Name:* ${name}\n*Email:* ${email}\n*Phone:* ${phone}\n*Check-in:* ${checkin}\n*Check-out:* ${checkout}\n*Guests:* ${adults} Adults, ${kids} Kids\n\nPlease let me know about availability!`
            );
            
            const whatsappNumber = "254715257111"; 
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;
            
            window.open(whatsappUrl, '_blank');
        });
    }

    // Contact Form WhatsApp Logic
    const btnContactFormWhatsapp = document.getElementById('btnContactFormWhatsapp');
    if (btnContactFormWhatsapp) {
        btnContactFormWhatsapp.addEventListener('click', () => {
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const messageText = document.getElementById('message').value;
            
            if (!name || !messageText) {
                alert("Please fill in your Name and Message to send via WhatsApp.");
                return;
            }

            const whatsappNumber = "254715257111"; 
            const message = encodeURIComponent(
                `Hello Banana Villas Watamu!\n\n*Name:* ${name}\n*Email:* ${email ? email : 'N/A'}\n*Message:* ${messageText}`
            );
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;
            
            window.open(whatsappUrl, '_blank');
        });
    }

    // Lightbox Logic
    const galleryItems = document.querySelectorAll('.gallery-item img');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');
    
    let currentImageIndex = 0;

    if (lightbox && galleryItems.length > 0) {
        galleryItems.forEach((item, index) => {
            item.style.cursor = 'pointer';
            
            item.addEventListener('click', () => {
                currentImageIndex = index;
                updateLightboxImage();
                lightbox.classList.add('show');
                document.body.style.overflow = 'hidden'; // Prevent scrolling
            });
        });

        const updateLightboxImage = () => {
            lightboxImg.src = galleryItems[currentImageIndex].src;
        };

        const closeLightbox = () => {
            lightbox.classList.remove('show');
            document.body.style.overflow = ''; // Restore scrolling
        };

        lightboxClose.addEventListener('click', closeLightbox);
        
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === document.querySelector('.lightbox-content')) {
                closeLightbox();
            }
        });

        lightboxPrev.addEventListener('click', () => {
            currentImageIndex = (currentImageIndex - 1 + galleryItems.length) % galleryItems.length;
            updateLightboxImage();
        });

        lightboxNext.addEventListener('click', () => {
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
});
