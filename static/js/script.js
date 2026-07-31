// ==========================================
// CONEXZ - SCRIPT COMPLETO (COM AUTENTICAÇÃO E SALAS PRIVADAS)
// ==========================================

const socket = io();
let currentVideoId = null;
let currentAudio = null;
let isAudioPlaying = false;
let currentTheme = '#00d4ff';
let statusInterval = null;

// ==========================================
// VERIFICAÇÃO INICIAL DE SESSÃO
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/auth/user');
        const data = await res.json();
        
        if (data.authenticated) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            if (data.username) {
                document.getElementById('userNameDisplay').textContent = data.username;
            }
            init(data.id);
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('mainContent').style.display = 'none';
        }
    } catch (e) {
        console.error('Erro ao verificar autenticação inicial:', e);
    }
});

// ==========================================
// AUTENTICAÇÃO
// ==========================================

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const status = document.getElementById('loginStatus');
    
    if (!email || !password) {
        status.textContent = '❌ Preencha todos os campos';
        status.className = 'login-status error';
        return;
    }
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            status.textContent = '✅ Login realizado!';
            status.className = 'login-status success';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            
            if (data.user && data.user.username) {
                document.getElementById('userNameDisplay').textContent = data.user.username;
            }
            
            init(data.user.id || email);
        } else {
            status.textContent = '❌ ' + data.error;
            status.className = 'login-status error';
        }
    } catch(e) {
        status.textContent = '❌ Erro ao fazer login';
        status.className = 'login-status error';
        console.error(e);
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const status = document.getElementById('registerStatus');
    
    if (!username || !email || !password) {
        status.textContent = '❌ Preencha todos os campos';
        status.className = 'login-status error';
        return;
    }
    
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            status.textContent = '✅ Cadastro realizado! Faça login.';
            status.className = 'login-status success';
            setTimeout(() => {
                showLogin();
                document.getElementById('loginEmail').value = email;
            }, 1500);
        } else {
            status.textContent = '❌ ' + data.error;
            status.className = 'login-status error';
        }
    } catch(e) {
        status.textContent = '❌ Erro ao cadastrar';
        status.className = 'login-status error';
        console.error(e);
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        document.getElementById('mainContent').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('loginStatus').textContent = '';
        document.getElementById('loginStatus').className = 'login-status';
        console.log('✅ Logout realizado');
    } catch(e) {
        console.error('❌ Erro no logout:', e);
    }
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('loginStatus').textContent = '';
    document.getElementById('loginStatus').className = 'login-status';
    document.getElementById('registerStatus').textContent = '';
    document.getElementById('registerStatus').className = 'login-status';
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginStatus').textContent = '';
    document.getElementById('loginStatus').className = 'login-status';
    document.getElementById('registerStatus').textContent = '';
    document.getElementById('registerStatus').className = 'login-status';
}

function togglePasswordVisibility(inputId, iconId) {
    const passwordInput = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!passwordInput) return;
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        passwordInput.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

// ==========================================
// INICIALIZAÇÃO E SALAS ISOLADAS
// ==========================================

async function init(userId) {
    console.log('🚀 Iniciando ConexZ...');
    
    if (userId) {
        socket.emit('join_device_room', { room_code: userId });
    }
    
    try {
        const res = await fetch('/api/device');
        const data = await res.json();
        document.getElementById('deviceId').textContent = '📱 ID: ' + data.id.substring(0, 8);
        
        await carregarStatus();
        await loadFiles();
        await loadVideos();
        await loadMusic();
        await loadImages();
        
        setupEvents();
        iniciarStatusAutomatico();
        
        console.log('✅ ConexZ inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
        mostrarStatus('Erro ao inicializar', 'error');
    }
}

// ==========================================
// STATUS
// ==========================================

async function carregarStatus() {
    try {
        const res = await fetch('/api/status-completo');
        const data = await res.json();
        
        document.getElementById('statusFiles').textContent = data.total_files || 0;
        
        if (data.categories) {
            document.getElementById('statusVideos').textContent = (data.categories.videos || 0) + ' 🎬';
            document.getElementById('statusMusicas').textContent = (data.categories.musicas || 0) + ' 🎵';
            document.getElementById('statusImagens').textContent = (data.categories.imagens || 0) + ' 🖼️';
        }
        
        document.getElementById('manualIp').textContent = 'https://conexz-app.onrender.com';
        
        const badge = document.getElementById('statusBadge');
        if (data.status === 'online') {
            badge.textContent = '🟢 Online';
            badge.className = 'status-badge';
        } else {
            badge.textContent = '🔴 Offline';
            badge.className = 'status-badge offline';
        }
    } catch(e) {
        console.error('❌ Erro ao carregar status:', e);
    }
}

function atualizarStatus() {
    carregarStatus();
    mostrarStatus('🔄 Status atualizado!', 'info');
}

function copiarUrlStatus() {
    const url = 'https://conexz-app.onrender.com';
    navigator.clipboard.writeText(url).then(() => {
        mostrarStatus('✅ URL copiada!', 'success');
    }).catch(() => {
        prompt('Copie a URL:', url);
    });
}

function iniciarStatusAutomatico() {
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = setInterval(carregarStatus, 30000);
}

// ==========================================
// IP
// ==========================================

async function detectarIP() {
    try {
        const res = await fetch('/api/device');
        const data = await res.json();
        mostrarStatus(`📡 IP Local: ${data.ip}:${data.port}`, 'info');
    } catch(e) {
        mostrarStatus('❌ Erro ao detectar IP', 'error');
    }
}

function copiarIP() {
    const url = 'https://conexz-app.onrender.com';
    navigator.clipboard.writeText(url).then(() => {
        mostrarStatus('✅ Link do Servidor Copiado!', 'success');
    }).catch(() => {
        prompt('Copie o Link:', url);
    });
}

// ==========================================
// QR CODE CONEXÃO
// ==========================================

async function gerarQRCodeConexao() {
    try {
        const res = await fetch('/api/qr');
        const data = await res.json();
        
        const img = document.getElementById('qrCodeImage');
        const status = document.getElementById('qrStatus');
        const linkDisplay = document.getElementById('linkDisplayConexao');
        const linkText = document.getElementById('connectionLinkText');
        
        if (data.qr) {
            img.src = `data:image/png;base64,${data.qr}`;
            img.style.display = 'block';
            status.textContent = '📷 Escaneie para emparelhar seus aparelhos';
            status.style.color = 'var(--accent)';
            
            linkText.textContent = data.url;
            linkDisplay.style.display = 'block';
            
            document.getElementById('manualIp').textContent = data.url;
            
            const btn = document.getElementById('gerarQRBtn');
            if (btn) btn.innerHTML = '<i class="fas fa-sync"></i> Atualizar QR Code';
            
            mostrarStatus('✅ QR Code gerado!', 'success');
        }
    } catch(e) {
        console.error('Erro:', e);
        mostrarStatus('❌ Erro ao gerar QR Code', 'error');
    }
}

function copiarLinkConexao() {
    const link = document.getElementById('connectionLinkText').textContent;
    if (link && link !== '') {
        navigator.clipboard.writeText(link).then(() => {
            mostrarStatus('✅ Link copiado!', 'success');
        }).catch(() => {
            prompt('Copie o link:', link);
        });
    } else {
        mostrarStatus('❌ Gere o QR Code primeiro', 'error');
    }
}

// ==========================================
// EVENTOS
// ==========================================

function setupEvents() {
    document.querySelectorAll('.tab').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const target = document.getElementById(`tab-${tab}`);
            if (target) target.classList.add('active');
            
            if (tab === 'videos') loadVideos();
            if (tab === 'music') loadMusic();
            if (tab === 'images') loadImages();
        });
    });
    
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    if (dropZone) {
        dropZone.onclick = () => fileInput.click();
        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
        dropZone.ondragleave = () => dropZone.classList.remove('dragover');
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        };
    }
    
    if (fileInput) {
        fileInput.onchange = () => {
            if (fileInput.files.length > 0) {
                uploadFiles(fileInput.files);
                fileInput.value = '';
            }
        };
    }
    
    const qrBtn = document.getElementById('qrBtn');
    if (qrBtn) qrBtn.onclick = gerarQR;
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.onclick = () => {
            loadFiles();
            loadVideos();
            loadMusic();
            loadImages();
            carregarStatus();
        };
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.oninput = filterFiles;
    
    socket.on('connect', () => {
        console.log('🔌 Conectado ao servidor');
    });
    
    socket.on('new_file', (data) => {
        console.log(`📄 Arquivo atualizado: ${data.name}`);
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
        mostrarStatus(`📄 ${data.name} recebido com segurança!`, 'success');
    });
    
    socket.on('file_deleted', () => {
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
    });
    
    const progress = document.getElementById('audioProgress');
    if (progress) {
        progress.oninput = function() {
            if (currentAudio) currentAudio.currentTime = parseFloat(this.value);
        };
    }
}

// ==========================================
// UPLOAD
// ==========================================

async function uploadFiles(files) {
    if (files.length === 0) return;
    
    const formData = new FormData();
    for (let file of files) {
        formData.append('file', file);
    }
    
    const progressBar = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressBar) progressBar.style.display = 'flex';
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    
    mostrarStatus('⏳ Enviando...', 'info');
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && progressFill && progressText) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }
    };
    
    xhr.onload = () => {
        if (progressBar) progressBar.style.display = 'none';
        if (xhr.status === 200) {
            mostrarStatus('✅ Arquivo enviado com sucesso!', 'success');
            loadFiles();
            loadVideos();
            loadMusic();
            loadImages();
            carregarStatus();
        } else {
            mostrarStatus('❌ Erro ao enviar arquivo', 'error');
        }
    };
    
    xhr.onerror = () => {
        if (progressBar) progressBar.style.display = 'none';
        mostrarStatus('❌ Erro de conexão', 'error');
    };
    
    xhr.send(formData);
}

// ==========================================
// ARQUIVOS
// ==========================================

async function loadFiles() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        renderFiles(files);
        const countEl = document.getElementById('fileCount');
        if (countEl) countEl.textContent = files.length;
    } catch (error) {
        console.error('❌ Erro ao carregar arquivos:', error);
    }
}

function renderFiles(files) {
    const container = document.getElementById('fileList');
    if (!container) return;
    
    if (!Array.isArray(files) || files.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox fa-4x"></i>
                <h3>Nenhum arquivo</h3>
                <p>Envie seu primeiro arquivo!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = files.map(file => `
        <div class="file-item" data-id="${file.id}" data-name="${file.name.toLowerCase()}">
            <div class="file-info">
                <i class="${getIcon(file.name)}"></i>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${file.size_formatted} • ${file.date}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-sm btn-secondary" onclick="visualizarArquivo('${file.id}')" title="Visualizar">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="baixarArquivo('${file.id}')" title="Baixar">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="compartilharArquivo('${file.id}')" title="Compartilhar">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deletarArquivo('${file.id}')" title="Deletar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function filterFiles() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    document.querySelectorAll('.file-item').forEach(item => {
        const name = item.dataset.name || '';
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

// ==========================================
// VÍDEOS / MÚSICAS / IMAGENS
// ==========================================

async function loadVideos() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const videos = files.filter(f => f.name.match(/\.(mp4|webm|mov|mkv|avi)$/i));
        renderVideos(videos);
    } catch (error) {
        console.error('Erro ao carregar vídeos:', error);
    }
}

function renderVideos(videos) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    if (videos.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-play-circle fa-4x"></i><h3>Nenhum vídeo enviado</h3></div>`;
        return;
    }
    grid.innerHTML = videos.map(v => `
        <div class="media-card" onclick="playVideo('${v.id}')">
            <video><source src="/api/view/${v.id}" type="video/mp4"></video>
            <div class="media-info">
                <div class="media-title">${v.name}</div>
                <div class="media-meta">${v.size_formatted}</div>
            </div>
        </div>
    `).join('');
}

function playVideo(fileId) {
    currentVideoId = fileId;
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    player.src = `/api/view/${fileId}`;
    player.load();
    modal.classList.add('active');
    player.play();
}

function closeVideoPlayer() {
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    player.pause();
    player.src = '';
    modal.classList.remove('active');
}

async function loadMusic() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const music = files.filter(f => f.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i));
        renderMusic(music);
    } catch (error) {
        console.error('Erro ao carregar músicas:', error);
    }
}

function renderMusic(music) {
    const grid = document.getElementById('musicGrid');
    if (!grid) return;
    if (music.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-music fa-4x"></i><h3>Nenhuma música enviada</h3></div>`;
        return;
    }
    grid.innerHTML = music.map(m => `
        <div class="media-card" onclick="playAudio('${m.id}')">
            <div class="media-preview"><i class="fas fa-music"></i></div>
            <div class="media-info">
                <div class="media-title">${m.name}</div>
                <div class="media-meta">${m.size_formatted}</div>
            </div>
        </div>
    `).join('');
}

function playAudio(fileId) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    
    currentAudio = new Audio(`/api/view/${fileId}`);
    currentAudio.play();
    isAudioPlaying = true;
    
    const playerContainer = document.getElementById('audioPlayer');
    if (playerContainer) playerContainer.style.display = 'block';
}

function closeAudioPlayer() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    const playerContainer = document.getElementById('audioPlayer');
    if (playerContainer) playerContainer.style.display = 'none';
}

async function loadImages() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i));
        renderImages(images);
    } catch (error) {
        console.error('Erro ao carregar imagens:', error);
    }
}

function renderImages(images) {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    if (images.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-images fa-4x"></i><h3>Nenhuma imagem enviada</h3></div>`;
        return;
    }
    grid.innerHTML = images.map(img => `
        <div class="media-card" onclick="visualizarArquivo('${img.id}')">
            <div class="media-preview"><i class="fas fa-image" style="font-size:40px;"></i></div>
            <div class="media-info">
                <div class="media-title">${img.name}</div>
                <div class="media-meta">${img.size_formatted}</div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// FUNÇÕES COMPARTILHADAS DE ARQUIVOS
// ==========================================

function visualizarArquivo(id) {
    window.open(`/api/view/${id}`, '_blank');
}

function baixarArquivo(id) {
    window.location.href = `/api/download/${id}`;
    mostrarStatus('⬇️ Download iniciado', 'success');
}

async function compartilharArquivo(id) {
    try {
        const res = await fetch(`/api/share-link/${id}`);
        const data = await res.json();
        await navigator.clipboard.writeText(data.link);
        mostrarStatus('✅ Link seguro copiado!', 'success');
        alert(`Link compartilhável (válido por 24h):\n${data.link}`);
    } catch(e) {
        mostrarStatus('❌ Erro ao compartilhar', 'error');
    }
}

async function deletarArquivo(id) {
    if (!confirm('Tem certeza que deseja deletar este arquivo?')) return;
    
    try {
        await fetch(`/api/delete/${id}`, { method: 'DELETE' });
        mostrarStatus('🗑️ Arquivo deletado', 'success');
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
    } catch(e) {
        mostrarStatus('❌ Erro ao deletar', 'error');
    }
}

// ==========================================
// UTILITÁRIOS
// ==========================================

function getIcon(name) {
    if (name.match(/\.(mp4|webm|mov|mkv|avi)$/i)) return 'fas fa-play-circle';
    if (name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) return 'fas fa-music';
    if (name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) return 'fas fa-image';
    if (name.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i)) return 'fas fa-file-pdf';
    if (name.match(/\.(zip|rar|7z|tar|gz)$/i)) return 'fas fa-file-archive';
    return 'fas fa-file';
}

function mostrarStatus(msg, tipo) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status ' + tipo;
    el.style.display = 'block';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ==========================================
// EXPORTAÇÃO GLOBAL
// ==========================================

window.playVideo = playVideo;
window.closeVideoPlayer = closeVideoPlayer;
window.playAudio = playAudio;
window.closeAudioPlayer = closeAudioPlayer;
window.visualizarArquivo = visualizarArquivo;
window.baixarArquivo = baixarArquivo;
window.compartilharArquivo = compartilharArquivo;
window.deletarArquivo = deletarArquivo;
window.detectarIP = detectarIP;
window.copiarIP = copiarIP;
window.atualizarStatus = atualizarStatus;
window.copiarUrlStatus = copiarUrlStatus;
window.gerarQRCodeConexao = gerarQRCodeConexao;
window.copiarLinkConexao = copiarLinkConexao;
window.login = login;
window.register = register;
window.logout = logout;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.togglePasswordVisibility = togglePasswordVisibility;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('✅ Service Worker registrado'))
        .catch(err => console.error('❌ Erro no SW:', err));
}
