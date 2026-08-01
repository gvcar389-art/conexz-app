// ============================================
// CONEXZ - FRONTEND CLIENT SCRIPT
// ============================================

let currentUser = null;
let filesDatabase = [];
let socket = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    checkAuthStatus();
    detectDevice();
    setupDragAndDrop();
});

// ============================================
// WEBSOCKET (SOCKET.IO)
// ============================================
function initSocket() {
    socket = io({
        query: { device_id: 'web_client_' + Math.random().toString(36.substring(7)) }
    });

    socket.on('connect', () => {
        console.log('🔗 Conectado ao servidor via Socket.IO');
        updateConnectionBadge(true);
    });

    socket.on('disconnect', () => {
        console.log('❌ Desconectado do servidor');
        updateConnectionBadge(false);
    });

    socket.on('new_file', (data) => {
        console.log('📂 Novo arquivo recebido:', data.name);
        loadFiles(); // Atualiza lista
    });

    socket.on('file_deleted', (data) => {
        console.log('🗑️ Arquivo deletado:', data.id);
        loadFiles();
    });
}

function updateConnectionBadge(isConnected) {
    const badge = document.getElementById('connectionBadge');
    if (badge) {
        badge.textContent = isConnected ? 'Conectado' : 'Desconectado';
        badge.className = isConnected ? 'status-badge online' : 'status-badge offline';
    }
}

// ============================================
// AUTENTICAÇÃO (API)
// ============================================
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/user');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('displayUsername').textContent = data.username || data.email;
            loadFiles();
            loadServerStatus();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
        }
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        document.getElementById('loginScreen').style.display = 'flex';
    }
}

function switchAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('loginFormSection').style.display = 'none';
        document.getElementById('registerFormSection').style.display = 'block';
    } else {
        document.getElementById('loginFormSection').style.display = 'block';
        document.getElementById('registerFormSection').style.display = 'none';
    }
}

function togglePasswordVisibility(fieldId, btn) {
    const input = document.getElementById(fieldId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginUsername').value.trim(); // No seu input adaptado para email/user
    const password = document.getElementById('loginPassword').value;
    const statusEl = 'loginStatus';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (response.ok) {
            showStatus(statusEl, 'Login realizado com sucesso!', 'success');
            setTimeout(() => {
                checkAuthStatus();
            }, 800);
        } else {
            showStatus(statusEl, data.error || 'Erro ao fazer login', 'error');
        }
    } catch (err) {
        showStatus(statusEl, 'Erro de conexão com o servidor', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    // Se o campo de email não existir explicitamente no form de registro, criamos um padrão ou ajustamos o input
    const email = username.includes('@') ? username : `${username.toLowerCase().replace(/\s+/g, '')}@conexz.local`;
    const password = document.getElementById('regPassword').value;
    const statusEl = 'registerStatus';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });
        const data = await response.json();

        if (response.ok) {
            showStatus(statusEl, 'Conta criada! Faça login.', 'success');
            setTimeout(() => {
                switchAuthMode('login');
            }, 1000);
        } else {
            showStatus(statusEl, data.error || 'Erro ao cadastrar', 'error');
        }
    } catch (err) {
        showStatus(statusEl, 'Erro de conexão com o servidor', 'error');
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        checkAuthStatus();
    } catch (err) {
        console.error('Erro ao sair:', err);
    }
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = `login-status ${type}`;
    }
}

// ============================================
// GERENCIAMENTO DE ARQUIVOS (API)
// ============================================
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        if (response.ok) {
            filesDatabase = await response.json();
            renderFiles();
        }
    } catch (err) {
        console.error('Erro ao carregar arquivos:', err);
    }
}

async function loadServerStatus() {
    try {
        const response = await fetch('/api/status-completo');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('localIpStatus').textContent = data.ip;
            document.getElementById('storageUsed').textContent = `${data.arquivos * 2.5} MB (Estimado)`;
            document.getElementById('fileCountBadge').textContent = `${data.arquivos} arquivos`;
        }
    } catch (err) {
        console.error('Erro ao buscar status:', err);
    }
}

// Upload via Drag and Drop ou Input
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        uploadFiles(files);
    });
}

function handleFileSelect(input) {
    if (input.files && input.files.length > 0) {
        uploadFiles(input.files);
    }
}

async function uploadFiles(files) {
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadStatus = document.getElementById('uploadStatus');

    progressContainer.style.display = 'flex';
    uploadStatus.className = 'status';

    let totalFiles = files.length;
    let uploadedCount = 0;

    for (let i = 0; i < totalFiles; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                uploadedCount++;
                let pct = Math.round((uploadedCount / totalFiles) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            }
        } catch (err) {
            console.error('Erro no upload:', err);
        }
    }

    uploadStatus.textContent = 'Upload concluído com sucesso!';
    uploadStatus.className = 'status success';
    
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressFill.style.width = '0%';
        uploadStatus.textContent = '';
        loadFiles();
        loadServerStatus();
    }, 1500);
}

// Renderização na Interface
function renderFiles() {
    const container = document.getElementById('fileListContainer');
    const mediaContainer = document.getElementById('mediaGridContainer');
    const fileTabBadge = document.getElementById('fileTabBadge');
    const clearAllBtn = document.getElementById('clearAllBtn');

    if (!container) return;

    fileTabBadge.textContent = filesDatabase.length;
    clearAllBtn.style.display = filesDatabase.length > 0 ? 'inline-flex' : 'none';

    if (filesDatabase.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>Nenhum arquivo encontrado.</p>
            </div>
        `;
        mediaContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-photo-film"></i>
                <p>Nenhuma mídia encontrada.</p>
            </div>
        `;
        return;
    }

    // Lista de arquivos
    container.innerHTML = filesDatabase.map(file => `
        <div class="file-item" data-name="${file.name.toLowerCase()}">
            <div class="file-info">
                <i class="${getFileIcon(file.name)}"></i>
                <div class="file-details">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">${file.size_formatted || 'Desconhecido'} • ${file.date || ''}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-primary btn-sm" onclick="downloadFile('${file.id}')">
                    <i class="fa-solid fa-download"></i> Baixar
                </button>
                <button class="btn btn-secondary btn-sm" onclick="shareFile('${file.id}')" title="Compartilhar Link">
                    <i class="fa-solid fa-share-nodes"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteFile('${file.id}')" title="Excluir">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Galeria de Mídia
    const mediaFiles = filesDatabase.filter(f => {
        const name = f.name.toLowerCase();
        return name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav)$/);
    });

    if (mediaFiles.length === 0) {
        mediaContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-photo-film"></i>
                <p>Nenhuma imagem, vídeo ou áudio encontrado.</p>
            </div>
        `;
    } else {
        mediaContainer.innerHTML = mediaFiles.map(file => `
            <div class="media-card" onclick="openMediaItem('${file.id}', '${file.name}')">
                <div class="media-preview">
                    <i class="${getFileIcon(file.name)}"></i>
                </div>
                <div class="media-info">
                    <div class="media-title" title="${file.name}">${file.name}</div>
                    <div class="media-meta">${file.size_formatted || ''}</div>
                </div>
            </div>
        `).join('');
    }
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'fa-solid fa-file-image';
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'fa-solid fa-file-video';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'fa-solid fa-file-audio';
    if (ext === 'pdf') return 'fa-solid fa-file-pdf';
    if (['zip', 'rar', '7z', 'tar'].includes(ext)) return 'fa-solid fa-file-zipper';
    return 'fa-solid fa-file-lines';
}

function downloadFile(id) {
    window.location.href = `/api/download/${id}`;
}

async function shareFile(id) {
    try {
        const res = await fetch(`/api/share-link/${id}`);
        const data = await res.json();
        if (data.link) {
            navigator.clipboard.writeText(data.link);
            alert('🔗 Link de compartilhamento (válido por 24h) copiado para a área de transferência!');
        }
    } catch (err) {
        alert('Erro ao gerar link de compartilhamento.');
    }
}

async function deleteFile(id) {
    if (!confirm('Deseja realmente excluir este arquivo?')) return;
    
    try {
        const res = await fetch(`/api/delete/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadFiles();
            loadServerStatus();
        } else {
            const data = await res.json();
            alert(data.error || 'Erro ao deletar');
        }
    } catch (err) {
        console.error('Erro ao deletar:', err);
    }
}

async function clearAllFiles() {
    if (!confirm('Deseja excluir todos os arquivos listados?')) return;
    for (let file of filesDatabase) {
        await fetch(`/api/delete/${file.id}`, { method: 'DELETE' });
    }
    loadFiles();
    loadServerStatus();
}

function filterFiles() {
    const query = document.getElementById('fileSearch').value.toLowerCase();
    document.querySelectorAll('.file-item').forEach(item => {
        const name = item.getAttribute('data-name');
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

// Navegação de Abas
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');

    if (tabName === 'files' || tabName === 'media') {
        loadFiles();
    }
}

// Utilitários de UI (QR code, Tema, etc)
async function openQrModal() {
    const modal = document.getElementById('qrModal');
    const qrDisplay = document.getElementById('qrCodeDisplay');
    const urlText = document.getElementById('modalUrlText');
    
    modal.classList.add('active');
    try {
        const res = await fetch('/api/qr');
        const data = await res.json();
        qrDisplay.innerHTML = `<img src="data:image/png;base64,${data.qr}" alt="QR Code" style="width:180px;height:180px;">`;
        urlText.textContent = data.url;
    } catch (err) {
        qrDisplay.innerHTML = '<p>Erro ao gerar QR Code</p>';
    }
}

function closeQrModal() {
    document.getElementById('qrModal').classList.remove('active');
}

function copyAppUrl() {
    const urlText = document.getElementById('modalUrlText').textContent;
    navigator.clipboard.writeText(urlText);
    alert('Link do aplicativo copiado!');
}

function setTheme(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    localStorage.setItem('conexz_theme', color);
}

// Carregar tema salvo localmente
const savedTheme = localStorage.getItem('conexz_theme');
if (savedTheme) {
    document.documentElement.style.setProperty('--accent', savedTheme);
}

function detectDevice() {
    const badge = document.getElementById('deviceTypeBadge');
    if (!badge) return;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    badge.innerHTML = isMobile ? '<i class="fa-solid fa-mobile-screen"></i> Celular' : '<i class="fa-solid fa-desktop"></i> Desktop';
}

function showAboutInfo() {
    alert('ConexZ v2.5.0 - Sistema P2P e Cloud Sync integrado com Supabase e Flask.');
}
