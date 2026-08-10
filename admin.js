document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('dashboardView');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const showError = (id, message) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
    };
    const hideError = (id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };
    const escapeHtml = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // ---------- Auth ----------

    const showDashboard = () => {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        loadBookings();
        loadReviews();
        loadGallery();
        loadSeoSettings();
        loadIcalSettings();
    };

    const showLogin = () => {
        dashboardView.style.display = 'none';
        loginView.style.display = 'flex';
    };

    sbClient.auth.getSession().then(({ data }) => {
        if (data.session) showDashboard();
        else showLogin();
    });

    sbClient.auth.onAuthStateChange((_event, session) => {
        if (session) showDashboard();
        else showLogin();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('loginError');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in…';

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const { error } = await sbClient.auth.signInWithPassword({ email, password });

        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';

        if (error) {
            showError('loginError', 'Invalid email or password.');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await sbClient.auth.signOut();
    });

    const authHeader = async () => {
        const { data } = await sbClient.auth.getSession();
        return `Bearer ${data.session?.access_token || ''}`;
    };

    // ---------- Tabs ----------

    document.querySelectorAll('.admin-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
            tabBtn.classList.add('active');
            document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
        });
    });

    // ---------- Bookings ----------

    const bookingsTableBody = document.getElementById('bookingsTableBody');
    const syncIcalBtn = document.getElementById('syncIcalBtn');
    const syncStatus = document.getElementById('syncStatus');

    const formatHoldCountdown = (holdExpiresAt) => {
        if (!holdExpiresAt) return '—';
        const diffMs = new Date(holdExpiresAt).getTime() - Date.now();
        if (diffMs <= 0) return 'expired';
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return `${hours}h ${mins}m left`;
    };

    let bookingsCache = [];

    async function loadBookings() {
        hideError('bookingsError');
        const { data, error } = await sbClient
            .from('bookings')
            .select('*')
            .order('checkin', { ascending: true });

        if (error) {
            showError('bookingsError', 'Failed to load bookings.');
            return;
        }

        bookingsCache = data || [];
        renderCalendar();
        renderHome();

        if (bookingsCache.length === 0) {
            bookingsTableBody.innerHTML = '<tr><td colspan="9" class="admin-table-empty">No bookings yet.</td></tr>';
            return;
        }

        bookingsTableBody.innerHTML = bookingsCache.map((b) => {
            const isPending = b.status === 'pending';
            const isBlocked = b.source === 'blocked';
            const displayStatus = isBlocked ? 'blocked' : b.status;

            let actions;
            if (isBlocked) {
                actions = `<div class="admin-row-actions"><button class="admin-btn-decline" data-action="unblock" data-id="${b.id}">Unblock</button></div>`;
            } else if (isPending) {
                actions = `<div class="admin-row-actions">
                        <button class="admin-btn-confirm" data-action="confirm" data-id="${b.id}">Confirm</button>
                        <button class="admin-btn-decline" data-action="decline" data-id="${b.id}">Decline</button>
                   </div>`;
            } else if (b.status === 'confirmed') {
                actions = `<div class="admin-row-actions"><button class="admin-btn-decline" data-action="decline" data-id="${b.id}">Cancel</button></div>`;
            } else {
                actions = '—';
            }

            const guest = isBlocked
                ? escapeHtml(b.notes || 'Blocked')
                : escapeHtml(b.guest_name || (b.source !== 'direct' ? `(${b.source})` : '—'));
            const contact = [b.phone, b.email].filter(Boolean).map(escapeHtml).join('<br>') || '—';
            const guests = (b.adults || b.kids) ? `${b.adults || 0}A / ${b.kids || 0}K` : '—';

            return `
                <tr>
                    <td>${b.checkin}</td>
                    <td>${b.checkout}</td>
                    <td>${guest}</td>
                    <td>${contact}</td>
                    <td>${guests}</td>
                    <td><span class="admin-status-pill admin-status-${displayStatus}">${displayStatus}</span></td>
                    <td>${escapeHtml(b.source)}</td>
                    <td>${isPending ? formatHoldCountdown(b.hold_expires_at) : '—'}</td>
                    <td>${actions}</td>
                </tr>`;
        }).join('');
    }

    bookingsTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;

        btn.disabled = true;

        if (btn.dataset.action === 'unblock') {
            const { error } = await sbClient.from('bookings').delete().eq('id', id);
            if (error) showError('bookingsError', 'Failed to unblock those dates.');
        } else {
            const newStatus = btn.dataset.action === 'confirm' ? 'confirmed' : 'declined';
            const { error } = await sbClient
                .from('bookings')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) showError('bookingsError', 'Failed to update booking.');
        }
        loadBookings();
    });

    // A row "blocks" a date range if it's confirmed (this also covers manual
    // blocked-date entries, which are always saved as status='confirmed'),
    // or it's a pending hold that hasn't expired yet.
    const rowBlocksDates = (b) =>
        b.status === 'confirmed' || (b.status === 'pending' && (!b.hold_expires_at || new Date(b.hold_expires_at) > Date.now()));

    const hasBookingOverlap = (checkin, checkout) =>
        bookingsCache.some((b) => rowBlocksDates(b) && checkin < b.checkout && checkout > b.checkin);

    // ---------- Add booking ----------

    const addBookingBtn = document.getElementById('addBookingBtn');
    const addBookingForm = document.getElementById('addBookingForm');
    const cancelAddBookingBtn = document.getElementById('cancelAddBookingBtn');

    addBookingBtn.addEventListener('click', () => {
        addBookingForm.reset();
        addBookingForm.style.display = 'block';
        addBookingForm.scrollIntoView({ behavior: 'smooth' });
    });
    cancelAddBookingBtn.addEventListener('click', () => {
        addBookingForm.style.display = 'none';
    });

    addBookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('bookingsError');

        const checkin = document.getElementById('newBookingCheckin').value;
        const checkout = document.getElementById('newBookingCheckout').value;
        const guest_name = document.getElementById('newBookingName').value;
        const phone = document.getElementById('newBookingPhone').value;
        const email = document.getElementById('newBookingEmail').value;
        const adults = parseInt(document.getElementById('newBookingAdults').value, 10) || null;
        const kids = parseInt(document.getElementById('newBookingKids').value, 10) || 0;
        const notes = document.getElementById('newBookingNotes').value;

        if (!guest_name || !phone || !checkin || !checkout) {
            showError('bookingsError', 'Please fill in guest name, phone, and both dates.');
            return;
        }
        if (new Date(checkout) <= new Date(checkin)) {
            showError('bookingsError', 'Check-out must be after check-in.');
            return;
        }

        if (hasBookingOverlap(checkin, checkout)) {
            const proceed = confirm('These dates overlap with an existing booking or block. Add this booking anyway?');
            if (!proceed) return;
        }

        const { error } = await sbClient.from('bookings').insert({
            checkin,
            checkout,
            guest_name,
            phone,
            email: email || null,
            adults,
            kids,
            notes: notes || null,
            status: 'confirmed',
            source: 'direct',
        });

        if (error) {
            showError('bookingsError', 'Failed to add booking.');
            return;
        }

        addBookingForm.style.display = 'none';
        addBookingForm.reset();
        loadBookings();
    });

    syncIcalBtn.addEventListener('click', async () => {
        syncIcalBtn.disabled = true;
        syncStatus.textContent = 'Syncing…';
        try {
            const response = await fetch('/api/admin/sync-ical', {
                headers: { Authorization: await authHeader() },
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                syncStatus.textContent = 'Sync failed.';
            } else {
                const summary = result.results.map((r) => `${r.source}: ${r.synced || 0}`).join(', ');
                syncStatus.textContent = `Synced (${summary})`;
                loadBookings();
            }
        } catch (err) {
            console.error(err);
            syncStatus.textContent = 'Sync failed.';
        } finally {
            syncIcalBtn.disabled = false;
        }
    });

    // ---------- Home ----------

    const isActiveBooking = (b) => {
        if (b.source === 'blocked') return false;
        if (b.status === 'confirmed') return true;
        if (b.status === 'pending') return !b.hold_expires_at || new Date(b.hold_expires_at) > Date.now();
        return false;
    };

    const formatDateShort = (dateStr) =>
        new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const homeGuestLabel = (b) => escapeHtml(b.guest_name || (b.source !== 'direct' ? `(${b.source})` : 'Guest'));

    const renderHomeList = (elId, items, itemHtml) => {
        const el = document.getElementById(elId);
        el.innerHTML = items.length
            ? items.map(itemHtml).join('')
            : '<li class="admin-home-empty">None</li>';
    };

    function renderHome() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayDate = new Date(`${todayStr}T00:00:00`);
        document.getElementById('homeTodayLabel').textContent = todayDate.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });

        const weekStart = new Date(todayDate);
        weekStart.setDate(weekStart.getDate() + 1);
        const weekEnd = new Date(todayDate);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const active = bookingsCache.filter(isActiveBooking);

        const checkinsToday = active.filter((b) => b.checkin === todayStr);
        const checkoutsToday = active.filter((b) => b.checkout === todayStr);
        const checkinsWeek = active
            .filter((b) => {
                const d = new Date(`${b.checkin}T00:00:00`);
                return d >= weekStart && d <= weekEnd;
            })
            .sort((a, b) => a.checkin.localeCompare(b.checkin));
        const checkoutsWeek = active
            .filter((b) => {
                const d = new Date(`${b.checkout}T00:00:00`);
                return d >= weekStart && d <= weekEnd;
            })
            .sort((a, b) => a.checkout.localeCompare(b.checkout));

        renderHomeList('homeCheckinsToday', checkinsToday, (b) =>
            `<li>${homeGuestLabel(b)} <span style="color:var(--text-light);">— ${b.adults || 0}A/${b.kids || 0}K</span></li>`);
        renderHomeList('homeCheckoutsToday', checkoutsToday, (b) => `<li>${homeGuestLabel(b)}</li>`);
        renderHomeList('homeCheckinsWeek', checkinsWeek, (b) =>
            `<li><span class="admin-home-date">${formatDateShort(b.checkin)}</span>${homeGuestLabel(b)}</li>`);
        renderHomeList('homeCheckoutsWeek', checkoutsWeek, (b) =>
            `<li><span class="admin-home-date">${formatDateShort(b.checkout)}</span>${homeGuestLabel(b)}</li>`);

        const activeBookingsBody = document.getElementById('homeActiveBookingsBody');
        const sortedActive = [...active].sort((a, b) => a.checkin.localeCompare(b.checkin));
        activeBookingsBody.innerHTML = sortedActive.length
            ? sortedActive.map((b) => `
                <tr>
                    <td>${b.checkin}</td>
                    <td>${b.checkout}</td>
                    <td>${homeGuestLabel(b)}</td>
                    <td><span class="admin-status-pill admin-status-${b.status}">${b.status}</span></td>
                    <td>${escapeHtml(b.source)}</td>
                </tr>`).join('')
            : '<tr><td colspan="5" class="admin-table-empty">No active bookings.</td></tr>';
    }

    // ---------- Calendar ----------

    const calendarGrid = document.getElementById('calendarGrid');
    const calendarMonthLabel = document.getElementById('calendarMonthLabel');
    let calendarMonth = new Date();
    calendarMonth.setDate(1);

    const getDateStatus = (dateStr) => {
        const d = new Date(`${dateStr}T00:00:00`);
        for (const b of bookingsCache) {
            const ci = new Date(`${b.checkin}T00:00:00`);
            const co = new Date(`${b.checkout}T00:00:00`);
            if (d < ci || d >= co) continue;

            if (b.source === 'blocked') {
                return { className: 'cal-blocked', label: `Blocked${b.notes ? `: ${b.notes}` : ''}` };
            }
            if (b.status === 'pending' && (!b.hold_expires_at || new Date(b.hold_expires_at) > Date.now())) {
                return { className: 'cal-pending', label: `Pending hold — ${b.guest_name || 'guest'}` };
            }
            if (b.status === 'confirmed') {
                if (b.source === 'airbnb') return { className: 'cal-airbnb', label: 'Airbnb booking' };
                if (b.source === 'booking_com') return { className: 'cal-bookingcom', label: 'Booking.com booking' };
                return { className: 'cal-confirmed', label: `Confirmed — ${b.guest_name || 'guest'}` };
            }
        }
        return { className: '', label: 'Available' };
    };

    const renderCalendar = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        calendarMonthLabel.textContent = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const startOffset = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cellsHtml = [];
        for (let i = 0; i < startOffset; i++) {
            cellsHtml.push('<div class="cal-cell cal-cell-empty"></div>');
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const status = getDateStatus(dateStr);
            cellsHtml.push(
                `<div class="cal-cell ${status.className}" data-date="${dateStr}" title="${escapeHtml(status.label)}">${d}</div>`
            );
        }
        calendarGrid.innerHTML = cellsHtml.join('');
    };

    document.getElementById('calPrevBtn').addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('calNextBtn').addEventListener('click', () => {
        calendarMonth.setMonth(calendarMonth.getMonth() + 1);
        renderCalendar();
    });

    // Clicking days fills the block-dates form: first click sets the start,
    // second click sets the end (and a third starts over).
    calendarGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-cell[data-date]');
        if (!cell) return;

        const startInput = document.getElementById('blockStart');
        const endInput = document.getElementById('blockEnd');

        if (!startInput.value || endInput.value) {
            startInput.value = cell.dataset.date;
            endInput.value = '';
        } else {
            endInput.value = cell.dataset.date;
        }
    });

    // ---------- Block dates ----------

    const blockDatesForm = document.getElementById('blockDatesForm');
    blockDatesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('bookingsError');

        const checkin = document.getElementById('blockStart').value;
        const checkout = document.getElementById('blockEnd').value;
        const note = document.getElementById('blockNote').value;

        if (!checkin || !checkout || new Date(checkout) <= new Date(checkin)) {
            showError('bookingsError', 'Pick a valid start and end date to block (end must be after start).');
            return;
        }

        const { error } = await sbClient.from('bookings').insert({
            checkin,
            checkout,
            status: 'confirmed',
            source: 'blocked',
            notes: note || null,
        });

        if (error) {
            showError('bookingsError', 'Failed to block those dates.');
            return;
        }

        blockDatesForm.reset();
        loadBookings();
    });

    // ---------- iCal sync settings ----------

    const icalSettingsForm = document.getElementById('icalSettingsForm');

    async function loadIcalSettings() {
        const { data, error } = await sbClient
            .from('site_settings')
            .select('airbnb_ical_url, booking_ical_url')
            .eq('id', 1)
            .single();
        if (error) return;
        document.getElementById('airbnbIcalUrl').value = data.airbnb_ical_url || '';
        document.getElementById('bookingIcalUrl').value = data.booking_ical_url || '';
    }

    icalSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('bookingsError');

        const { error } = await sbClient
            .from('site_settings')
            .update({
                airbnb_ical_url: document.getElementById('airbnbIcalUrl').value || null,
                booking_ical_url: document.getElementById('bookingIcalUrl').value || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', 1);

        if (error) {
            showError('bookingsError', 'Failed to save calendar links.');
            return;
        }
        syncStatus.textContent = 'Calendar links saved.';
    });

    // ---------- Reviews ----------

    const reviewsTableBody = document.getElementById('reviewsTableBody');
    const reviewForm = document.getElementById('reviewForm');
    const addReviewBtn = document.getElementById('addReviewBtn');
    const cancelReviewBtn = document.getElementById('cancelReviewBtn');

    const resetReviewForm = () => {
        reviewForm.reset();
        document.getElementById('reviewId').value = '';
        document.getElementById('reviewPublished').checked = true;
    };

    addReviewBtn.addEventListener('click', () => {
        resetReviewForm();
        reviewForm.style.display = 'block';
    });
    cancelReviewBtn.addEventListener('click', () => {
        reviewForm.style.display = 'none';
    });

    async function loadReviews() {
        hideError('reviewsError');
        const { data, error } = await sbClient
            .from('reviews')
            .select('*')
            .order('review_date', { ascending: false });

        if (error) {
            showError('reviewsError', 'Failed to load reviews.');
            return;
        }

        if (!data || data.length === 0) {
            reviewsTableBody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">No reviews yet.</td></tr>';
            return;
        }

        reviewsTableBody.innerHTML = data.map((r) => `
            <tr>
                <td>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
                <td>${escapeHtml(r.guest_name)}</td>
                <td>${r.review_date}</td>
                <td>${escapeHtml((r.body || '').slice(0, 60))}${r.body && r.body.length > 60 ? '…' : ''}</td>
                <td>${r.published ? 'Yes' : 'No'}</td>
                <td>
                    <div class="admin-row-actions">
                        <button class="admin-btn-edit" data-action="edit" data-id="${r.id}">Edit</button>
                        <button class="admin-btn-delete" data-action="delete" data-id="${r.id}">Delete</button>
                    </div>
                </td>
            </tr>`).join('');

        reviewsTableBody.dataset.cache = JSON.stringify(data);
    }

    reviewsTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.dataset.action === 'delete') {
            if (!confirm('Delete this review?')) return;
            const { error } = await sbClient.from('reviews').delete().eq('id', id);
            if (error) showError('reviewsError', 'Failed to delete review.');
            loadReviews();
            return;
        }

        if (btn.dataset.action === 'edit') {
            const cache = JSON.parse(reviewsTableBody.dataset.cache || '[]');
            const review = cache.find((r) => r.id === id);
            if (!review) return;

            document.getElementById('reviewId').value = review.id;
            document.getElementById('reviewGuestName').value = review.guest_name || '';
            document.getElementById('reviewRating').value = review.rating || 5;
            document.getElementById('reviewDate').value = review.review_date || '';
            document.getElementById('reviewSourceUrl').value = review.source_url || '';
            document.getElementById('reviewBody').value = review.body || '';
            document.getElementById('reviewPublished').checked = !!review.published;
            reviewForm.style.display = 'block';
            reviewForm.scrollIntoView({ behavior: 'smooth' });
        }
    });

    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('reviewsError');

        const id = document.getElementById('reviewId').value;
        const payload = {
            guest_name: document.getElementById('reviewGuestName').value,
            rating: parseInt(document.getElementById('reviewRating').value, 10),
            review_date: document.getElementById('reviewDate').value,
            source_url: document.getElementById('reviewSourceUrl').value || null,
            body: document.getElementById('reviewBody').value,
            published: document.getElementById('reviewPublished').checked,
        };

        const { error } = id
            ? await sbClient.from('reviews').update(payload).eq('id', id)
            : await sbClient.from('reviews').insert(payload);

        if (error) {
            showError('reviewsError', 'Failed to save review.');
            return;
        }

        reviewForm.style.display = 'none';
        resetReviewForm();
        loadReviews();
    });

    // ---------- Gallery ----------

    const galleryAdminGrid = document.getElementById('galleryAdminGrid');
    const galleryUploadInput = document.getElementById('galleryUploadInput');
    const galleryUploadStatus = document.getElementById('galleryUploadStatus');
    const GALLERY_BUCKET = 'gallery-images';

    async function loadGallery() {
        hideError('galleryError');
        const { data, error } = await sbClient
            .from('gallery_images')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            showError('galleryError', 'Failed to load gallery images.');
            return;
        }

        if (!data || data.length === 0) {
            galleryAdminGrid.innerHTML = '<p class="admin-table-empty">No photos uploaded yet.</p>';
            return;
        }

        galleryAdminGrid.innerHTML = data.map((img) => `
            <div class="admin-gallery-item" data-id="${img.id}">
                <img src="${escapeHtml(img.public_url)}" alt="${escapeHtml(img.alt_text || '')}">
                <div class="admin-gallery-item-body">
                    <input type="text" class="gallery-alt-input" placeholder="Alt text" value="${escapeHtml(img.alt_text || '')}">
                    <div class="admin-gallery-item-row">
                        <input type="number" class="gallery-order-input" value="${img.sort_order}" style="width:70px;">
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;">
                            <input type="checkbox" class="gallery-visible-input" ${img.visible ? 'checked' : ''}> Visible
                        </label>
                    </div>
                    <button class="admin-btn-delete gallery-delete-btn" data-path="${escapeHtml(img.storage_path)}">Delete</button>
                </div>
            </div>`).join('');
    }

    galleryAdminGrid.addEventListener('change', async (e) => {
        const card = e.target.closest('.admin-gallery-item');
        if (!card) return;
        const id = card.dataset.id;

        const updates = {};
        if (e.target.classList.contains('gallery-alt-input')) updates.alt_text = e.target.value;
        if (e.target.classList.contains('gallery-order-input')) updates.sort_order = parseInt(e.target.value, 10) || 0;
        if (e.target.classList.contains('gallery-visible-input')) updates.visible = e.target.checked;

        if (Object.keys(updates).length === 0) return;

        const { error } = await sbClient.from('gallery_images').update(updates).eq('id', id);
        if (error) showError('galleryError', 'Failed to save changes.');
    });

    galleryAdminGrid.addEventListener('click', async (e) => {
        const btn = e.target.closest('.gallery-delete-btn');
        if (!btn) return;
        const card = e.target.closest('.admin-gallery-item');
        const id = card.dataset.id;
        const storagePath = btn.dataset.path;

        if (!confirm('Delete this photo?')) return;

        await sbClient.storage.from(GALLERY_BUCKET).remove([storagePath]);
        const { error } = await sbClient.from('gallery_images').delete().eq('id', id);
        if (error) showError('galleryError', 'Failed to delete photo.');
        loadGallery();
    });

    galleryUploadInput.addEventListener('change', async () => {
        const file = galleryUploadInput.files[0];
        if (!file) return;

        galleryUploadStatus.textContent = 'Uploading…';
        const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

        const { error: uploadError } = await sbClient.storage.from(GALLERY_BUCKET).upload(path, file);
        if (uploadError) {
            galleryUploadStatus.textContent = '';
            showError('galleryError', 'Upload failed.');
            galleryUploadInput.value = '';
            return;
        }

        const { data: publicUrlData } = sbClient.storage.from(GALLERY_BUCKET).getPublicUrl(path);

        const { error: insertError } = await sbClient.from('gallery_images').insert({
            storage_path: path,
            public_url: publicUrlData.publicUrl,
            alt_text: '',
            sort_order: 0,
            visible: true,
        });

        galleryUploadStatus.textContent = '';
        galleryUploadInput.value = '';

        if (insertError) {
            showError('galleryError', 'Upload succeeded but saving the record failed.');
        }
        loadGallery();
    });

    // ---------- SEO ----------

    const seoForm = document.getElementById('seoForm');

    async function loadSeoSettings() {
        hideError('seoError');
        const { data, error } = await sbClient.from('site_settings').select('*').eq('id', 1).single();
        if (error) {
            showError('seoError', 'Failed to load SEO settings.');
            return;
        }
        document.getElementById('seoTitle').value = data.seo_title || '';
        document.getElementById('seoDescription').value = data.seo_description || '';
        document.getElementById('ogTitle').value = data.og_title || '';
        document.getElementById('ogDescription').value = data.og_description || '';
        document.getElementById('ogImageUrl').value = data.og_image_url || '';
    }

    seoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('seoError');

        const payload = {
            seo_title: document.getElementById('seoTitle').value,
            seo_description: document.getElementById('seoDescription').value,
            og_title: document.getElementById('ogTitle').value || null,
            og_description: document.getElementById('ogDescription').value || null,
            og_image_url: document.getElementById('ogImageUrl').value || null,
            updated_at: new Date().toISOString(),
        };

        const { error } = await sbClient.from('site_settings').update(payload).eq('id', 1);
        if (error) {
            showError('seoError', 'Failed to save SEO settings.');
        }
    });
});
