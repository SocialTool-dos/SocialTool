// autoinstaling.js - panel AutoInstaling (tylko ranga premium/admin)
const AUTOINSTALING_ALLOWED_ROLES = ['premium', 'admin'];
const JOB_STATUS_LABELS = {
    queued: 'W kolejce',
    running: 'W trakcie',
    done: 'Zakonczone',
    error: 'Blad'
};
const JOB_POLL_INTERVAL = 2500;

let autoinstalingUser = null;
let activeJobId = null;
let pollTimer = null;
let pollInFlight = false;

function logout() {
    window.STLogout('index.html');
}

function showMessage(message, type) {
    const messageEl = document.getElementById('message');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.className = 'message ' + (type || '');
    messageEl.style.display = message ? 'block' : 'none';
}

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
}

function showPremiumGate() {
    const gate = document.getElementById('premiumGate');
    if (gate) gate.hidden = false;
    const form = document.getElementById('autoinstalingForm');
    if (form) form.style.display = 'none';
}

function setFormDisabled(disabled) {
    const form = document.getElementById('autoinstalingForm');
    const controls = form ? form.querySelectorAll('input, button') : [];
    controls.forEach((control) => { control.disabled = disabled; });
}

function renderJob(job) {
    if (!job) return;
    const panel = document.getElementById('jobPanel');
    panel.hidden = false;

    const statusKey = (job.status || 'queued').toLowerCase();
    const statusLabel = JOB_STATUS_LABELS[statusKey] || job.status || '-';
    document.getElementById('jobStatusPill').textContent = statusLabel;

    let positionText = 'Kolejka: -';
    if (statusKey === 'queued' && typeof job.position === 'number') {
        positionText = `Kolejka: pozycja ${job.position}`;
    } else if (statusKey === 'running') {
        positionText = 'Kolejka: w trakcie rozwiazywania';
    } else {
        positionText = 'Kolejka: -';
    }
    document.getElementById('jobPositionPill').textContent = positionText;

    const summary = document.getElementById('jobSummary');
    if (job.message) {
        summary.textContent = job.message;
    } else {
        summary.textContent = 'Status zadania: ' + statusLabel;
    }

    const logEl = document.getElementById('jobLog');
    const lines = Array.isArray(job.logs) ? job.logs : [];
    logEl.textContent = lines.length ? lines.join('\n') : 'Brak logow.';
    logEl.scrollTop = logEl.scrollHeight;
}

async function pollJob() {
    if (!activeJobId || pollInFlight) return;
    pollInFlight = true;
    try {
        const data = await window.STAuthorizedFetch(
            '/autoinstaling/status/' + encodeURIComponent(activeJobId)
        );
        const job = data && data.job ? data.job : null;
        renderJob(job);
        const statusKey = job && (job.status || '').toLowerCase();
        if (statusKey === 'done' || statusKey === 'error') {
            stopPolling();
            setFormDisabled(false);
            if (statusKey === 'error') {
                showMessage(job.message || 'Zadanie zakonczone bledem.', 'error');
            } else {
                showMessage('Zadanie zakonczone. ' + (job.message || ''), 'success');
            }
        }
    } catch (error) {
        showMessage('Blad pobierania statusu: ' + error.message, 'error');
    } finally {
        pollInFlight = false;
    }
}

function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(pollJob, JOB_POLL_INTERVAL);
}

function stopPolling() {
    if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

function resetToForm() {
    stopPolling();
    activeJobId = null;
    document.getElementById('jobPanel').hidden = true;
    document.getElementById('autoinstalingForm').reset();
    setFormDisabled(false);
    showMessage('', '');
}

async function handleStart(event) {
    event.preventDefault();
    showMessage('', '');

    const login = document.getElementById('instalingLogin').value.trim();
    const password = document.getElementById('instalingPassword').value;
    const sessions = parseInt(document.getElementById('sessions').value, 10);
    const wrongChance = parseInt(document.getElementById('wrongChance').value, 10);

    if (!login || !password) {
        showMessage('Podaj login i haslo do instaling.pl.', 'error');
        return;
    }
    if (!Number.isFinite(sessions) || sessions < 1 || sessions > 50) {
        showMessage('Liczba sesji musi byc w zakresie 1-50.', 'error');
        return;
    }
    if (!Number.isFinite(wrongChance) || wrongChance < 0 || wrongChance > 100) {
        showMessage('Procent blednych odpowiedzi musi byc w zakresie 0-100.', 'error');
        return;
    }

    showLoading(true);
    setFormDisabled(true);
    try {
        const data = await window.STAuthorizedFetch('/autoinstaling/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login,
                password,
                sessions,
                wrong_chance: wrongChance
            })
        });

        activeJobId = data.job_id || (data.job && data.job.job_id) || null;
        if (!activeJobId) {
            throw new Error('Serwer nie zwrocil identyfikatora zadania');
        }

        const queueInfo = typeof data.position === 'number'
            ? ` (pozycja w kolejce: ${data.position})`
            : '';
        showMessage('Zadanie przyjete do kolejki' + queueInfo + '.', 'success');
        renderJob({ status: 'queued', position: data.position, logs: [] });
        startPolling();
        await pollJob();
    } catch (error) {
        setFormDisabled(false);
        showMessage('Nie udalo sie wyslac zadania: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    autoinstalingUser = await window.STRefreshSession();
    if (!autoinstalingUser) {
        window.STNavigate('login.html');
        return;
    }

    const role = (autoinstalingUser.role || 'user').toLowerCase();
    if (!AUTOINSTALING_ALLOWED_ROLES.includes(role)) {
        showPremiumGate();
        return;
    }

    document.getElementById('autoinstalingForm').addEventListener('submit', handleStart);
    document.getElementById('refreshJobBtn').addEventListener('click', () => pollJob());
    document.getElementById('newJobBtn').addEventListener('click', resetToForm);

    // Usluga na Render Free zasypia - zaczynamy ja wybudzac juz przy otwarciu strony.
    window.STAuthorizedFetch('/autoinstaling/wake', { method: 'POST' }).catch(() => {});
});
