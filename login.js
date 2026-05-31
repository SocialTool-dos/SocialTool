// login.js - UPDATED WITH BETTER ERROR HANDLING
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showMessage('Proszę wypełnić wszystkie pola', 'error');
        return;
    }

    showLoading(true);
    showMessage('', '');

    try {
        console.log('🔐 Próba logowania:', username);
        const loginResponse = await fetch(window.STGetApiBase() + '/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        console.log('📩 Status odpowiedzi:', loginResponse.status);

        let loginData;
        try {
            loginData = await loginResponse.json();
        } catch (jsonError) {
            console.error('❌ Błąd parsowania JSON:', jsonError);
            throw new Error('Serwer zwrócił nieprawidłową odpowiedź');
        }
        
        console.log('📊 Dane logowania:', loginData);
        
        if (loginData && loginData.success && loginData.user) {
            showMessage('🎉 Logowanie udane!', 'success');
            if (loginData.token) {
                localStorage.setItem('authToken', loginData.token);
            }
            localStorage.setItem('currentUser', loginData.user.username);
            localStorage.setItem('currentUserRole', loginData.user.role || 'user');
            setTimeout(() => {
                const targetUrl = loginData.user.is_admin ? 'admin.html' : 'download.html';
                if (window.STNavigate) {
                    window.STNavigate(targetUrl);
                } else {
                    window.location.href = targetUrl;
                }
            }, 1500);
        } else {
            const errorMsg = loginData ? loginData.message : 'Błąd połączenia z serwerem';
            showMessage('❌ ' + errorMsg, 'error');
        }
    } catch (error) {
        console.error('💥 Błąd logowania:', error);
        showMessage('❌ Błąd: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
});

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = show ? 'block' : 'none';
    }
}

function showMessage(message, type) {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = 'message ' + type;
        messageEl.style.display = message ? 'block' : 'none';
    }
}
