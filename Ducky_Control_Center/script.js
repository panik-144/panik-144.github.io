const API_BASE = 'https://api.github.com';

// DOM Elements
const elements = {
    settings: document.getElementById('settings'),
    dashboard: document.getElementById('dashboard'),
    repoName: document.getElementById('repoName'),
    token: document.getElementById('githubToken'),
    connectBtn: document.getElementById('connectBtn'),
    statusIndicator: document.getElementById('connectionStatus'),
    activePayloadDisplay: document.getElementById('activePayloadsList'),
    fileList: document.getElementById('fileList'),
    refreshBtn: document.getElementById('refreshFiles')
};

// State
let state = {
    token: localStorage.getItem('ducky_token') || '',
    repo: localStorage.getItem('ducky_repo') || '',
    activePayload: 'UNKNOWN'
};

// Initialization
function init() {
    if (state.token && state.repo) {
        elements.repoName.value = state.repo;
        elements.token.value = state.token;
        testConnection(state.repo, state.token).then(result => {
            if (result.success) showDashboard();
        });
    }
    setupEventListeners();
}

function setupEventListeners() {
    elements.connectBtn.addEventListener('click', async () => {
        const repo = elements.repoName.value.trim();
        const token = elements.token.value.trim();
        const btn = elements.connectBtn;

        if (!repo || !token) {
            alert('Please enter both Repo Name and Token');
            return;
        }

        btn.innerText = 'CONNECTING...';
        btn.disabled = true;

        try {
            const result = await testConnection(repo, token);
            if (result.success) {
                saveCredentials(repo, token);
                showDashboard();
            } else {
                alert(`CONNECTION FAILED:\n${result.error}\n\nCheck your Token permissions (Repo: Read/Write) and Repo Name.`);
            }
        } catch (e) {
            alert('System Error: ' + e.message);
        } finally {
            btn.innerText = 'INITIALIZE_CONNECTION';
            btn.disabled = false;
        }
    });

    elements.refreshBtn.addEventListener('click', () => {
        loadFiles();
        checkActivePayload();
    });
}

// GitHub API Functions
async function testConnection(repo, token) {
    try {
        const response = await fetch(`${API_BASE}/repos/${repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            return { success: true };
        } else {
            return { success: false, error: `${response.status} ${response.statusText}` };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

    async function loadFiles() {
        elements.fileList.innerHTML = '<div class="loading">LOADING_MODULES...</div>';

        try {
            // Fetch contents of Rubber_Ducky/Attacks
            const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/Attacks`, {
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || response.statusText);
            }

            const files = await response.json();
            renderFiles(files);
        } catch (e) {
            elements.fileList.innerHTML = `<div class="terminal-output" style="color: var(--accent)">ERROR: ${e.message}</div>`;
        }
    }

    async function checkActivePayload() {
        elements.activePayloadDisplay.innerHTML = '<span class="loading">SCANNING_ACTIVATION_SCRIPTS...</span>';

        try {
            // Read remote/activate.sh to see what's active
            const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/remote/activate.sh`, {
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const content = atob(data.content);

                // Look for the attack name in the path
                // Example: .../Rubber_Ducky/Attacks/Rickroll/...
                const match = content.match(/Rubber_Ducky\/Attacks\/([^\/]+)/);
                if (match && match[1]) {
                    state.activePayload = match[1];
                    elements.activePayloadDisplay.innerHTML = `<span class="status-indicator connected">${state.activePayload}</span>`;
                    return;
                }
            }

            elements.activePayloadDisplay.innerHTML = '<span class="status-indicator">NO_ACTIVE_PAYLOAD_DETECTED</span>';
        } catch (e) {
            console.error(e);
            elements.activePayloadDisplay.innerHTML = '<span class="status-indicator error">SCAN_ERROR</span>';
        }
    }

    async function updateFile(path, content, message, isBase64 = false) {
        try {
            let sha = '';
            try {
                const current = await fetch(`${API_BASE}/repos/${state.repo}/contents/${path}`, {
                    headers: {
                        'Authorization': `Bearer ${state.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (current.ok) {
                    const data = await current.json();
                    sha = data.sha;
                }
            } catch (e) { }

            const body = {
                message: message,
                content: isBase64 ? content : btoa(content),
                branch: 'main'
            };

            if (sha) body.sha = sha;

            const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || response.statusText);
            }

            return true;
        } catch (e) {
            throw e;
        }
    }

    // UI Functions
    function showDashboard() {
        elements.settings.classList.add('hidden');
        elements.dashboard.classList.remove('hidden');
        elements.statusIndicator.innerText = 'CONNECTED';
        elements.statusIndicator.classList.add('connected');
        loadFiles();
        checkActivePayload();
    }

    function renderFiles(files) {
        elements.fileList.innerHTML = '';

        if (!Array.isArray(files)) return;

        // Filter for directories (Attacks)
        const attacks = files.filter(f => f.type === 'dir');

        attacks.forEach(attack => {
            const card = document.createElement('div');
            card.className = 'file-card';

            const isActive = attack.name === state.activePayload;
            if (isActive) card.classList.add('active');

            card.innerHTML = `
            <div class="file-info">
                <div class="file-name">${attack.name}</div>
                <div class="file-size">MODULE</div>
            </div>
            <div class="file-actions">
                ${!isActive ? `<button class="cyber-btn small" onclick="activatePayload('${attack.name}')">ACTIVATE</button>` : '<span class="status-indicator connected">ACTIVE</span>'}
            </div>
        `;
            elements.fileList.appendChild(card);
        });
    }

    function saveCredentials(repo, token) {
        state.repo = repo;
        state.token = token;
        localStorage.setItem('ducky_repo', repo);
        localStorage.setItem('ducky_token', token);
    }

    // Logic Functions
    window.activatePayload = async function (attackName) {
        if (!confirm(`ACTIVATE MODULE: ${attackName}?\nThis will overwrite remote/activate.sh and remote/activate.ps1.`)) return;

        try {
            // 1. Fetch source scripts
            const [shRes, ps1Res] = await Promise.all([
                fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/Attacks/${attackName}/activate.sh`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
                fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/Attacks/${attackName}/activate.ps1`, { headers: { 'Authorization': `Bearer ${state.token}` } })
            ]);

            if (!shRes.ok || !ps1Res.ok) throw new Error("Could not find activate.sh or activate.ps1 in attack folder");

            const shData = await shRes.json();
            const ps1Data = await ps1Res.json();

            // 2. Update target scripts (using base64 content directly)
            await updateFile('Rubber_Ducky/remote/activate.sh', shData.content, `Activate ${attackName} (sh)`, true);
            await updateFile('Rubber_Ducky/remote/activate.ps1', ps1Data.content, `Activate ${attackName} (ps1)`, true);

            alert(`SUCCESS: Activated ${attackName}`);
            checkActivePayload();
            loadFiles();
        } catch (e) {
            alert(`FAILED: ${e.message}`);
        }
    };

// Start
init();
