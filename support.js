const supportState = {
    currentUser: null,
    pollTimer: null,
    isOpen: false,
    lastRenderedSignature: '',
    initialized: false,
    unreadCount: 0
};

function setSupportStatus(message, type = 'success') {
    const statusEl = document.getElementById('supportStatus');
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.className = 'message ' + type;
    statusEl.style.display = message ? 'block' : 'none';
}

function setSupportConnectionState(label, mode = 'neutral') {
    const badge = document.getElementById('supportConnectionBadge');
    if (!badge) {
        return;
    }
    badge.textContent = label;
    badge.className = 'support-connection-badge is-' + mode;
}

function updateSupportMeta(details = {}) {
    const summaryTitle = document.getElementById('supportSummaryTitle');
    const summaryText = document.getElementById('supportSummaryText');
    const identityLabel = document.getElementById('supportIdentityLabel');
    const lastUpdate = document.getElementById('supportLastUpdate');
    const unreadHint = document.getElementById('supportUnreadHint');

    if (summaryTitle && details.summaryTitle) {
        summaryTitle.textContent = details.summaryTitle;
    }
    if (summaryText && details.summaryText) {
        summaryText.textContent = details.summaryText;
    }
    if (identityLabel && details.identityLabel) {
        identityLabel.textContent = details.identityLabel;
    }
    if (lastUpdate && details.lastUpdate) {
        lastUpdate.textContent = details.lastUpdate;
    }
    if (unreadHint) {
        unreadHint.textContent = details.unreadHint || 'Brak nowych wiadomosci';
    }
}

function updateSupportCharCount() {
    const textarea = document.getElementById('supportMessage');
    const counter = document.getElementById('supportCharCount');
    if (!textarea || !counter) {
        return;
    }
    counter.textContent = textarea.value.length + ' / 2000';
}

function toggleSupportDrawer(forceOpen) {
    const drawer = document.getElementById('supportDrawer');
    const toggleBtn = document.getElementById('supportToggleBtn');
    const backdrop = document.getElementById('supportBackdrop');
    if (!drawer) {
        return;
    }

    supportState.isOpen = typeof forceOpen === 'boolean' ? forceOpen : !supportState.isOpen;
    drawer.classList.toggle('is-open', supportState.isOpen);
    drawer.setAttribute('aria-hidden', supportState.isOpen ? 'false' : 'true');
    document.body.classList.toggle('support-open', supportState.isOpen);
    if (backdrop) {
        backdrop.hidden = !supportState.isOpen;
        backdrop.classList.toggle('is-visible', supportState.isOpen);
    }
    if (toggleBtn) {
        toggleBtn.classList.toggle('is-open', supportState.isOpen);
        toggleBtn.setAttribute('aria-expanded', supportState.isOpen ? 'true' : 'false');
    }

    if (supportState.isOpen) {
        if (!supportState.currentUser) {
            renderGuestSupportState();
        } else {
            loadSupportMessages(true);
        }
    }
}

function renderSupportMessages(messages, forceScroll = false) {
    const thread = document.getElementById('supportThread');
    if (!thread) {
        return;
    }

    const signature = JSON.stringify(messages.map(message => [message.id, message.read_by_user, message.read_by_admin]));
    if (!forceScroll && signature === supportState.lastRenderedSignature) {
        return;
    }
    supportState.lastRenderedSignature = signature;

    if (!messages.length) {
        thread.innerHTML = '<div class="support-empty">Nie ma jeszcze wiadomosci. Opisz problem albo pytanie, a odpowiedz administratora pojawi sie tutaj.</div>';
        return;
    }

    thread.innerHTML = '';
    messages.forEach((message) => {
        const bubble = document.createElement('div');
        const isOwn = message.sender_username === supportState.currentUser.username;
        bubble.className = 'support-message ' + (isOwn ? 'is-own' : 'is-admin');
        bubble.innerHTML = `
            <div class="support-message-author">${isOwn ? 'Ty' : (message.sender_username || 'Administrator')}</div>
            <div class="support-message-body">${escapeHtml(message.message)}</div>
            <div class="support-message-meta">${formatSupportDate(message.created_at)}</div>
        `;
        thread.appendChild(bubble);
    });

    if (forceScroll || supportState.isOpen) {
        thread.scrollTop = thread.scrollHeight;
    }
}

function updateSupportBadge(unreadCount) {
    const badge = document.getElementById('supportUnreadBadge');
    supportState.unreadCount = unreadCount;
    if (!badge) {
        return;
    }
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
}

function formatSupportDate(dateValue) {
    if (!dateValue) {
        return '';
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleString('pl-PL');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function markSupportConversationAsRead() {
    if (!supportState.currentUser) {
        return;
    }

    try {
        await window.STAuthorizedFetch('/support/messages/' + encodeURIComponent(supportState.currentUser.username) + '/read', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Nie udalo sie oznaczyc rozmowy jako przeczytanej:', error);
    }
}

async function loadSupportMessages(forceScroll = false) {
    if (!supportState.currentUser) {
        renderGuestSupportState();
        return;
    }

    try {
        setSupportConnectionState('Online', 'online');
        const data = await window.STAuthorizedFetch('/support/messages/' + encodeURIComponent(supportState.currentUser.username));
        renderSupportMessages(data.messages || [], forceScroll);
        updateSupportBadge(data.unread_count || 0);
        updateSupportMeta({
            summaryTitle: 'Wiadomosci z administracja',
            summaryText: 'Rozmowa jest zapisywana na serwerze i odswiezana automatycznie.',
            identityLabel: 'Zalogowany: ' + supportState.currentUser.username + ' (' + supportState.currentUser.role + ')',
            lastUpdate: 'Ostatnie sprawdzenie: ' + formatSupportDate(new Date().toISOString()),
            unreadHint: (data.unread_count || 0) > 0 ? ('Nowe odpowiedzi: ' + (data.unread_count || 0)) : 'Brak nowych wiadomosci'
        });

        if (supportState.isOpen && (data.unread_count || 0) > 0) {
            await markSupportConversationAsRead();
            updateSupportBadge(0);
            updateSupportMeta({
                unreadHint: 'Wszystkie wiadomosci przeczytane'
            });
        }
    } catch (error) {
        setSupportConnectionState('Blad', 'error');
        setSupportStatus(error.message, 'error');
    }
}

async function handleSupportSubmit(event) {
    event.preventDefault();
    if (!supportState.currentUser) {
        window.STNavigate('login.html');
        return;
    }

    const textarea = document.getElementById('supportMessage');
    const message = textarea.value.trim();
    if (!message) {
        setSupportStatus('Wpisz wiadomosc przed wyslaniem.', 'error');
        return;
    }

    try {
        await window.STAuthorizedFetch('/support/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        textarea.value = '';
        updateSupportCharCount();
        setSupportStatus('Wiadomosc wyslana.', 'success');
        await loadSupportMessages(true);
    } catch (error) {
        setSupportStatus(error.message, 'error');
    }
}

function renderGuestSupportState() {
    const thread = document.getElementById('supportThread');
    const subtitle = document.getElementById('supportDrawerSubtitle');
    const textarea = document.getElementById('supportMessage');

    setSupportConnectionState('Wymaga logowania', 'warning');
    if (subtitle) {
        subtitle.textContent = 'Zaloguj sie, aby napisac do pomocy technicznej i zobaczyc odpowiedzi administratora.';
    }
    if (thread) {
        thread.innerHTML = '<div class="support-empty">Support jest dostepny po zalogowaniu. Po zalogowaniu zobaczysz tu cala rozmowe z administracja.</div>';
    }
    if (textarea) {
        textarea.value = '';
        textarea.disabled = true;
        textarea.placeholder = 'Zaloguj sie, aby rozpoczac rozmowe z supportem...';
        updateSupportCharCount();
    }
    updateSupportMeta({
        summaryTitle: 'Pomoc techniczna',
        summaryText: 'Po zalogowaniu mozesz napisac bezposrednio do administracji.',
        identityLabel: 'Tryb goscia',
        lastUpdate: 'Zaloguj sie, aby rozpoczec rozmowe.',
        unreadHint: 'Brak dostepu bez logowania'
    });
    setSupportStatus('Aby skorzystac z pomocy technicznej, zaloguj sie.', 'error');
    updateSupportBadge(0);
}

function renderAuthenticatedSupportState(currentUser) {
    const adminLink = document.getElementById('adminLink');
    const identity = document.getElementById('downloadIdentity');
    const subtitle = document.getElementById('supportDrawerSubtitle');
    const textarea = document.getElementById('supportMessage');

    if (identity) {
        identity.textContent = 'Zalogowany: ' + currentUser.username + ' (' + currentUser.role + ')';
    }
    setSupportConnectionState('Online', 'online');
    if (subtitle) {
        subtitle.textContent = 'Rozmowa jest zapisywana na serwerze i odswiezana automatycznie.';
    }
    if (textarea) {
        textarea.disabled = false;
        textarea.placeholder = 'Opisz problem albo pytanie...';
        updateSupportCharCount();
    }
    updateSupportMeta({
        summaryTitle: 'Wiadomosci z administracja',
        summaryText: 'Napisz konkretnie, co nie dziala albo czego potrzebujesz.',
        identityLabel: 'Zalogowany: ' + currentUser.username + ' (' + currentUser.role + ')',
        lastUpdate: 'Nowe odpowiedzi pojawiaja sie automatycznie.',
        unreadHint: supportState.unreadCount > 0 ? ('Nowe odpowiedzi: ' + supportState.unreadCount) : 'Brak nowych wiadomosci'
    });
    if (adminLink && currentUser.role === 'admin') {
        adminLink.style.display = 'inline-flex';
    }
}

async function initializeSupportWidget() {
    if (supportState.initialized) {
        return;
    }
    supportState.initialized = true;

    const toggleBtn = document.getElementById('supportToggleBtn');
    const closeBtn = document.getElementById('supportCloseBtn');
    const backdrop = document.getElementById('supportBackdrop');
    const form = document.getElementById('supportForm');
    const textarea = document.getElementById('supportMessage');
    if (!toggleBtn || !closeBtn || !form) {
        return;
    }

    toggleBtn.addEventListener('click', () => toggleSupportDrawer());
    closeBtn.addEventListener('click', () => toggleSupportDrawer(false));
    if (backdrop) {
        backdrop.addEventListener('click', () => toggleSupportDrawer(false));
    }
    form.addEventListener('submit', handleSupportSubmit);
    if (textarea) {
        textarea.addEventListener('input', updateSupportCharCount);
        updateSupportCharCount();
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && supportState.isOpen) {
            toggleSupportDrawer(false);
        }
    });

    const currentUser = await window.STRefreshSession();
    supportState.currentUser = currentUser;

    if (!currentUser) {
        renderGuestSupportState();
        return;
    }

    renderAuthenticatedSupportState(currentUser);
    await loadSupportMessages(true);
    supportState.pollTimer = window.setInterval(() => {
        loadSupportMessages(false);
    }, 2000);
}

document.addEventListener('DOMContentLoaded', initializeSupportWidget);
