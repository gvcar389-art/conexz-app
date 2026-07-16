// ==========================================
// CONEXZ - SCRIPT COMPLETO
// ==========================================

const socket = io();
let currentVideoId = null;
let currentAudio = null;
let isAudioPlaying = false;
let currentTheme = '#00d4ff';

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function init() {
    console.log('🚀 Iniciando ConexZ...');
    
    try {
        // Pegar ID do dispositivo
        const res = await fetch('/api/device');
        const data = await res.json();
        document.getElementById('deviceIdText').textContent = data.id.substring(0, 8);
        
        // Carregar dados
        await Promise.all([
            loadFiles(),
            loadVideos(),
            loadMusic(),
            loadImages(),
            loadStats()
        ]);
        
        // Configurar eventos
        setupEvents();
        
        // Atualizar contador
        updateFileCount();
        
        console.log('✅ ConexZ inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
    }
}

// ==========================================
// EVENTOS
// ==========================================

function setupEvents() {
    // --- NAVEGAÇÃO ---
    document.querySelectorAll('.sidebar nav ul li').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.sidebar nav ul li').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            const tab = this.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const target = document.getElementById(`tab-${tab}`);
            if (target) target.classList.add('active');
            
            // Carregar conteúdo específico
            if (tab === 'videos') loadVideos();
            if (tab === 'music') loadMusic();
            if (tab === 'images') loadImages();
            if (tab === 'stats') loadStats();
        });
    });
    
    // --- UPLOAD ---
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
    
    // --- QR CODE ---
    document.getElementById('qrBtn').addEventListener('click', generateQR);
    
    // --- ATUALIZAR ---
    document.getElementById('refreshFiles').addEventListener('click', () => {
        loadFiles();
        updateFileCount();
    });
    
    // --- BUSCAR ---
    document.getElementById('searchFile').addEventListener('input', filterFiles);
    
    // --- MODO ESCURO ---
    document.getElementById('darkMode').addEventListener('change', function() {
        if (this.checked) {
            document.documentElement.style.setProperty('--bg-primary', '#f0f4f8');
            document.documentElement.style.setProperty('--bg-secondary', '#ffffff');
            document.documentElement.style.setProperty('--bg-card', '#e8edf3');
            document.documentElement.style.setProperty('--bg-hover', '#dce3ea');
            document.documentElement.style.setProperty('--text-primary', '#1a202c');
            document.documentElement.style.setProperty('--text-secondary', '#4a5568');
            document.documentElement.style.setProperty('--border', '#cbd5e0');
            document.documentElement.style.setProperty('--text-muted', '#718096');
        } else {
            document.documentElement.style.setProperty('--bg-primary', '#0a0a1a');
            document.documentElement.style.setProperty('--bg-secondary', '#12122a');
            document.documentElement.style.setProperty('--bg-card', '#1a1a3e');
            document.documentElement.style.setProperty('--bg-hover', '#252550');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
            document.documentElement.style.setProperty('--text-secondary', '#a0aec0');
            document.documentElement.style.setProperty('--border', '#2a2a5a');
            document.documentElement.style.setProperty('--text-muted', '#6a7a8e');
        }
    });
    
    // --- TEMAS ---
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const color = this.dataset.color;
            currentTheme = color;
            document.documentElement.style.setProperty('--accent', color);
        });
    });
    
    // --- SOCKET ---
    socket.on('connect', () => {
        console.log('🔌 Conectado ao servidor');
    });
    
    socket.on('new_file', (data) => {
        console.log(`📄 Novo arquivo: ${data.name}`);
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        loadStats();
        updateFileCount();
        showStatus(`📄 ${data.name} recebido!`, 'success');
    });
    
    socket.on('file_deleted', () => {
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        loadStats();
        updateFileCount();
    });
    
    // --- AUDIO PROGRESS ---
    const progress = document.getElementById('audioProgress');
    if (progress) {
        progress.addEventListener('input', function() {
            if (currentAudio) {
                currentAudio.currentTime = parseFloat(this.value);
            }
        });
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
    
    const progressBar = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressBar.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    
    showStatus('⏳ Enviando...', 'info');
    
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
            showStatus('✅ Arquivo enviado com sucesso!', 'success');
            loadFiles();
            loadVideos();
            loadMusic();
            loadImages();
            loadStats();
            updateFileCount();
        } else {
            showStatus('❌ Erro ao enviar arquivo', 'error');
        }
    };
    
    xhr.onerror = () => {
        progressBar.style.display = 'none';
        showStatus('❌ Erro de conexão', 'error');
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
    } catch (error) {
        console.error('❌ Erro ao carregar arquivos:', error);
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
        <div class="file-item" data-id="${file.id}">
            <div class="file-info">
                <i class="${getIcon(file.type)}"></i>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${file.size_formatted} • ${formatDate(file.date)}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-sm btn-secondary" onclick="viewFile('${file.id}')" title="Visualizar">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="downloadFile('${file.id}')" title="Baixar">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="shareFile('${file.id}')" title="Compartilhar">
                    <i class="fas fa-share-alt"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteFile('${file.id}')" title="Deletar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function filterFiles() {
    const query = document.getElementById('searchFile').value.toLowerCase();
    document.querySelectorAll('.file-item').forEach(item => {
        const name = item.querySelector('.file-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}

function updateFileCount() {
    const count = document.querySelectorAll('.file-item').length;
    const badge = document.querySelector('[data-tab="files"] .badge');
    if (badge) badge.textContent = count;
}

// ==========================================
// VÍDEOS
// ==========================================

async function loadVideos() {
    try {
        const res = await fetch('/api/files/video');
        const videos = await res.json();
        renderVideos(videos);
    } catch {
        // Fallback: filtrar todos os arquivos
        const res = await fetch('/api/files');
        const files = await res.json();
        const videos = files.filter(f => f.type === 'video');
        renderVideos(videos);
    }
}

function renderVideos(videos) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    if (videos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
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
                <div class="media-meta">${v.size}</div>
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

function downloadCurrentVideo() {
    if (currentVideoId) downloadFile(currentVideoId);
}

function shareCurrentVideo() {
    if (currentVideoId) shareFile(currentVideoId);
}

// Fechar vídeo com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeVideoPlayer();
});

// ==========================================
// MÚSICAS
// ==========================================

async function loadMusic() {
    try {
        const res = await fetch('/api/files/audio');
        const music = await res.json();
        renderMusic(music);
    } catch {
        const res = await fetch('/api/files');
        const files = await res.json();
        const music = files.filter(f => f.type === 'audio');
        renderMusic(music);
    }
}

function renderMusic(music) {
    const grid = document.getElementById('musicGrid');
    if (!grid) return;
    
    if (music.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
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
                <div class="media-meta">${m.size}</div>
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
                document.getElementById('audioTitle').textContent = file.name;
            }
        });
    
    currentAudio = new Audio(`/api/view/${fileId}`);
    
    currentAudio.addEventListener('loadedmetadata', () => {
        document.getElementById('audioDuration').textContent = formatTime(currentAudio.duration);
        document.getElementById('audioProgress').max = currentAudio.duration;
    });
    
    currentAudio.addEventListener('timeupdate', () => {
        document.getElementById('audioCurrentTime').textContent = formatTime(currentAudio.currentTime);
        document.getElementById('audioProgress').value = currentAudio.currentTime;
    });
    
    currentAudio.addEventListener('ended', closeAudioPlayer);
    currentAudio.addEventListener('error', () => {
        showStatus('❌ Erro ao tocar música', 'error');
    });
    
    document.getElementById('audioPlayer').style.display = 'block';
    
    currentAudio.play()
        .then(() => {
            isAudioPlaying = true;
            updateAudioButton();
        })
        .catch(() => {
            showStatus('❌ Erro ao tocar música', 'error');
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
    const btn = document.getElementById('audioPlayBtn');
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
        const res = await fetch('/api/files/image');
        const images = await res.json();
        renderImages(images);
    } catch {
        const res = await fetch('/api/files');
        const files = await res.json();
        const images = files.filter(f => f.type === 'image');
        renderImages(images);
    }
}

function renderImages(images) {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    
    if (images.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images fa-4x"></i>
                <h3>Nenhuma imagem</h3>
                <p>Envie uma imagem para visualizar</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = images.map(img => `
        <div class="media-card" onclick="viewImage('${img.id}')">
            <div class="media-preview">
                <img src="/api/view/${img.id}" alt="${img.name}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div class="media-info">
                <div class="media-title">${img.name}</div>
                <div class="media-meta">${img.size}</div>
            </div>
        </div>
    `).join('');
}

function viewImage(fileId) {
    window.open(`/api/view/${fileId}`, '_blank');
}

// ==========================================
// ESTATÍSTICAS
// ==========================================

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const stats