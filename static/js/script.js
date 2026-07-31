// ==========================================
// CONEXZ - SCRIPT COMPLETO (COM AUTENTICAÇÃO)
// ==========================================

const socket = io();
let currentVideoId = null;
let currentAudio = null;
let isAudioPlaying = false;
let currentTheme = '#00d4ff';
let statusInterval = null;

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
            
            init();
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

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function init() {
    console.log('🚀 Iniciando ConexZ...');
    
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
        
        document.getElementById('statusIP').textContent = data.ip || '--';
        document.getElementById('statusPort').textContent = data.port || '--';
        document.getElementById('statusTime').textContent = data.hora || '--';
        document.getElementById('statusDate').textContent = data.data || '--';
        document.getElementById('statusFiles').textContent = data.arquivos || 0;
        document.getElementById('statusVideos').textContent = (data.videos || 0) + ' 🎬';
        document.getElementById('statusMusicas').textContent = (data.musicas || 0) + ' 🎵';
        document.getElementById('statusImagens').textContent = (data.imagens || 0) + ' 🖼️';
        
        const url = `http://${data.ip || '--'}:${data.port || '--'}`;
        document.getElementById('statusUrl').textContent = url;
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
    const url = document.getElementById('statusUrl').textContent;
    if (url && url !== '--') {
        navigator.clipboard.writeText(url).then(() => {
            mostrarStatus('✅ URL copiada!', 'success');
        }).catch(() => {
            prompt('Copie a URL:', url);
        });
    }
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
        
        const ipDisplay = document.getElementById('ipDisplay');
        const ipAddress = document.getElementById('ipAddress');
        const ipPort = document.getElementById('ipPort');
        
        ipAddress.textContent = data.ip;
        ipPort.textContent = data.port;
        ipDisplay.classList.add('active');
        
        mostrarStatus(`📡 IP: ${data.ip}:${data.port}`, 'info');
    } catch(e) {
        mostrarStatus('❌ Erro ao detectar IP', 'error');
    }
}

function copiarIP() {
    const ip = document.getElementById('ipAddress').textContent;
    const port = document.getElementById('ipPort').textContent;
    const url = `http://${ip}:${port}`;
    
    navigator.clipboard.writeText(url).then(() => {
        mostrarStatus('✅ IP copiado!', 'success');
    }).catch(() => {
        prompt('Copie o IP:', url);
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
            status.textContent = '📷 Escaneie com a câmera do celular';
            status.style.color = 'var(--accent)';
            
            linkText.textContent = data.url;
            linkDisplay.style.display = 'block';
            
            document.getElementById('manualIp').textContent = data.url;
            
            document.getElementById('gerarQRBtn').innerHTML = '<i class="fas fa-sync"></i> Atualizar QR Code';
            
            mostrarStatus('✅ QR Code gerado! Escaneie com o celular', 'success');
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
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                uploadFiles(e.dataTransfer.files);
            }
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                uploadFiles(fileInput.files);
                fileInput.value = '';
            }
        });
    }
    
    document.getElementById('qrBtn').addEventListener('click', gerarQR);
    document.getElementById('ipBtn').addEventListener('click', detectarIP);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
    });
    
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    
    document.getElementById('darkMode').addEventListener('change', function() {
        if (this.checked) {
            document.documentElement.style.setProperty('--bg-primary', '#f0f4f8');
            document.documentElement.style.setProperty('--bg-secondary', '#ffffff');
            document.documentElement.style.setProperty('--bg-card', '#e8edf3');
            document.documentElement.style.setProperty('--bg-hover', '#dce3ea');
            document.documentElement.style.setProperty('--text-primary', '#1a202c');
            document.documentElement.style.setProperty('--text-secondary', '#4a5568');
            document.documentElement.style.setProperty('--text-muted', '#718096');
            document.documentElement.style.setProperty('--border', '#cbd5e0');
        } else {
            document.documentElement.style.setProperty('--bg-primary', '#0a0a1a');
            document.documentElement.style.setProperty('--bg-secondary', '#12122a');
            document.documentElement.style.setProperty('--bg-card', '#1a1a3e');
            document.documentElement.style.setProperty('--bg-hover', '#252550');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
            document.documentElement.style.setProperty('--text-secondary', '#a0aec0');
            document.documentElement.style.setProperty('--text-muted', '#6a7a8e');
            document.documentElement.style.setProperty('--border', '#2a2a5a');
        }
    });
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const color = this.dataset.color;
            currentTheme = color;
            document.documentElement.style.setProperty('--accent', color);
            
            document.querySelectorAll('.btn-primary').forEach(b => {
                b.style.background = color;
            });
            document.querySelectorAll('.tab.active').forEach(t => {
                t.style.background = color;
                t.style.borderColor = color;
            });
            document.querySelectorAll('.badge').forEach(b => {
                b.style.background = color;
            });
            document.querySelectorAll('.logo-icon').forEach(l => {
                l.style.background = color;
            });
        });
    });
    
    socket.on('connect', () => {
        console.log('🔌 Conectado ao servidor');
        mostrarStatus('Conectado ao servidor', 'success');
    });
    
    socket.on('new_file', (data) => {
        console.log(`📄 Novo arquivo: ${data.name}`);
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
        mostrarStatus(`📄 ${data.name} recebido!`, 'success');
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
        progress.addEventListener('input', function() {
            if (currentAudio) {
                currentAudio.currentTime = parseFloat(this.value);
            }
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeVideoPlayer();
            fecharQR();
            closeAudioPlayer();
        }
    });
    
    document.getElementById('videoModal').addEventListener('click', function(e) {
        if (e.target === this) closeVideoPlayer();
    });
    document.getElementById('qrModal').addEventListener('click', function(e) {
        if (e.target === this) fecharQR();
    });
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
    
    progressBar.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    
    mostrarStatus('⏳ Enviando...', 'info');
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }
    };
    
    xhr.onload = () => {
        progressBar.style.display = 'none';
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
        progressBar.style.display = 'none';
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
        document.getElementById('fileCount').textContent = files.length;
    } catch (error) {
        console.error('❌ Erro ao carregar arquivos:', error);
        mostrarStatus('Erro ao carregar arquivos', 'error');
    }
}

function renderFiles(files) {
    const container = document.getElementById('fileList');
    if (!container) return;
    
    if (files.length === 0) {
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
// VÍDEOS
// ==========================================

async function loadVideos() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const videos = files.filter(f => f.name.match(/\.(mp4|webm|mov|mkv|avi)$/i));
        renderVideos(videos);
    } catch (error) {
        console.error('❌ Erro ao carregar vídeos:', error);
    }
}

function renderVideos(videos) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    if (videos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <i class="fas fa-play-circle fa-4x"></i>
                <h3>Nenhum vídeo</h3>
                <p>Envie um vídeo MP4 para assistir</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = videos.map(v => `
        <div class="media-card" onclick="playVideo('${v.id}')">
            <video>
                <source src="/api/view/${v.id}" type="video/mp4">
            </video>
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

function baixarVideo() {
    if (currentVideoId) baixarArquivo(currentVideoId);
}

function compartilharVideo() {
    if (currentVideoId) compartilharArquivo(currentVideoId);
}

// ==========================================
// MÚSICAS
// ==========================================

async function loadMusic() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const music = files.filter(f => f.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i));
        renderMusic(music);
    } catch (error) {
        console.error('❌ Erro ao carregar músicas:', error);
    }
}

function renderMusic(music) {
    const grid = document.getElementById('musicGrid');
    if (!grid) return;
    
    if (music.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <i class="fas fa-music fa-4x"></i>
                <h3>Nenhuma música</h3>
                <p>Envie uma música MP3 para ouvir</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = music.map(m => `
        <div class="media-card" onclick="playAudio('${m.id}')">
            <div class="media-preview">
                <i class="fas fa-music"></i>
            </div>
            <div class="media-info">
                <div class="media-title">${m.name}</div>
                <div class="media-meta">${m.size_formatted}</div>
            </div>
        </div>
    `).join('');
}

function playAudio(fileId) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    fetch('/api/files')
        .then(res => res.json())
        .then(files => {
            const file = files.find(f => f.id === fileId);
            if (file) {
                document.getElementById('audioTitle').textContent = '🎵 ' + file.name;
            }
        });
    
    currentAudio = new Audio(`/api/view/${fileId}`);
    
    currentAudio.addEventListener('loadedmetadata', () => {
        document.getElementById('audioDuration').textContent = formatTempo(currentAudio.duration);
        document.getElementById('audioProgress').max = currentAudio.duration;
    });
    
    currentAudio.addEventListener('timeupdate', () => {
        document.getElementById('audioCurrentTime').textContent = formatTempo(currentAudio.currentTime);
        document.getElementById('audioProgress').value = currentAudio.currentTime;
    });
    
    currentAudio.addEventListener('ended', closeAudioPlayer);
    currentAudio.addEventListener('error', () => {
        mostrarStatus('❌ Erro ao tocar música', 'error');
    });
    
    document.getElementById('audioPlayer').style.display = 'block';
    
    currentAudio.play()
        .then(() => {
            isAudioPlaying = true;
            updateAudioButton();
        })
        .catch(() => {
            mostrarStatus('❌ Erro ao tocar música', 'error');
        });
}

function toggleAudioPlay() {
    if (!currentAudio) return;
    
    if (isAudioPlaying) {
        currentAudio.pause();
    } else {
        currentAudio.play();
    }
    isAudioPlaying = !isAudioPlaying;
    updateAudioButton();
}

function updateAudioButton() {
    const btn = document.getElementById('audioBtn');
    if (!btn) return;
    btn.innerHTML = isAudioPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function closeAudioPlayer() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    document.getElementById('audioPlayer').style.display = 'none';
    isAudioPlaying = false;
    updateAudioButton();
}

// ==========================================
// IMAGENS
// ==========================================

async function loadImages() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i));
        renderImages(images);
    } catch (error) {
        console.error('❌ Erro ao carregar imagens:', error);
    }
}

function renderImages(images) {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    
    if (images.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <i class="fas fa-images fa-4x"></i>
                <h3>Nenhuma imagem</h3>
                <p>Envie uma imagem para visualizar</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = images.map(img => `
        <div class="media-card" onclick="visualizarArquivo('${img.id}')">
            <div class="media-preview">
                <i class="fas fa-image" style="font-size:40px;"></i>
            </div>
            <div class="media-info">
                <div class="media-title">${img.name}</div>
                <div class="media-meta">${img.size_formatted}</div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// QR CODE (MODAL)
// ==========================================

async function gerarQR() {
    const modal = document.getElementById('qrModal');
    const container = document.getElementById('qrContainer');
    const urlEl = document.getElementById('qrUrl');
    modal.classList.add('active');
    container.innerHTML = '<p style="color:var(--text-secondary);">⏳ Gerando...</p>';
    
    try {
        const res = await fetch('/api/qr');
        const data = await res.json();
        container.innerHTML = `<img src="data:image/png;base64,${data.qr}">`;
        urlEl.textContent = data.url || 'https://conexz-app.onrender.com';
    } catch(e) {
        container.innerHTML = '<p style="color:#e53e3e;">❌ Erro ao gerar QR Code</p>';
        urlEl.textContent = 'https://conexz-app.onrender.com';
    }
}

function fecharQR() {
    document.getElementById('qrModal').classList.remove('active');
}

async function copiarLink() {
    const url = document.getElementById('qrUrl').textContent;
    await navigator.clipboard.writeText(url);
    mostrarStatus('✅ Link copiado!', 'success');
}

// ==========================================
// FUNÇÕES COMPARTILHADAS
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
        const res = await fetch(`/api/share/${id}`);
        const data = await res.json();
        await navigator.clipboard.writeText(data.link);
        mostrarStatus('✅ Link copiado!', 'success');
        alert(`Link compartilhável:\n${data.link}\n\nVálido por 24 horas`);
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

function formatTempo(segundos) {
    if (!segundos || isNaN(segundos)) return '0:00';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
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
// EXPORTAR FUNÇÕES
// ==========================================

window.playVideo = playVideo;
window.closeVideoPlayer = closeVideoPlayer;
window.baixarVideo = baixarVideo;
window.compartilharVideo = compartilharVideo;
window.playAudio = playAudio;
window.toggleAudioPlay = toggleAudioPlay;
window.closeAudioPlayer = closeAudioPlayer;
window.visualizarArquivo = visualizarArquivo;
window.baixarArquivo = baixarArquivo;
window.compartilharArquivo = compartilharArquivo;
window.deletarArquivo = deletarArquivo;
window.gerarQR = gerarQR;
window.fecharQR = fecharQR;
window.copiarLink = copiarLink;
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

// ==========================================
// SERVICE WORKER
// ==========================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('✅ Service Worker registrado com sucesso'))
        .catch(err => console.error('❌ Erro ao registrar Service Worker:', err));
}
