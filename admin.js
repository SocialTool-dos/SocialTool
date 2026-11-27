const adminState = {
    currentUser: null,
    selectedConversation: null,
    conversations: [],
    pollTimer: null,
    lastThreadSignature: ''
};

function logout() {
    window.STLogout('index.html');
}

function showMessage(message, type = 'success') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.className = 'message ' + type;
    messageEl.style.display = message ? 'block' : 'none';
}

function showSupportStatus(message, type = 'success') {
    const messageEl = document.getElementById('adminSupportStatus');
    messageEl.textContent = message;
    messageEl.className = 'message ' + type;
    messageEl.style.display = message ? 'block' : 'none';
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatDate(dateValue) {
    if (!dateValue) {
        return '';
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleString('pl-PL');
}

function renderSupportThread(messages, forceScroll = false) {
    const thread = document.getElementById('adminSupportThread');
    const signature = JSON.stringify(messages.map(message => [message.id, message.read_by_admin]));
    if (!forceScroll && signature === adminState.lastThreadSignature) {
        return;
    }

    adminState.lastThreadSignature = signature;
    if (!messages.length) {
        thread.innerHTML = '<div class="support-empty">Ta rozmowa nie ma jeszcze wiadomosci.</div>';
        return;
    }

    thread.innerHTML = '';
    messages.forEach((message) => {
        const bubble = document.createElement('div');
        const isAdmin = message.sender_role === 'admin';
        bubble.className = 'support-message ' + (isAdmin ? 'is-admin-own' : 'is-user');
        bubble.innerHTML = `
            <div class="support-message-author">${isAdmin ? 'Administrator: ' + escapeHtml(message.sender_username) : 'Uzytkownik: ' + escapeHtml(message.sender_username)}</div>
            <div class="support-message-body">${escapeHtml(message.message)}</div>
            <div class="support-message-meta">${formatDate(message.created_at)}</div>
        `;
        thread.appendChild(bubble);
    });

    if (forceScroll) {
        thread.scrollTop = thread.scrollHeight;
    }
}

async function apiFetch(path, options = {}) {
    return window.STAuthorizedFetch(path, options);
}

function buildUserCard(user) {
    const wrapper = document.createElement('div');
    wrapper.className = 'side-card admin-user-card';

    const roleLabel = user.is_admin ? 'admin' : (user.role || 'user');
    const isOwner = !!(adminState.currentUser && adminState.currentUser.username === 'w0bise');
    // Admin moze zmieniac role, ale tylko wlasciciel nadaje role admina i tylko wlasciciel
    // moze zmienic role konta wlasciciela.
    const canManageRoles = !!(adminState.currentUser && adminState.currentUser.role === 'admin')
        && (isOwner || user.username !== 'w0bise');
    wrapper.innerHTML = `
        <h3>${escapeHtml(user.username)}</h3>
        <p class="section-subtitle" style="margin-bottom: 10px;">IP: ${escapeHtml(user.ip || '-')} | Rola: ${escapeHtml(roleLabel)} | Status: ${escapeHtml(user.status || '-')}</p>
        <p class="subtitle" style="margin-bottom: 14px;">Nieprzeczytane zgloszenia: ${user.support_unread || 0}</p>
        <div class="admin-role-row">
            <label for="role-${escapeHtml(user.username)}">Rola</label>
            <select id="role-${escapeHtml(user.username)}" data-action="role" ${canManageRoles ? '' : 'disabled'}>
                <option value="user" ${roleLabel === 'user' ? 'selected' : ''}>user</option>
                <option value="premium" ${roleLabel === 'premium' ? 'selected' : ''}>premium</option>
                <option value="admin" ${roleLabel === 'admin' ? 'selected' : ''} ${isOwner ? '' : 'disabled'}>admin</option>
            </select>
        </div>
        <div class="hero-actions" style="margin: 0;">
            <button class="button-secondary" type="button" data-action="open-support">Otworz rozmowe</button>
            <button class="button-secondary" type="button" data-action="change-password">Zmien haslo</button>
            ${user.is_banned ? '<button class="button" type="button" data-action="unban">Odbanuj</button>' : '<button class="button" type="button" data-action="ban">Zbanuj</button>'}
            <button class="button-secondary" type="button" data-action="delete">Usun konto</button>
        </div>
    `;

    wrapper.querySelector('[data-action="open-support"]').addEventListener('click', async () => {
        adminState.selectedConversation = user.username;
        await loadConversations();
        await loadConversationMessages(true);
    });

    const roleSelect = wrapper.querySelector('[data-action="role"]');
    roleSelect.addEventListener('change', async () => {
        if (!canManageRoles) {
            showMessage('Nie mozesz zmienic roli tego konta.', 'error');
            roleSelect.value = roleLabel;
            return;
        }

        if (roleSelect.value === 'admin' && !isOwner) {
            showMessage('Role administratora moze nadac tylko konto w0bise.', 'error');
            roleSelect.value = roleLabel;
            return;
        }

        try {
            await apiFetch('/users/' + encodeURIComponent(user.username) + '/role', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: roleSelect.value })
            });
            showMessage('Zmieniono role dla ' + user.username, 'success');
            await loadUsers();
        } catch (error) {
            roleSelect.value = roleLabel;
            showMessage(error.message, 'error');
        }
    });

    const changePasswordBtn = wrapper.querySelector('[data-action="change-password"]');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', async () => {
            const newPassword = prompt('Nowe haslo dla ' + user.username + ':', '');
            if (newPassword === null) {
                return;
            }

            const trimmedPassword = newPassword.trim();
            if (trimmedPassword.length < 6) {
                showMessage('Haslo musi miec co najmniej 6 znakow.', 'error');
                return;
            }

            const confirmation = prompt('Powtorz nowe haslo dla ' + user.username + ':', '');
            if (confirmation === null) {
                return;
            }

            if (trimmedPassword !== confirmation.trim()) {
                showMessage('Hasla nie sa takie same.', 'error');
                return;
            }

            try {
                await apiFetch('/users/' + encodeURIComponent(user.username) + '/password', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: trimmedPassword })
                });
                showMessage('Zmieniono haslo dla ' + user.username, 'success');
            } catch (error) {
                showMessage(error.message, 'error');
            }
        });
    }

    const banBtn = wrapper.querySelector('[data-action="ban"]');
    if (banBtn) {
        banBtn.addEventListener('click', async () => {
            const reason = prompt('Powod bana:', 'Naruszenie regulaminu');
            if (reason === null) {
                return;
            }
            try {
                await apiFetch('/ban-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ip: user.ip,
                        username: user.username,
                        reason
                    })
                });
                showMessage('Zbanowano ' + user.username, 'success');
                await Promise.all([loadUsers(), loadBans()]);
            } catch (error) {
                showMessage(error.message, 'error');
            }
        });
    }

    const unbanBtn = wrapper.querySelector('[data-action="unban"]');
    if (unbanBtn) {
        unbanBtn.addEventListener('click', async () => {
            try {
                await apiFetch('/unban-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip: user.ip })
                });
                showMessage('Odbanowano ' + user.username, 'success');
                await Promise.all([loadUsers(), loadBans()]);
            } catch (error) {
                showMessage(error.message, 'error');
            }
        });
    }

    wrapper.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Na pewno usunac konto ' + user.username + '?')) {
            return;
        }
        try {
            await apiFetch('/users/' + encodeURIComponent(user.username), {
                method: 'DELETE'
            });
            showMessage('Usunieto konto ' + user.username, 'success');
            if (adminState.selectedConversation === user.username) {
                adminState.selectedConversation = null;
                adminState.lastThreadSignature = '';
            }
            await Promise.all([loadUsers(), loadBans(), loadConversations()]);
            renderConversationHeader();
            renderSupportThread([], true);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });

    return wrapper;
}

function buildBanCard(ban) {
    const wrapper = document.createElement('div');
    wrapper.className = 'side-card admin-ban-card';
    const deletedAccount = !ban.username || ban.reason === 'Konto usuniete przez administratora';

    wrapper.innerHTML = `
        <h3>${escapeHtml(ban.username || 'Usuniete konto')}</h3>
        <p class="section-subtitle" style="margin-bottom: 10px;">IP: ${escapeHtml(ban.ip || '-')}</p>
        <p class="subtitle" style="margin-bottom: 10px;">Powod: ${escapeHtml(ban.reason || '-')}</p>
        <p class="subtitle" style="margin-bottom: 14px;">Admin: ${escapeHtml(ban.banned_by || '-')} | Data: ${escapeHtml(formatDate(ban.banned_at) || '-')}</p>
        <div class="hero-actions" style="margin: 0;">
            <button class="button" type="button" data-action="unban">Odbanuj</button>
        </div>
        <p class="subtitle" style="margin-top: 12px;">${deletedAccount ? 'Ten wpis mozna odbanowac nawet po usunieciu konta, bo blokada siedzi na IP.' : 'Aktywna blokada przypisana do konta i IP.'}</p>
    `;

    wrapper.querySelector('[data-action="unban"]').addEventListener('click', async () => {
        try {
            await apiFetch('/unban-ip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: ban.ip })
            });
            showMessage('Odbanowano IP ' + ban.ip, 'success');
            await Promise.all([loadUsers(), loadBans()]);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    });

    return wrapper;
}

function renderConversationHeader() {
    const title = document.getElementById('selectedConversationTitle');
    const subtitle = document.getElementById('selectedConversationSubtitle');

    if (!adminState.selectedConversation) {
        title.textContent = 'Wybierz rozmowe';
        subtitle.textContent = 'Kliknij uzytkownika po lewej stronie, aby zobaczyc wiadomosci.';
        return;
    }

    title.textContent = 'Rozmowa: ' + adminState.selectedConversation;
    subtitle.textContent = 'Nowe wiadomosci odswiezaja sie automatycznie co 2 sekundy.';
}

async function loadUsers(options = {}) {
    const usersList = document.getElementById('usersList');
    const shouldShowLoading = !options.silent;
    const hasExistingContent = usersList.children.length > 0;

    if (shouldShowLoading || !hasExistingContent) {
        usersList.innerHTML = '<li>Ladowanie uzytkownikow...</li>';
    }

    try {
        const data = await apiFetch('/users');
        usersList.innerHTML = '';

        if (!data.users || !data.users.length) {
            usersList.innerHTML = '<li>Brak uzytkownikow.</li>';
            return;
        }

        data.users.forEach((user) => {
            const item = document.createElement('li');
            item.style.listStyle = 'none';
            item.style.paddingLeft = '0';
            item.appendChild(buildUserCard(user));
            usersList.appendChild(item);
        });
    } catch (error) {
        usersList.innerHTML = '<li>Nie udalo sie pobrac uzytkownikow.</li>';
        showMessage(error.message, 'error');
    }
}

async function loadBans(options = {}) {
    const bansList = document.getElementById('bansList');
    const shouldShowLoading = !options.silent;
    const hasExistingContent = bansList.children.length > 0;

    if (shouldShowLoading || !hasExistingContent) {
        bansList.innerHTML = '<li>Ladowanie banow...</li>';
    }

    try {
        const data = await apiFetch('/bans');
        bansList.innerHTML = '';

        if (!data.bans || !data.bans.length) {
            bansList.innerHTML = '<li>Brak aktywnych banow.</li>';
            return;
        }

        data.bans.forEach((ban) => {
            const item = document.createElement('li');
            item.style.listStyle = 'none';
            item.style.paddingLeft = '0';
            item.appendChild(buildBanCard(ban));
            bansList.appendChild(item);
        });
    } catch (error) {
        bansList.innerHTML = '<li>Nie udalo sie pobrac banow.</li>';
        showMessage(error.message, 'error');
    }
}

function renderConversations(conversations) {
    const container = document.getElementById('supportConversations');
    if (!conversations.length) {
        container.innerHTML = '<div class="support-empty">Brak rozmow pomocy technicznej.</div>';
        return;
    }

    container.innerHTML = '';
    conversations.forEach((conversation) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-conversation-item' + (adminState.selectedConversation === conversation.username ? ' is-active' : '');
        button.innerHTML = `
            <span class="admin-conversation-title">${escapeHtml(conversation.username)}</span>
            <span class="admin-conversation-preview">${escapeHtml(conversation.last_message || 'Brak tresci')}</span>
            <span class="admin-conversation-meta">${formatDate(conversation.last_message_at)}${conversation.unread_for_admin ? ' | nieprzeczytane: ' + conversation.unread_for_admin : ''}</span>
        `;
        button.addEventListener('click', async () => {
            adminState.selectedConversation = conversation.username;
            renderConversationHeader();
            renderConversations(adminState.conversations);
            await loadConversationMessages(true);
        });
        container.appendChild(button);
    });
}

async function loadConversations() {
    try {
        const data = await apiFetch('/support/conversations');
        adminState.conversations = data.conversations || [];

        if (!adminState.selectedConversation && adminState.conversations.length) {
            adminState.selectedConversation = adminState.conversations[0].username;
        }
        if (adminState.selectedConversation && !adminState.conversations.some(item => item.username === adminState.selectedConversation)) {
            adminState.selectedConversation = adminState.conversations.length ? adminState.conversations[0].username : null;
            adminState.lastThreadSignature = '';
        }

        renderConversationHeader();
        renderConversations(adminState.conversations);
    } catch (error) {
        showSupportStatus(error.message, 'error');
    }
}

async function markConversationRead() {
    if (!adminState.selectedConversation) {
        return;
    }

    try {
        await apiFetch('/support/messages/' + encodeURIComponent(adminState.selectedConversation) + '/read', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Nie udalo sie oznaczyc rozmowy jako przeczytanej:', error);
    }
}

async function loadConversationMessages(forceScroll = false) {
    if (!adminState.selectedConversation) {
        renderSupportThread([], true);
        return;
    }

    try {
        const data = await apiFetch('/support/messages/' + encodeURIComponent(adminState.selectedConversation));
        renderSupportThread(data.messages || [], forceScroll);

        if ((data.unread_count || 0) > 0) {
            await markConversationRead();
            await loadConversations();
        }
    } catch (error) {
        showSupportStatus(error.message, 'error');
    }
}

async function handleAdminReply(event) {
    event.preventDefault();
    if (!adminState.selectedConversation) {
        showSupportStatus('Najpierw wybierz rozmowe.', 'error');
        return;
    }

    const textarea = document.getElementById('adminReplyMessage');
    const message = textarea.value.trim();
    if (!message) {
        showSupportStatus('Wpisz odpowiedz przed wyslaniem.', 'error');
        return;
    }

    try {
        await apiFetch('/support/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_username: adminState.selectedConversation,
                message
            })
        });
        textarea.value = '';
        showSupportStatus('Odpowiedz wyslana.', 'success');
        await Promise.all([loadConversations(), loadConversationMessages(true), loadUsers()]);
    } catch (error) {
        showSupportStatus(error.message, 'error');
    }
}

const ADMIN_DEMO_DATA = {
    users: [
        { username: 'w0bise', ip: '82.145.10.23', role: 'admin', is_admin: true, status: 'aktywne', support_unread: 0, is_banned: false },
        { username: 'kamil99', ip: '188.33.4.9', role: 'user', is_admin: false, status: 'aktywne', support_unread: 2, is_banned: false },
        { username: 'marta_x', ip: '45.12.88.201', role: 'user', is_admin: false, status: 'aktywne', support_unread: 0, is_banned: true }
    ],
    bans: [
        { username: 'marta_x', ip: '45.12.88.201', reason: 'Spam na czacie pomocy', banned_by: 'w0bise', banned_at: '2026-11-27T18:24:00.000Z' }
    ],
    conversations: [
        { username: 'kamil99', last_message: 'Nie dziala mi AutoKurs po aktualizacji', last_message_at: '2026-11-28T09:12:00.000Z', unread_for_admin: 2 }
    ],
    messages: {
        kamil99: [
            { id: 1, sender_username: 'kamil99', sender_role: 'user', message: 'Czesc, po ostatniej aktualizacji nie dziala mi AutoKurs. Wyskakuje blad przy instalacji.', created_at: '2026-11-28T09:10:00.000Z' },
            { id: 2, sender_username: 'kamil99', sender_role: 'user', message: 'Probuje tez odpalic nmap i tez sie wywala.', created_at: '2026-11-28T09:12:00.000Z' },
            { id: 3, sender_username: 'w0bise', sender_role: 'admin', message: 'Hej, juz sprawdzam. Zrob prosze reinstall z nowego instalatora.', created_at: '2026-11-28T09:20:00.000Z' }
        ]
    }
};

function enterAdminDemoMode() {
    adminState.currentUser = { username: 'w0bise', role: 'admin' };

    apiFetch = async () => ({ success: true, message: 'Tryb demo' });

    loadUsers = async () => {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        ADMIN_DEMO_DATA.users.forEach((user) => {
            const item = document.createElement('li');
            item.appendChild(buildUserCard(user));
            usersList.appendChild(item);
        });
    };

    loadBans = async () => {
        const bansList = document.getElementById('bansList');
        bansList.innerHTML = '';
        ADMIN_DEMO_DATA.bans.forEach((ban) => {
            const item = document.createElement('li');
            item.appendChild(buildBanCard(ban));
            bansList.appendChild(item);
        });
    };

    loadConversations = async () => {
        adminState.conversations = ADMIN_DEMO_DATA.conversations;
        if (!adminState.selectedConversation) {
            adminState.selectedConversation = 'kamil99';
        }
        renderConversationHeader();
        renderConversations(adminState.conversations);
    };

    loadConversationMessages = async () => {
        renderSupportThread(ADMIN_DEMO_DATA.messages[adminState.selectedConversation] || [], true);
    };

    document.getElementById('adminIdentity').textContent = 'Zalogowany admin: w0bise (tryb demo)';
    document.getElementById('refreshUsersBtn').addEventListener('click', () => loadUsers());
    document.getElementById('refreshBansBtn').addEventListener('click', () => loadBans());
    document.getElementById('adminReplyForm').addEventListener('submit', handleAdminReply);

    loadUsers();
    loadBans();
    loadConversations();
    loadConversationMessages();
}

document.addEventListener('DOMContentLoaded', async () => {
    if (new URLSearchParams(window.location.search).has('demo')) {
        enterAdminDemoMode();
        return;
    }

    const currentUser = await window.STRequireAuth('login.html');
    if (!currentUser || currentUser.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    adminState.currentUser = currentUser;
    document.getElementById('adminIdentity').textContent = 'Zalogowany admin: ' + currentUser.username;
    renderConversationHeader();

    document.getElementById('refreshUsersBtn').addEventListener('click', () => loadUsers());
    document.getElementById('refreshBansBtn').addEventListener('click', () => loadBans());
    document.getElementById('adminReplyForm').addEventListener('submit', handleAdminReply);

    await Promise.all([loadUsers(), loadBans(), loadConversations()]);
    await loadConversationMessages(true);

    adminState.pollTimer = window.setInterval(async () => {
        await loadConversations();
        await loadConversationMessages(false);
    }, 2000);
});
