const supportState = {
    currentUser: null,
    pollTimer: null,
    isOpen: false,
    lastRenderedSignature: '',
    initialized: false
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

function toggleSupportDrawer(forceOpen) {
    const drawer = document.getElementById('supportDrawer');
    if (!drawer) {
        return;
    }

    supportState.isOpen = typeof forceOpen === 'boolean' ? forceOpen : !supportState.isOpen;
    drawer.classList.toggle('is-open', supportState.isOpen);
    drawer.setAttribute('aria-hidden', supportState.isOpen ? 'false' : 'true');

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
        thread.innerHTML = '<div class="support-empty">Nie ma jeszcze wiadomosci. Napisz do pomocy technicznej, a administrator odpowie tutaj.</div>';
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
        const data = await window.STAuthorizedFetch('/support/messages/' + encodeURIComponent(supportState.currentUser.username));
        renderSupportMessages(data.messages || [], forceScroll);
        updateSupportBadge(data.unread_count || 0);

        if (supportState.isOpen && (data.unread_count || 0) > 0) {
            await markSupportConversationAsRead();
            updateSupportBadge(0);
        }
    } catch (error) {
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
    const status = document.getElementById('supportStatus');

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
    }
    if (status) {
        setSupportStatus('Aby skorzystac z pomocy technicznej, zaloguj sie.', 'error');
    }
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
    if (subtitle) {
        subtitle.textContent = 'Rozmowa jest zapisywana na serwerze i odswiezana automatycznie.';
    }
    if (textarea) {
        textarea.disabled = false;
        textarea.placeholder = 'Opisz problem albo pytanie...';
    }
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
    const form = document.getElementById('supportForm');
    if (!toggleBtn || !closeBtn || !form) {
        return;
    }

    toggleBtn.addEventListener('click', () => toggleSupportDrawer());
    closeBtn.addEventListener('click', () => toggleSupportDrawer(false));
    form.addEventListener('submit', handleSupportSubmit);

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
