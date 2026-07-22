// ==========================================
// CONEXZ - SCRIPT COMPLETO
// ==========================================

const socket = io();
let currentVideoId = null;
let currentAudio = null;
let isAudioPlaying = false;
let currentTheme = '#00d4ff';
let statusInterval = null;
let currentCode = null;
let codeTimerInterval = null;
let scannerActive = false;
let scannerStream = null;
let scanInterval = null;
let scannedCode = null;

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function init() {
    console.log('🚀 Iniciando ConexZ...');
    
    try {
        // Pegar ID do dispositivo
        const res = await fetch('/api/device');
        const data = await res.json();
        document.getElementById('deviceId').textContent = '📱 ID: ' + data.id.substring(0, 8);
        
        // Carregar dados
        await carregarStatus();
        await loadFiles();
        await loadVideos();
        await loadMusic();
        await loadImages();
        await carregarDispositivos();
        
        // Configurar eventos
        setupEvents();
        
        // Iniciar atualização automática de status
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
        
        document.getElementById('statusIP').textContent = data.ip;
        document.getElementById('statusPort').textContent = data.port;
        document.getElementById('statusTime').textContent = data.hora;
        document.getElementById('statusDate').textContent = data.data;
        document.getElementById('statusFiles').textContent = data.arquivos;
        document.getElementById('statusVideos').textContent = data.videos + ' 🎬';
        document.getElementById('statusMusicas').textContent = data.musicas + ' 🎵';
        document.getElementById('statusImagens').textContent = data.imagens + ' 🖼️';
        
        const url = `http://${data.ip}:${data.port}`;
        document.getElementById('statusUrl').textContent = url;
        
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
// CONEXÃO POR CÓDIGO
// ==========================================

async function gerarCodigo() {
    try {
        const res = await fetch('/api/connection/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        currentCode = data.code;
        document.getElementById('connectionCode').textContent = data.code;
        document.getElementById('codeTimer').textContent = '⏳ Válido por 5 minutos';
        document.getElementById('gerarCodeBtn').innerHTML = '<i class="fas fa-sync"></i> Gerar Novo';
        
        // Gerar QR Code do código
        await gerarQRCode(data.code);
        
        iniciarContador();
        
        mostrarStatus(`📱 Código gerado: ${data.code}`, 'success');
    } catch(e) {
        mostrarStatus('❌ Erro ao gerar código', 'error');
    }
}

async function gerarQRCode(code) {
    try {
        const res = await fetch(`/api/connection/qr/${code}`);
        const data = await res.json();
        
        const container = document.getElementById('codeQRContainer');
        const image = document.getElementById('codeQRImage');
        
        if (data.qr) {
            image.src = `data:image/png;base64,${data.qr}`;
            container.style.display = 'block';
        }
    } catch(e) {
        console.error('❌ Erro ao gerar QR Code:', e);
    }
}

function iniciarContador() {
    if (codeTimerInterval) clearInterval(codeTimerInterval);
    let tempoRestante = 300;
    
    codeTimerInterval = setInterval(() => {
        tempoRestante--;
        const minutos = Math.floor(tempoRestante / 60);
        const segundos = tempoRestante % 60;
        document.getElementById('codeTimer').textContent = 
            `⏳ Válido por ${minutos}:${segundos.toString().padStart(2, '0')}`;
        
        if (tempoRestante <= 0) {
            clearInterval(codeTimerInterval);
            document.getElementById('codeTimer').textContent = '⏰ Código expirado';
            document.getElementById('connectionCode').textContent = '------';
            document.getElementById('codeQRContainer').style.display = 'none';
        }
    }, 1000);
}

function copiarCodigo() {
    const code = document.getElementById('connectionCode').textContent;
    if (code && code !== '------') {
        navigator.clipboard.writeText(code);
        mostrarStatus('✅ Código copiado!', 'success');
    } else {
        mostrarStatus('❌ Gere um código primeiro', 'error');
    }
}

// ==========================================
// SCANNER (CÂMERA)
// ==========================================

async function iniciarScanner() {
    try {
        const video = document.getElementById('scannerVideo');
        
        // Iniciar câmera
        scannerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = scannerStream;
        await video.play();
        
        scannerActive = true;
        document.getElementById('scanBtn').style.display = 'none';
        document.getElementById('stopScanBtn').style.display = 'inline-flex';
        document.getElementById('scanStatus').textContent = '📷 Câmera ativa. Aponte para o QR Code...';
        document.getElementById('scanStatus').style.color = '#48bb78';
        
        // Iniciar leitura
        startScanning();
        
    } catch(e) {
        console.error('❌ Erro ao iniciar câmera:', e);
        document.getElementById('scanStatus').textContent = '❌ Não foi possível acessar a câmera. Permita o acesso ou use o código manualmente.';
        document.getElementById('scanStatus').style.color = '#fc8181';
    }
}

function startScanning() {
    if (scanInterval) clearInterval(scanInterval);
    
    scanInterval = setInterval(async () => {
        if (!scannerActive) return;
        
        const video = document.getElementById('scannerVideo');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/png');
        
        try {
            const res = await fetch('/api/scan-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            const data = await res.json();
            
            if (data.code) {
                // Código encontrado!
                pararScanner();
                document.getElementById('scannedCodeDisplay').style.display = 'block';
                document.getElementById('scannedCode').textContent = data.code;
                document.getElementById('scanStatus').textContent = '✅ Código lido com sucesso!';
                document.getElementById('scanStatus').style.color = '#48bb78';
                
                scannedCode = data.code;
                
                // Vibrar o celular (se suportado)
                if (navigator.vibrate) {
                    navigator.vibrate(200);
                }
            }
        } catch(e) {
            // Ignorar erros de leitura
        }
    }, 500);
}

function pararScanner() {
    scannerActive = false;
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    document.getElementById('scannerVideo').srcObject = null;
    document.getElementById('scanBtn').style.display = 'inline-flex';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('scanStatus').textContent = '📷 Câmera desativada';
    document.getElementById('scanStatus').style.color = 'var(--text-secondary)';
}

async function conectarCodigoLido() {
    if (!scannedCode) {
        mostrarStatus('❌ Nenhum código foi lido', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/connection/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                code: scannedCode,
                device_id: 'celular_' + Date.now()
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            mostrarStatus(`✅ Conectado com sucesso!`, 'success');
            document.getElementById('scannedCodeDisplay').style.display = 'none';
            pararScanner();
            carregarDispositivos();
        } else {
            mostrarStatus(`❌ ${data.error}`, 'error');
        }
    } catch(e) {
        mostrarStatus('❌ Erro ao conectar', 'error');
    }
}

async function conectarComCodigo() {
    const input = document.getElementById('connectCodeInput');
    const code = input.value.toUpperCase().trim();
    
    if (!code || code.length !== 6) {
        mostrarStatus('❌ Digite um código válido de 6 caracteres', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/connection/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                code: code,
                device_id: 'celular_' + Date.now()
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            mostrarStatus(`✅ Conectado com sucesso! IP: ${data.ip}:${data.port}`, 'success');
            document.getElementById('connectStatus').innerHTML = 
                `<span style="color:#48bb78;">✅ Conectado a ${data.ip}:${data.port}</span>`;
            carregarDispositivos();
        } else {
            mostrarStatus(`❌ ${data.error}`, 'error');
        }
    } catch(e) {
        mostrarStatus('❌ Erro ao conectar', 'error');
    }
}

async function carregarDispositivos() {
    try {
        const res = await fetch('/api/connection/status');
        const data = await res.json();
        
        const list = document.getElementById('connectedDevicesList');
        if (data.connected_devices === 0) {
            list.innerHTML = '<p style="color:var(--text-secondary); font-size:14px;">Nenhum dispositivo conectado</p>';
            return;
        }
        
        list.innerHTML = Object.entries(data.devices).map(([id, info]) => `
            <div class="device-item">
                <div class="device-info">
                    <span style="font-weight:600;">📱 ${id}</span>
                    <span style="font-size:12px; color:var(--text-secondary); margin-left:8px;">
                        Código: ${info.code}
                    </span>
                </div>
                <div>
                    <span class="device-status">✅ Conectado</span>
                    <button class="btn btn-sm btn-danger" onclick="desconectarDispositivo('${id}')" style="margin-left:8px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        console.error('❌ Erro ao carregar dispositivos:', e);
    }
}

async function desconectarDispositivo(deviceId) {
    if (!confirm('Desconectar este dispositivo?')) return;
    
    try {
        await fetch(`/api/connection/disconnect/${deviceId}`, { method: 'DELETE' });
        mostrarStatus('✅ Dispositivo desconectado', 'success');
        carregarDispositivos();
    } catch(e) {
        mostrarStatus('❌ Erro ao desconectar', 'error');
    }
}

// ==========================================
// EVENTOS
// ==========================================

function setupEvents() {
    // --- TABS ---
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
            if (tab === 'connection') carregarDispositivos();
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
    document.getElementById('qrBtn').addEventListener('click', gerarQR);
    
    // --- IP ---
    document.getElementById('ipBtn').addEventListener('click', detectarIP);
    
    // --- ATUALIZAR ---
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadFiles();
        loadVideos();
        loadMusic();
        loadImages();
        carregarStatus();
    });
    
    // --- BUSCAR ---
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    
    // --- MODO ESCURO ---
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
    
    // --- TEMAS ---
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const color = this.dataset.color;
            currentTheme = color;
            document.documentElement.style.setProperty('--accent', color);
            
            // Atualizar elementos com a nova cor
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
    
    // --- SOCKET ---
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
    
    socket.on('device_connected', (data) => {
        carregarDispositivos();
        mostrarStatus(`📱 ${data.device_id} conectado!`, 'success');
    });

    socket.on('device_disconnected', (data) => {
        carregarDispositivos();
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
    
    // --- FECHAR MODAIS ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeVideoPlayer();
            fecharQR();
            closeAudioPlayer();
            pararScanner();
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
// QR CODE
// ==========================================

async function gerarQR() {
    const modal = document.getElementById('qrModal');
    const container = document.getElementById('qrContainer');
    const urlEl = document.getElementById('qrUrl');
    modal.classList.add('active');
    container.innerHTML = '<p style="color:var(--text-secondary);">⏳ Gerando...</p>';
    
    try {
        const deviceRes = await fetch('/api/device');
        const deviceData = await deviceRes.json();
        
        const res = await fetch('/api/qr');
        const data = await res.json();
        
        container.innerHTML = `<img src="data:image/png;base64,${data.qr}">`;
        urlEl.textContent = `http://${deviceData.ip}:${deviceData.port}`;
    } catch(e) {
        container.innerHTML = '<p style="color:#e53e3e;">❌ Erro ao gerar QR Code</p>';
        urlEl.textContent = window.location.host;
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
window.gerarCodigo = gerarCodigo;
window.copiarCodigo = copiarCodigo;
window.conectarComCodigo = conectarComCodigo;
window.desconectarDispositivo = desconectarDispositivo;
window.carregarDispositivos = carregarDispositivos;
window.iniciarScanner = iniciarScanner;
window.pararScanner = pararScanner;
window.conectarCodigoLido = conectarCodigoLido;

// ==========================================
// INICIAR
// ==========================================

document.addEventListener('DOMContentLoaded', init);

// Limpar intervalos ao sair
window.addEventListener('beforeunload', function() {
    if (statusInterval) clearInterval(statusInterval);
    if (codeTimerInterval) clearInterval(codeTimerInterval);
    if (scanInterval) clearInterval(scanInterval);
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
    }
});