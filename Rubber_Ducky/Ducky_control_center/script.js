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
    elements.fileList.innerHTML = '<div class="loading">LOADING_FILES...</div>';

    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents`, {
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
        // Read activate.sh to see what's active
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/activate.sh`, {
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            const content = atob(data.content);

            // Look for the filename in the URL
            // Example: curl ... https://raw.../main/rickroll.bin ...
            const match = content.match(/\/main\/([\w-]+\.bin)/);
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

async function updateFile(path, content, message) {
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
            content: btoa(content),
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

    // Filter for likely payload files (.bin)
    const relevantFiles = files.filter(f =>
        f.type === 'file' &&
        f.name.endsWith('.bin') &&
        f.name !== 'inject.bin'
    );

    relevantFiles.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';

        const isActive = file.name === state.activePayload;
        if (isActive) card.classList.add('active');

        card.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${(file.size / 1024).toFixed(2)} KB</div>
            </div>
            <div class="file-actions">
                ${!isActive ? `<button class="cyber-btn small" onclick="activatePayload('${file.name}')">ACTIVATE</button>` : '<span class="status-indicator connected">ACTIVE</span>'}
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
window.activatePayload = async function (filename) {
    if (!confirm(`ACTIVATE ${filename}?\nThis will overwrite activate.sh and activate.ps1.`)) return;

    const repo = state.repo;

    // Templates
    const shContent = `curl -L "https://raw.githubusercontent.com/${repo}/main/${filename}" -o inject.bin`;
    const ps1Content = `Invoke-WebRequest -Uri "https://raw.githubusercontent.com/${repo}/main/${filename}" -OutFile "inject.bin"`;

    try {
        await updateFile('activate.sh', shContent, `Activate ${filename} (sh)`);
        await updateFile('activate.ps1', ps1Content, `Activate ${filename} (ps1)`);

        alert(`SUCCESS: Activated ${filename}`);
        checkActivePayload();
        loadFiles();
    } catch (e) {
        alert(`FAILED: ${e.message}`);
    }
};

// Start
init();
