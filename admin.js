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
    // Small transient notification, bottom-right. Used for things that
    // finish in the background (uploads) where a banner at the top of a
    // scrolled panel would be missed.
    const showToast = (message, kind = 'success') => {
        const host = document.getElementById('adminToasts');
        if (!host) return;
        const toast = document.createElement('div');
        toast.className = `admin-toast admin-toast-${kind}`;
        toast.textContent = message;
        host.appendChild(toast);
        // Next frame, so the entry transition actually runs.
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
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
        dashboardView.style.display = 'flex';
        loadBookings();
        loadEnquiries();
        loadReviews();
        loadFaqs();
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
        if (selectedDetailDate) renderDateDetails(selectedDetailDate);

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
            } else if (b.status === 'confirmed' && b.source === 'direct') {
                actions = `<div class="admin-row-actions"><button class="admin-btn-decline" data-action="decline" data-id="${b.id}">Cancel</button></div>`;
            } else if (b.status === 'confirmed') {
                // Airbnb/Booking.com bookings are read-only here — cancelling
                // them locally would desync from the real reservation on
                // that platform. They only change via the next iCal sync.
                const sourceLabel = b.source === 'airbnb' ? 'Airbnb' : 'Booking.com';
                actions = `<span class="admin-sync-status">Synced from ${sourceLabel}</span>`;
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

    // Shared by the table's "Unblock" button and clicking a blocked day on
    // the calendar. Only ever called for source='blocked' rows — never for
    // Airbnb/Booking.com bookings, which aren't ours to remove locally.
    async function unblockBooking(booking) {
        const proceed = confirm(
            `Unblock ${booking.checkin} to ${booking.checkout}${booking.notes ? ` (${booking.notes})` : ''}? These dates will become available again.`
        );
        if (!proceed) return;
        const { error } = await sbClient.from('bookings').delete().eq('id', booking.id);
        if (error) showError('bookingsError', 'Failed to unblock those dates.');
        loadBookings();
    }

    bookingsTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.dataset.action === 'unblock') {
            const booking = bookingsCache.find((b) => b.id === id);
            if (booking) await unblockBooking(booking);
            return;
        }

        btn.disabled = true;
        const newStatus = btn.dataset.action === 'confirm' ? 'confirmed' : 'declined';
        const { error } = await sbClient
            .from('bookings')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) showError('bookingsError', 'Failed to update booking.');
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
    const dateDetailsBody = document.getElementById('dateDetailsBody');
    let calendarMonth = new Date();
    calendarMonth.setDate(1);
    let selectedDetailDate = null;

    const getDateStatus = (dateStr) => {
        const d = new Date(`${dateStr}T00:00:00`);
        for (const b of bookingsCache) {
            const ci = new Date(`${b.checkin}T00:00:00`);
            const co = new Date(`${b.checkout}T00:00:00`);
            if (d < ci || d >= co) continue;

            if (b.source === 'blocked') {
                return { className: 'cal-blocked', label: `Blocked${b.notes ? `: ${b.notes}` : ''}`, booking: b };
            }
            if (b.status === 'pending' && (!b.hold_expires_at || new Date(b.hold_expires_at) > Date.now())) {
                return { className: 'cal-pending', label: `Pending hold — ${b.guest_name || 'guest'}`, booking: b };
            }
            if (b.status === 'confirmed') {
                if (b.source === 'airbnb') return { className: 'cal-airbnb', label: 'Airbnb booking', booking: b };
                if (b.source === 'booking_com') return { className: 'cal-bookingcom', label: 'Booking.com booking', booking: b };
                return { className: 'cal-confirmed', label: `Confirmed — ${b.guest_name || 'guest'}`, booking: b };
            }
        }
        return { className: '', label: 'Available', booking: null };
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
            const selected = dateStr === selectedDetailDate ? ' cal-cell-selected' : '';
            cellsHtml.push(
                `<div class="cal-cell ${status.className}${selected}" data-date="${dateStr}" title="${escapeHtml(status.label)}">${d}</div>`
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

    const dateDetailsLabel = (dateStr) =>
        new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });

    function renderDateDetails(dateStr) {
        selectedDetailDate = dateStr;
        const { booking: b } = getDateStatus(dateStr);
        const heading = `<p class="admin-date-details-date">${dateDetailsLabel(dateStr)}</p>`;

        if (!b) {
            dateDetailsBody.innerHTML = `
                ${heading}
                <span class="admin-status-pill" style="background:transparent;border:1px solid var(--glass-border);color:var(--text-light);">Available</span>
                <p class="admin-hint" style="margin-top:0.75rem;">Click another day to select a range, then use the Block dates form below — or wait for a guest to book it.</p>`;
            return;
        }

        const range = `${b.checkin} → ${b.checkout}`;
        const contact = [b.phone, b.email].filter(Boolean).map(escapeHtml).join('<br>') || '—';
        const guests = (b.adults || b.kids) ? `${b.adults || 0}A / ${b.kids || 0}K` : '—';

        if (b.source === 'blocked') {
            dateDetailsBody.innerHTML = `
                ${heading}
                <span class="admin-status-pill admin-status-blocked">Blocked</span>
                <dl class="admin-date-details-list">
                    <dt>Dates</dt><dd>${range}</dd>
                    <dt>Reason</dt><dd>${escapeHtml(b.notes || '—')}</dd>
                </dl>
                <button class="admin-btn-decline" data-action="unblock-detail" data-id="${b.id}">Unblock these dates</button>`;
            return;
        }

        if (b.status === 'pending') {
            dateDetailsBody.innerHTML = `
                ${heading}
                <span class="admin-status-pill admin-status-pending">Pending hold</span>
                <dl class="admin-date-details-list">
                    <dt>Dates</dt><dd>${range}</dd>
                    <dt>Guest</dt><dd>${escapeHtml(b.guest_name || '—')}</dd>
                    <dt>Contact</dt><dd>${contact}</dd>
                    <dt>Guests</dt><dd>${guests}</dd>
                    <dt>Hold expires</dt><dd>${formatHoldCountdown(b.hold_expires_at)}</dd>
                </dl>
                <div class="admin-row-actions">
                    <button class="admin-btn-confirm" data-action="confirm-detail" data-id="${b.id}">Confirm</button>
                    <button class="admin-btn-decline" data-action="decline-detail" data-id="${b.id}">Decline</button>
                </div>`;
            return;
        }

        if (b.source === 'direct') {
            dateDetailsBody.innerHTML = `
                ${heading}
                <span class="admin-status-pill admin-status-confirmed">Confirmed</span>
                <dl class="admin-date-details-list">
                    <dt>Dates</dt><dd>${range}</dd>
                    <dt>Guest</dt><dd>${escapeHtml(b.guest_name || '—')}</dd>
                    <dt>Contact</dt><dd>${contact}</dd>
                    <dt>Guests</dt><dd>${guests}</dd>
                </dl>
                <button class="admin-btn-decline" data-action="decline-detail" data-id="${b.id}">Cancel booking</button>`;
            return;
        }

        // Airbnb / Booking.com — read-only, no guest details available from
        // the iCal feed, and cancelling here wouldn't touch the real
        // reservation on that platform.
        const sourceLabel = b.source === 'airbnb' ? 'Airbnb' : 'Booking.com';
        const pillClass = b.source === 'airbnb' ? 'admin-status-airbnb' : 'admin-status-bookingcom';
        dateDetailsBody.innerHTML = `
            ${heading}
            <span class="admin-status-pill ${pillClass}">${sourceLabel}</span>
            <dl class="admin-date-details-list">
                <dt>Dates</dt><dd>${range}</dd>
            </dl>
            <p class="admin-hint" style="margin-top:0.75rem;">Synced from ${sourceLabel} — guest details aren't available here. Manage or cancel this reservation directly on ${sourceLabel}; the next calendar sync keeps this in step.</p>`;
    }

    dateDetailsBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const booking = bookingsCache.find((b) => b.id === btn.dataset.id);
        if (!booking) return;

        if (btn.dataset.action === 'unblock-detail') {
            await unblockBooking(booking);
            return;
        }

        btn.disabled = true;
        const newStatus = btn.dataset.action === 'confirm-detail' ? 'confirmed' : 'declined';
        const { error } = await sbClient
            .from('bookings')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', booking.id);
        if (error) showError('bookingsError', 'Failed to update booking.');
        loadBookings();
    });

    // Clicking an available day drives the block-dates range selection
    // below (first click = start, second = end). Clicking a day that's
    // already booked or blocked only shows its details — it doesn't touch
    // the block form, since you can't block over an existing reservation.
    calendarGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-cell[data-date]');
        if (!cell) return;

        const status = getDateStatus(cell.dataset.date);
        renderDateDetails(cell.dataset.date);
        renderCalendar();

        if (status.booking) return;

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

    // ---------- iCal export (share our calendar out) ----------

    // One link per platform: /api/ical?for=airbnb leaves Airbnb's own
    // reservations out of the feed Airbnb reads back, and likewise for
    // Booking.com. The 'all' link is the unfiltered feed.
    document.querySelectorAll('.admin-ical-export').forEach((input) => {
        const audience = input.dataset.icalAudience;
        input.value = audience && audience !== 'all'
            ? `${window.location.origin}/api/ical?for=${audience}`
            : `${window.location.origin}/api/ical`;
    });

    document.querySelectorAll('.admin-copy-ical').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            try {
                await navigator.clipboard.writeText(input.value);
            } catch {
                // Clipboard API can fail without HTTPS/permissions; fall back
                // to select-and-copy so the admin can still Ctrl/Cmd+C it.
                input.select();
                document.execCommand('copy');
            }
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 2000);
        });
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

    // ---------- Enquiries ----------

    // Leads from the public booking form. Unlike bookings, a row here never
    // affects the calendar — it's the record of someone asking, including the
    // ones that never became a hold (dates taken, form half-filled, guest
    // carried on to WhatsApp).

    const enquiriesTableBody = document.getElementById('enquiriesTableBody');
    const enquiriesShowHandled = document.getElementById('enquiriesShowHandled');
    const enquiriesCount = document.getElementById('enquiriesCount');
    const enquiriesTabBadge = document.getElementById('enquiriesTabBadge');

    let enquiriesCache = [];

    const OUTCOME_LABELS = {
        requested: 'Hold created',
        unavailable: 'Dates taken',
        rate_limited: 'Too many tries',
        invalid: 'Form incomplete',
        error: 'Save failed',
        whatsapp_only: 'Went to WhatsApp',
    };

    const formatEnquiryTime = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    };

    // wa.me needs a bare international number — strip spaces, dashes and the
    // leading +, and treat a local 07… Kenyan number as +254.
    const waLink = (phone) => {
        const digits = String(phone || '').replace(/[^\d]/g, '');
        if (!digits) return null;
        const normalised = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
        return `https://wa.me/${normalised}`;
    };

    function renderEnquiries() {
        const showHandled = enquiriesShowHandled?.checked;
        const rows = enquiriesCache.filter((e) => showHandled || !e.handled);
        const openCount = enquiriesCache.filter((e) => !e.handled).length;

        if (enquiriesCount) {
            enquiriesCount.textContent = `${openCount} to follow up${enquiriesCache.length ? ` · ${enquiriesCache.length} total` : ''}`;
        }
        if (enquiriesTabBadge) {
            enquiriesTabBadge.textContent = openCount;
            enquiriesTabBadge.hidden = openCount === 0;
        }

        if (rows.length === 0) {
            enquiriesTableBody.innerHTML = `<tr><td colspan="9" class="admin-table-empty">${
                enquiriesCache.length === 0
                    ? 'No enquiries yet. Anything sent through the booking form on the site shows up here.'
                    : 'Nothing left to follow up — tick "Show handled" to see the ones you\'ve dealt with.'
            }</td></tr>`;
            return;
        }

        enquiriesTableBody.innerHTML = rows.map((e) => {
            const dates = e.checkin && e.checkout
                ? `${e.checkin} → ${e.checkout}`
                : escapeHtml(e.checkin || e.checkout || '—');
            const guests = (e.adults || e.kids) ? `${e.adults || 0}A / ${e.kids || 0}K` : '—';
            const contactBits = [];
            if (e.phone) contactBits.push(escapeHtml(e.phone));
            if (e.email) contactBits.push(escapeHtml(e.email));
            const contact = contactBits.join('<br>') || '—';
            const outcome = OUTCOME_LABELS[e.outcome] || escapeHtml(e.outcome || '—');
            const note = [e.notes, e.transfer ? 'Wants airport transfer' : null]
                .filter(Boolean)
                .map(escapeHtml)
                .join('<br>') || '—';
            const wa = waLink(e.phone);

            return `
                <tr class="${e.handled ? 'admin-row-handled' : ''}">
                    <td>${formatEnquiryTime(e.created_at)}</td>
                    <td>${escapeHtml(e.guest_name || '—')}</td>
                    <td>${contact}</td>
                    <td>${dates}</td>
                    <td>${guests}</td>
                    <td><span class="admin-status-pill admin-status-${e.channel === 'whatsapp' ? 'whatsapp' : 'formchannel'}">${e.channel === 'whatsapp' ? 'WhatsApp' : 'Form'}</span></td>
                    <td>${outcome}</td>
                    <td class="admin-enquiry-note">${note}</td>
                    <td>
                        <div class="admin-row-actions">
                            ${wa ? `<a class="admin-btn-edit" href="${wa}" target="_blank" rel="noopener noreferrer">Reply</a>` : ''}
                            <button class="admin-btn-confirm" data-action="${e.handled ? 'reopen' : 'handle'}" data-id="${e.id}">${e.handled ? 'Reopen' : 'Mark handled'}</button>
                            <button class="admin-btn-delete" data-action="delete-enquiry" data-id="${e.id}">Delete</button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    async function loadEnquiries() {
        hideError('enquiriesError');
        const { data, error } = await sbClient
            .from('enquiries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (error) {
            showError('enquiriesError', 'Failed to load enquiries.');
            return;
        }

        enquiriesCache = data || [];
        renderEnquiries();
    }

    if (enquiriesShowHandled) {
        enquiriesShowHandled.addEventListener('change', renderEnquiries);
    }

    enquiriesTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        btn.disabled = true;
        hideError('enquiriesError');

        if (btn.dataset.action === 'delete-enquiry') {
            if (!confirm('Delete this enquiry? This only removes the record of the enquiry — any booking made from it stays.')) {
                btn.disabled = false;
                return;
            }
            const { error } = await sbClient.from('enquiries').delete().eq('id', id);
            if (error) showError('enquiriesError', 'Failed to delete that enquiry.');
        } else {
            const handled = btn.dataset.action === 'handle';
            const { error } = await sbClient.from('enquiries').update({ handled }).eq('id', id);
            if (error) showError('enquiriesError', 'Failed to update that enquiry.');
        }

        loadEnquiries();
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

    // ---------- FAQs ----------

    // The questions in the FAQ section of the public site. sort_order is what
    // the site orders by, so the up/down buttons here just swap two rows'
    // sort_order values.

    const faqsTableBody = document.getElementById('faqsTableBody');
    const faqForm = document.getElementById('faqForm');
    const addFaqBtn = document.getElementById('addFaqBtn');
    const cancelFaqBtn = document.getElementById('cancelFaqBtn');

    let faqsCache = [];

    const resetFaqForm = () => {
        faqForm.reset();
        document.getElementById('faqId').value = '';
        document.getElementById('faqPublished').checked = true;
    };

    addFaqBtn.addEventListener('click', () => {
        resetFaqForm();
        faqForm.style.display = 'block';
        faqForm.scrollIntoView({ behavior: 'smooth' });
    });

    cancelFaqBtn.addEventListener('click', () => {
        faqForm.style.display = 'none';
        resetFaqForm();
    });

    async function loadFaqs() {
        hideError('faqsError');
        const { data, error } = await sbClient
            .from('faqs')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            showError('faqsError', 'Failed to load FAQs.');
            return;
        }

        faqsCache = data || [];

        if (faqsCache.length === 0) {
            faqsTableBody.innerHTML = '<tr><td colspan="5" class="admin-table-empty">No questions yet. Add the first one above.</td></tr>';
            return;
        }

        faqsTableBody.innerHTML = faqsCache.map((f, i) => {
            const answer = (f.answer || '').replace(/\s+/g, ' ');
            return `
            <tr>
                <td>
                    <div class="admin-row-actions">
                        <button class="admin-btn-edit" data-action="up" data-id="${f.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&uarr;</button>
                        <button class="admin-btn-edit" data-action="down" data-id="${f.id}" ${i === faqsCache.length - 1 ? 'disabled' : ''} aria-label="Move down">&darr;</button>
                    </div>
                </td>
                <td class="admin-faq-question">${escapeHtml(f.question)}</td>
                <td class="admin-faq-answer">${escapeHtml(answer.slice(0, 90))}${answer.length > 90 ? '…' : ''}</td>
                <td>${f.published ? 'Yes' : 'No'}</td>
                <td>
                    <div class="admin-row-actions">
                        <button class="admin-btn-edit" data-action="edit" data-id="${f.id}">Edit</button>
                        <button class="admin-btn-delete" data-action="delete" data-id="${f.id}">Delete</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Swaps this row's sort_order with its neighbour's. Both rows are written
    // so the order stays consistent even if the stored values have gaps.
    async function moveFaq(id, direction) {
        const index = faqsCache.findIndex((f) => f.id === id);
        const neighbour = faqsCache[index + direction];
        if (index === -1 || !neighbour) return;

        const current = faqsCache[index];
        const updates = [
            sbClient.from('faqs').update({ sort_order: neighbour.sort_order, updated_at: new Date().toISOString() }).eq('id', current.id),
            sbClient.from('faqs').update({ sort_order: current.sort_order, updated_at: new Date().toISOString() }).eq('id', neighbour.id),
        ];
        const results = await Promise.all(updates);
        if (results.some((r) => r.error)) {
            showError('faqsError', 'Failed to reorder the questions.');
        }
        loadFaqs();
    }

    faqsTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;

        if (action === 'up' || action === 'down') {
            btn.disabled = true;
            await moveFaq(id, action === 'up' ? -1 : 1);
            return;
        }

        if (action === 'delete') {
            if (!confirm('Delete this question? It disappears from the site straight away.')) return;
            const { error } = await sbClient.from('faqs').delete().eq('id', id);
            if (error) showError('faqsError', 'Failed to delete that question.');
            loadFaqs();
            return;
        }

        if (action === 'edit') {
            const faq = faqsCache.find((f) => f.id === id);
            if (!faq) return;

            document.getElementById('faqId').value = faq.id;
            document.getElementById('faqQuestion').value = faq.question || '';
            document.getElementById('faqAnswer').value = faq.answer || '';
            document.getElementById('faqPublished').checked = !!faq.published;
            faqForm.style.display = 'block';
            faqForm.scrollIntoView({ behavior: 'smooth' });
        }
    });

    faqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('faqsError');

        const id = document.getElementById('faqId').value;
        const payload = {
            question: document.getElementById('faqQuestion').value.trim(),
            answer: document.getElementById('faqAnswer').value.trim(),
            published: document.getElementById('faqPublished').checked,
            updated_at: new Date().toISOString(),
        };

        if (!payload.question || !payload.answer) {
            showError('faqsError', 'Both the question and the answer are needed.');
            return;
        }

        // New questions go to the bottom of the list.
        if (!id) {
            const highest = faqsCache.reduce((max, f) => Math.max(max, f.sort_order || 0), -1);
            payload.sort_order = highest + 1;
        }

        const { error } = id
            ? await sbClient.from('faqs').update(payload).eq('id', id)
            : await sbClient.from('faqs').insert(payload);

        if (error) {
            showError('faqsError', 'Failed to save that question.');
            return;
        }

        faqForm.style.display = 'none';
        resetFaqForm();
        loadFaqs();
    });

    // ---------- Gallery ----------

    const galleryAdminGrid = document.getElementById('galleryAdminGrid');
    const galleryUploadInput = document.getElementById('galleryUploadInput');
    const galleryUploadStatus = document.getElementById('galleryUploadStatus');
    const galleryDropzone = document.getElementById('galleryDropzone');
    const galleryProgress = document.getElementById('galleryUploadProgress');
    const galleryProgressFill = document.getElementById('galleryProgressFill');
    const galleryProgressLabel = document.getElementById('galleryProgressLabel');
    const GALLERY_BUCKET = 'gallery-images';
    const heroSlideCount = document.getElementById('heroSlideCount');
    // The site shows four header slides; the dashboard stops the owner
    // picking more so it's obvious which ones are actually in use.
    const MAX_HERO_SLIDES = 4;
    // Matches the limits the storage bucket itself enforces (schema.sql), so
    // a file that would be rejected server-side is caught before uploading.
    const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    let galleryCache = [];

    const updateHeroSlideCount = () => {
        if (!heroSlideCount) return;
        const chosen = galleryAdminGrid.querySelectorAll('.gallery-hero-input:checked').length;
        heroSlideCount.textContent = `${chosen} of ${MAX_HERO_SLIDES} chosen.`;
    };

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

        galleryCache = data || [];

        if (galleryCache.length === 0) {
            galleryAdminGrid.innerHTML = '<p class="admin-table-empty">No photos yet — drag some in above.</p>';
            updateHeroSlideCount();
            return;
        }

        galleryAdminGrid.innerHTML = galleryCache.map((img) => `
            <div class="admin-gallery-item" data-id="${img.id}" draggable="true">
                <div class="admin-gallery-drag" title="Drag to reorder">⠿ Drag to reorder</div>
                <img src="${escapeHtml(img.public_url)}" alt="${escapeHtml(img.alt_text || '')}" draggable="false">
                <div class="admin-gallery-item-body">
                    <input type="text" class="gallery-alt-input" placeholder="Alt text" value="${escapeHtml(img.alt_text || '')}">
                    <div class="admin-gallery-item-row">
                        <input type="number" class="gallery-order-input" value="${img.sort_order}" style="width:70px;">
                        <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.8rem;">
                            <input type="checkbox" class="gallery-visible-input" ${img.visible ? 'checked' : ''}> Visible
                        </label>
                    </div>
                    <label class="admin-check-inline">
                        <input type="checkbox" class="gallery-hero-input" ${img.hero_slide ? 'checked' : ''}> Header slider
                    </label>
                    <button class="admin-btn-delete gallery-delete-btn" data-path="${escapeHtml(img.storage_path)}">Delete</button>
                </div>
            </div>`).join('');

        updateHeroSlideCount();
    }

    galleryAdminGrid.addEventListener('change', async (e) => {
        const card = e.target.closest('.admin-gallery-item');
        if (!card) return;
        const id = card.dataset.id;

        const updates = {};
        if (e.target.classList.contains('gallery-alt-input')) updates.alt_text = e.target.value;
        if (e.target.classList.contains('gallery-order-input')) updates.sort_order = parseInt(e.target.value, 10) || 0;
        if (e.target.classList.contains('gallery-visible-input')) updates.visible = e.target.checked;

        if (e.target.classList.contains('gallery-hero-input')) {
            const chosen = galleryAdminGrid.querySelectorAll('.gallery-hero-input:checked').length;
            if (e.target.checked && chosen > MAX_HERO_SLIDES) {
                e.target.checked = false;
                showError('galleryError', `The header slider holds ${MAX_HERO_SLIDES} photos — untick one before adding another.`);
                updateHeroSlideCount();
                return;
            }
            updates.hero_slide = e.target.checked;
        }

        if (Object.keys(updates).length === 0) return;

        const { error } = await sbClient.from('gallery_images').update(updates).eq('id', id);
        if (error) {
            showError('galleryError', 'Failed to save changes.');
            return;
        }
        updateHeroSlideCount();
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

    // ---------- Gallery: drag to reorder ----------

    // Cards are reordered in the DOM as the pointer moves, then the new
    // positions are written as sort_order 0..n-1 on drop. The numeric field
    // on each card still works — it's the keyboard route to the same thing.

    let draggedCard = null;

    const cardAfterPointer = (x, y) => {
        const cards = [...galleryAdminGrid.querySelectorAll('.admin-gallery-item:not(.dragging)')];
        return cards.find((card) => {
            const box = card.getBoundingClientRect();
            // First card whose centre is past the pointer, reading the grid
            // row by row.
            return y < box.bottom && (y < box.top || x < box.left + box.width / 2);
        }) || null;
    };

    galleryAdminGrid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.admin-gallery-item');
        if (!card) return;
        draggedCard = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox won't start a drag without data on the transfer.
        e.dataTransfer.setData('text/plain', card.dataset.id);
    });

    galleryAdminGrid.addEventListener('dragover', (e) => {
        if (!draggedCard) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const reference = cardAfterPointer(e.clientX, e.clientY);
        if (reference === draggedCard) return;
        galleryAdminGrid.insertBefore(draggedCard, reference);
    });

    galleryAdminGrid.addEventListener('dragend', async () => {
        if (!draggedCard) return;
        draggedCard.classList.remove('dragging');
        draggedCard = null;

        const ids = [...galleryAdminGrid.querySelectorAll('.admin-gallery-item')].map((c) => c.dataset.id);
        const moved = ids
            .map((id, index) => ({ id, index }))
            .filter(({ id, index }) => {
                const previous = galleryCache.find((img) => img.id === id);
                return previous && previous.sort_order !== index;
            });

        if (moved.length === 0) return;

        galleryUploadStatus.textContent = 'Saving new order…';
        const results = await Promise.all(
            moved.map(({ id, index }) => sbClient.from('gallery_images').update({ sort_order: index }).eq('id', id))
        );
        galleryUploadStatus.textContent = '';

        if (results.some((r) => r.error)) {
            showError('galleryError', 'Failed to save the new order.');
        }
        loadGallery();
    });

    // ---------- Gallery: uploads ----------

    // Supabase's JS client doesn't report bytes sent, so the bar tracks files
    // finished out of files queued. While one is in flight the active edge is
    // striped, so a single upload still reads as "working" rather than as a
    // bar stuck at zero.
    const setUploadProgress = (done, total, label) => {
        if (!galleryProgress) return;
        galleryProgress.hidden = false;
        galleryProgressFill.style.width = `${Math.round((done / total) * 100)}%`;
        galleryProgressFill.classList.toggle('working', done < total);
        galleryProgressLabel.textContent = label;
    };

    const clearUploadProgress = () => {
        if (!galleryProgress) return;
        galleryProgress.hidden = true;
        galleryProgressFill.style.width = '0%';
        galleryProgressFill.classList.remove('working');
        galleryProgressLabel.textContent = '';
    };

    const describeUploadProblem = (file) => {
        if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return `${file.name} isn't a JPG, PNG, WebP or GIF`;
        if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over 5MB`;
        return null;
    };

    // Handles one file or fifty, from the file picker or a drop. Each upload
    // is awaited in turn rather than fired off at once: a phone-camera batch
    // over a Watamu connection is friendlier to a queue than to a stampede,
    // and the count stays honest as it goes.
    async function uploadGalleryFiles(fileList) {
        const files = [...(fileList || [])];
        if (files.length === 0) return;

        hideError('galleryError');

        const rejected = files.map(describeUploadProblem).filter(Boolean);
        const accepted = files.filter((f) => !describeUploadProblem(f));

        if (accepted.length === 0) {
            clearUploadProgress();
            showToast(`${rejected.length} file${rejected.length === 1 ? '' : 's'} skipped.`, 'error');
            showError('galleryError', `Nothing uploaded — ${rejected.join('; ')}.`);
            return;
        }

        let nextOrder = galleryCache.reduce((max, img) => Math.max(max, img.sort_order || 0), -1) + 1;
        const failed = [...rejected];
        let uploaded = 0;

        for (const [index, file] of accepted.entries()) {
            setUploadProgress(
                index,
                accepted.length,
                accepted.length > 1
                    ? `Uploading ${file.name} — ${index + 1} of ${accepted.length}`
                    : `Uploading ${file.name}…`
            );

            const path = `${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
            const { error: uploadError } = await sbClient.storage.from(GALLERY_BUCKET).upload(path, file);
            if (uploadError) {
                failed.push(`${file.name} (upload failed)`);
                continue;
            }

            const { data: publicUrlData } = sbClient.storage.from(GALLERY_BUCKET).getPublicUrl(path);
            const { error: insertError } = await sbClient.from('gallery_images').insert({
                storage_path: path,
                public_url: publicUrlData.publicUrl,
                alt_text: '',
                sort_order: nextOrder++,
                visible: true,
            });

            if (insertError) {
                failed.push(`${file.name} (saved to storage but not listed)`);
                continue;
            }
            uploaded += 1;
        }

        // Let the bar land on 100% before it disappears, so a fast upload
        // doesn't just flicker.
        setUploadProgress(accepted.length, accepted.length, 'Finishing up…');
        setTimeout(clearUploadProgress, 600);

        if (uploaded > 0) {
            showToast(`${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded.`);
        }

        if (failed.length > 0) {
            showToast(`${failed.length} file${failed.length === 1 ? '' : 's'} skipped.`, 'error');
            showError('galleryError', `Couldn't add: ${failed.join('; ')}.`);
        }

        galleryUploadInput.value = '';
        loadGallery();
    }

    galleryUploadInput.addEventListener('change', () => uploadGalleryFiles(galleryUploadInput.files));

    if (galleryDropzone) {
        galleryDropzone.addEventListener('click', () => galleryUploadInput.click());

        // dragenter/dragover both need preventDefault, or the browser just
        // opens the dropped image in the tab.
        ['dragenter', 'dragover'].forEach((type) => {
            galleryDropzone.addEventListener(type, (e) => {
                // Ignore a card being dragged around the grid — this zone is
                // only for files arriving from outside the page.
                if (draggedCard) return;
                e.preventDefault();
                galleryDropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'dragend'].forEach((type) => {
            galleryDropzone.addEventListener(type, (e) => {
                // Moving over a child element fires dragleave on the parent;
                // only clear when the pointer has really left the zone.
                if (type === 'dragleave' && galleryDropzone.contains(e.relatedTarget)) return;
                galleryDropzone.classList.remove('dragover');
            });
        });

        galleryDropzone.addEventListener('drop', (e) => {
            if (draggedCard) return;
            e.preventDefault();
            galleryDropzone.classList.remove('dragover');
            uploadGalleryFiles(e.dataTransfer.files);
        });
    }

    // A file dropped anywhere else on the page would otherwise navigate away
    // from the dashboard, losing whatever was half-typed in a form.
    ['dragover', 'drop'].forEach((type) => {
        document.addEventListener(type, (e) => {
            if (e.target.closest('#galleryDropzone') || !e.dataTransfer?.types.includes('Files')) return;
            e.preventDefault();
        });
    });

    // ---------- SEO ----------

    const seoForm = document.getElementById('seoForm');
    const ogImageUrlInput = document.getElementById('ogImageUrl');
    const ogImagePicker = document.getElementById('ogImagePicker');
    const seoSaveStatus = document.getElementById('seoSaveStatus');

    // Fields that map straight onto a site_settings column. Kept as a table so
    // loading and saving can't drift apart.
    const SEO_FIELDS = [
        ['seoTitle', 'seo_title', 'text'],
        ['seoDescription', 'seo_description', 'text'],
        ['ogTitle', 'og_title', 'text'],
        ['ogDescription', 'og_description', 'text'],
        ['ogImageUrl', 'og_image_url', 'text'],
        ['businessName', 'business_name', 'text'],
        ['businessDescription', 'business_description', 'text'],
        ['businessPhone', 'telephone', 'text'],
        ['businessEmail', 'email', 'text'],
        ['businessStreet', 'street_address', 'text'],
        ['businessLocality', 'address_locality', 'text'],
        ['businessRegion', 'address_region', 'text'],
        ['businessCountry', 'address_country', 'text'],
        ['businessMapsUrl', 'maps_url', 'text'],
        ['businessPriceRange', 'price_range', 'text'],
        ['businessLatitude', 'latitude', 'number'],
        ['businessLongitude', 'longitude', 'number'],
        ['businessRooms', 'number_of_rooms', 'number'],
    ];

    const markSelectedOgImage = () => {
        if (!ogImagePicker) return;
        const current = (ogImageUrlInput.value || '').trim();
        ogImagePicker.querySelectorAll('.admin-og-option').forEach((option) => {
            option.classList.toggle('selected', option.dataset.url === current);
        });
    };

    async function loadOgImageOptions() {
        if (!ogImagePicker) return;
        const { data, error } = await sbClient
            .from('gallery_images')
            .select('id, public_url, alt_text')
            .eq('visible', true)
            .order('sort_order', { ascending: true });

        if (error || !data || data.length === 0) {
            ogImagePicker.innerHTML = '<p class="admin-table-empty">Upload photos in the Gallery tab to pick one here.</p>';
            return;
        }

        ogImagePicker.innerHTML = data.map((img) => `
            <button type="button" class="admin-og-option" data-url="${escapeHtml(img.public_url)}"
                    title="${escapeHtml(img.alt_text || 'Gallery photo')}">
                <img src="${escapeHtml(img.public_url)}" alt="${escapeHtml(img.alt_text || '')}">
            </button>`).join('');
        markSelectedOgImage();
    }

    if (ogImagePicker) {
        ogImagePicker.addEventListener('click', (e) => {
            const option = e.target.closest('.admin-og-option');
            if (!option) return;
            // Clicking the chosen one again clears it, so the site can fall
            // back to its default share image.
            const isSelected = option.classList.contains('selected');
            ogImageUrlInput.value = isSelected ? '' : option.dataset.url;
            markSelectedOgImage();
        });
    }

    if (ogImageUrlInput) {
        ogImageUrlInput.addEventListener('input', markSelectedOgImage);
    }

    async function loadSeoSettings() {
        hideError('seoError');
        loadOgImageOptions();

        const { data, error } = await sbClient.from('site_settings').select('*').eq('id', 1).single();
        if (error) {
            showError('seoError', 'Failed to load SEO settings.');
            return;
        }

        SEO_FIELDS.forEach(([elementId, column]) => {
            const el = document.getElementById(elementId);
            if (el) el.value = data[column] ?? '';
        });
        markSelectedOgImage();
    }

    seoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('seoError');
        if (seoSaveStatus) seoSaveStatus.textContent = '';

        const payload = { updated_at: new Date().toISOString() };
        for (const [elementId, column, type] of SEO_FIELDS) {
            const el = document.getElementById(elementId);
            if (!el) continue;
            const raw = el.value.trim();
            if (type === 'number') {
                const parsed = Number(raw);
                payload[column] = raw === '' || Number.isNaN(parsed) ? null : parsed;
            } else {
                payload[column] = raw || null;
            }
        }

        // These two are the page's own title and description — never blank.
        if (!payload.seo_title || !payload.seo_description) {
            showError('seoError', 'The page title and meta description are both needed.');
            return;
        }

        const { error } = await sbClient.from('site_settings').update(payload).eq('id', 1);
        if (error) {
            showError('seoError', 'Failed to save SEO settings.');
            return;
        }
        if (seoSaveStatus) seoSaveStatus.textContent = 'Saved. The live site picks this up within about 5 minutes.';
    });
});
