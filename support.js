const supportState = {
    currentUser: null,
    pollTimer: null,
    isOpen: false,
    lastRenderedSignature: ''
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
        loadSupportMessages(true);
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

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await window.STRequireAuth('login.html');
    if (!currentUser) {
        return;
    }

    supportState.currentUser = currentUser;
    const adminLink = document.getElementById('adminLink');
    const identity = document.getElementById('downloadIdentity');
    const subtitle = document.getElementById('supportDrawerSubtitle');

    if (identity) {
        identity.textContent = 'Zalogowany: ' + currentUser.username + ' (' + currentUser.role + ')';
    }
    if (subtitle) {
        subtitle.textContent = 'Rozmowa jest zapisywana na serwerze i odswiezana automatycznie.';
    }
    if (adminLink && currentUser.role === 'admin') {
        adminLink.style.display = 'inline-flex';
    }

    document.getElementById('supportToggleBtn').addEventListener('click', () => toggleSupportDrawer());
    document.getElementById('supportCloseBtn').addEventListener('click', () => toggleSupportDrawer(false));
    document.getElementById('supportForm').addEventListener('submit', handleSupportSubmit);

    await loadSupportMessages(true);
    supportState.pollTimer = window.setInterval(() => {
        loadSupportMessages(false);
    }, 2000);
});
