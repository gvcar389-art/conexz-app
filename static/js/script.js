// =============================================
// CONEXZ - SCRIPT COMPLETO (SEM LOGIN)
// =============================================

const socket = io();
let videoAtual = null;
let audioAtual = null;
let audioTocando = false;
let statusInterval = null;
let currentQRCode = null;

// =============================================
// INICIALIZAÇÃO
// =============================================

async function init() {
    try {
        const res = await fetch('/api/device');
        const data = await res.json();
        document.getElementById('deviceId').textContent = '📱 ID: ' + data.id.substring(0,8);
        await carregarArquivos();
        await carregarStatus();
        configurarEventos();
        iniciarStatusAutomatico();
        console.log('✅ ConexZ inicializado!');
    } catch(e) {
        console.error('❌ Erro:', e);
        mostrarStatus('Erro ao inicializar', 'error');
    }
}

// =============================================
// STATUS
// =============================================

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

async function detectarIP() {
    try {
        const res = await fetch('/api/device');
        const data = await res.json();
        mostrarStatus(`📡 IP: ${data.ip}:${data.port}`, 'info');
    } catch(e) {
        mostrarStatus('❌ Erro ao detectar IP', 'error');
    }
}

// =============================================
// QR CODE CONEXÃO
// =============================================

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
            
            currentQRCode = data.url;
            document.getElementById('gerarQRBtn').innerHTML = '<i class="fas fa-sync"></i> Atualizar QR Code';
            
            mostrarStatus('✅ QR Code gerado! Escaneie com o celular', 'success');
        }
    } catch(e) {
        console.error('Erro:', e);
        mostrarStatus('❌ Erro ao gerar QR Code', 'error');
    }
}

// =============================================
// CONFIGURAR EVENTOS
// =============================================

function configurarEventos() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const tabName = this.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const target = document.getElementById('tab-' + tabName);
            if(target) target.classList.add('active');
            if(['videos', 'music', 'images', 'files'].includes(tabName)) {
                carregarArquivos();
            }
        });
    });

    document.getElementById('qrBtn').addEventListener('click', gerarQR);
    document.getElementById('ipBtn').addEventListener('click', detectarIP);
    document.getElementById('refreshBtn').addEventListener('click', carregarArquivos);

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
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
        if(e.dataTransfer.files.length) {
            enviarArquivos(e.dataTransfer.files);
        }
    });
    fileInput.addEventListener('change', () => {
        if(fileInput.files.length) {
            enviarArquivos(fileInput.files);
            fileInput.value = '';
        }
    });

    document.getElementById('searchInput').addEventListener('input', function() {
        const query = this.value.toLowerCase();
        document.querySelectorAll('.file-item').forEach(item => {
            const name = item.dataset.name || '';
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    });

    document.getElementById('darkMode').addEventListener('change', function() {
        if(this.checked) {
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

    socket.on('new_file', () => {
        carregarArquivos();
        carregarStatus();
        mostrarStatus('📄 Novo arquivo recebido!', 'success');
    });
    socket.on('file_deleted', () => {
        carregarArquivos();
        carregarStatus();
    });

    document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') {
            fecharVideo();
            fecharQR();
            fecharAudio();
        }
    });

    document.getElementById('videoModal').addEventListener('click', function(e) {
        if(e.target === this) fecharVideo();
    });
    document.getElementById('qrModal').addEventListener('click', function(e) {
        if(e.target === this) fecharQR();
    });
}

// =============================================
// UPLOAD
// =============================================

async function enviarArquivos(files) {
    const form = new FormData();
    for(let f of files) form.append('file', f);
    
    const progress = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    progress.style.display = 'flex';
    fill.style.width = '0%';
    text.textContent = '0%';
    
    mostrarStatus('⏳ Enviando...', 'info');
    
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        
        xhr.upload.onprogress = (e) => {
            if(e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                fill.style.width = pct + '%';
                text.textContent = pct + '%';
            }
        };
        
        xhr.onload = () => {
            progress.style.display = 'none';
            if(xhr.status === 200) {
                mostrarStatus('✅ Arquivo enviado com sucesso!', 'success');
                carregarArquivos();
                carregarStatus();
            } else {
                mostrarStatus('❌ Erro ao enviar', 'error');
            }
        };
        
        xhr.onerror = () => {
            progress.style.display = 'none';
            mostrarStatus('❌ Erro de conexão', 'error');
        };
        
        xhr.send(form);
    } catch(e) {
        progress.style.display = 'none';
        mostrarStatus('❌ Erro ao enviar', 'error');
    }
}

// =============================================
// ARQUIVOS
// =============================================

async function carregarArquivos() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        renderizarArquivos(files);
        renderizarMidia(files);
        document.getElementById('fileCount').textContent = files.length;
    } catch(e) {
        console.error('❌ Erro:', e);
        mostrarStatus('Erro ao carregar arquivos', 'error');
    }
}

function renderizarArquivos(files) {
    const list = document.getElementById('fileList');
    if(!files.length) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhum arquivo encontrado</p><p style="font-size:14px;">Envie seu primeiro arquivo!</p></div>`;
        return;
    }
    
    list.innerHTML = files.map(f => `
        <div class="file-item" data-name="${f.name.toLowerCase()}">
            <div class="file-info">
                <i class="${getIcon(f.name)}"></i>
                <div class="file-details">
                    <div class="file-name">${f.name}</div>
                    <div class="file-meta">${f.size_formatted} • ${f.date}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-sm btn-secondary" onclick="visualizarArquivo('${f.id}')" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-secondary" onclick="baixarArquivo('${f.id}')" title="Baixar"><i class="fas fa-download"></i></button>
                <button class="btn btn-sm btn-secondary" onclick="compartilharArquivo('${f.id}')" title="Compartilhar"><i class="fas fa-share-alt"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deletarArquivo('${f.id}')" title="Deletar"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function renderizarMidia(files) {
    const videos = files.filter(f => f.name.match(/\.(mp4|webm|mov|mkv|avi)$/i));
    const audios = files.filter(f => f.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i));
    const imagens = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i));
    
    document.getElementById('videoGrid').innerHTML = videos.length ? 
        videos.map(v => `
            <div class="media-card" onclick="playVideo('${v.id}')">
                <video><source src="/api/view/${v.id}"></video>
                <div class="media-info">
                    <div class="media-title">${v.name}</div>
                    <div class="media-meta">${v.size_formatted}</div>
                </div>
            </div>
        `).join('') :
        `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-play-circle"></i><p>Nenhum vídeo encontrado</p></div>`;
    
    document.getElementById('musicGrid').innerHTML = audios.length ?
        audios.map(a => `
            <div class="media-card" onclick="playAudio('${a.id}')">
                <div class="media-preview"><i class="fas fa-music"></i></div>
                <div class="media-info">
                    <div class="media-title">${a.name}</div>
                    <div class="media-meta">${a.size_formatted}</div>
                </div>
            </div>
        `).join('') :
        `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-music"></i><p>Nenhuma música encontrada</p></div>`;
    
    document.getElementById('imageGrid').innerHTML = imagens.length ?
        imagens.map(i => `
            <div class="media-card" onclick="visualizarArquivo('${i.id}')">
                <div class="media-preview"><i class="fas fa-image" style="font-size:40px;"></i></div>
                <div class="media-info">
                    <div class="media-title">${i.name}</div>
                    <div class="media-meta">${i.size_formatted}</div>
                </div>
            </div>
        `).join('') :
        `<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-images"></i><p>Nenhuma imagem encontrada</p></div>`;
}

// =============================================
// VÍDEO
// =============================================

function playVideo(id) {
    videoAtual = id;
    const modal = document.getElementById('videoModal');
    const player = document.getElementById('videoPlayer');
    player.src = '/api/view/' + id;
    modal.classList.add('active');
    player.play();
}

function fecharVideo() {
    const player = document.getElementById('videoPlayer');
    player.pause();
    player.src = '';
    document.getElementById('videoModal').classList.remove('active');
}

function baixarVideo() { if(videoAtual) baixarArquivo(videoAtual); }
function compartilharVideo() { if(videoAtual) compartilharArquivo(videoAtual); }

// =============================================
// ÁUDIO
// =============================================

function playAudio(id) {
    if(audioAtual) { audioAtual.pause(); audioAtual = null; }
    
    audioAtual = new Audio('/api/view/' + id);
    
    fetch('/api/files').then(r => r.json()).then(files => {
        const f = files.find(x => x.id === id);
        if(f) document.getElementById('audioTitle').textContent = '🎵 ' + f.name;
    });
    
    audioAtual.ontimeupdate = () => {
        if(audioAtual.duration) {
            const pct = (audioAtual.currentTime / audioAtual.duration) * 100;
            document.getElementById('audioProgress').value = pct;
            document.getElementById('audioCurrentTime').textContent = formatTempo(audioAtual.currentTime);
        }
    };
    
    audioAtual.onloadedmetadata = () => {
        document.getElementById('audioDuration').textContent = formatTempo(audioAtual.duration);
    };
    
    audioAtual.onended = fecharAudio;
    audioAtual.onerror = () => mostrarStatus('❌ Erro ao tocar música', 'error');
    
    document.getElementById('audioPlayer').style.display = 'block';
    audioAtual.play();
    audioTocando = true;
    document.getElementById('audioBtn').innerHTML = '<i class="fas fa-pause"></i>';
}

function toggleAudio() {
    if(!audioAtual) return;
    if(audioTocando) {
        audioAtual.pause();
        document.getElementById('audioBtn').innerHTML = '<i class="fas fa-play"></i>';
    } else {
        audioAtual.play();
        document.getElementById('audioBtn').innerHTML = '<i class="fas fa-pause"></i>';
    }
    audioTocando = !audioTocando;
}

function fecharAudio() {
    if(audioAtual) { audioAtual.pause(); audioAtual.src = ''; audioAtual = null; }
    document.getElementById('audioPlayer').style.display = 'none';
    audioTocando = false;
    document.getElementById('audioBtn').innerHTML = '<i class="fas fa-play"></i>';
}

// =============================================
// QR CODE MODAL
// =============================================

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

// =============================================
// FUNÇÕES COMPARTILHADAS
// =============================================

function visualizarArquivo(id) {
    window.open('/api/view/' + id, '_blank');
}

function baixarArquivo(id) {
    window.location.href = '/api/download/' + id;
    mostrarStatus('⬇️ Download iniciado', 'success');
}

async function compartilharArquivo(id) {
    try {
        const res = await fetch('/api/share/' + id);
        const data = await res.json();
        await navigator.clipboard.writeText(data.link);
        mostrarStatus('✅ Link copiado!', 'success');
        alert('Link compartilhável:\n' + data.link + '\n\nVálido por 24 horas');
    } catch(e) {
        mostrarStatus('❌ Erro ao compartilhar', 'error');
    }
}

async function deletarArquivo(id) {
    if(!confirm('Tem certeza que deseja deletar este arquivo?')) return;
    try {
        await fetch('/api/delete/' + id, { method: 'DELETE' });
        mostrarStatus('🗑️ Arquivo deletado', 'success');
        carregarArquivos();
        carregarStatus();
    } catch(e) {
        mostrarStatus('❌ Erro ao deletar', 'error');
    }
}

// =============================================
// TEMAS
// =============================================

function mudarTema(cor, btn) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.documentElement.style.setProperty('--accent', cor);
    document.querySelectorAll('.btn-primary').forEach(b => {
        b.style.background = cor;
    });
    document.querySelectorAll('.tab.active').forEach(t => {
        t.style.background = cor;
        t.style.borderColor = cor;
    });
    document.querySelectorAll('.badge').forEach(b => {
        b.style.background = cor;
    });
    document.querySelectorAll('.logo-icon').forEach(l => {
        l.style.background = cor;
    });
}

// =============================================
// UTILITÁRIOS
// =============================================

function getIcon(name) {
    if(name.match(/\.(mp4|webm|mov|mkv|avi)$/i)) return 'fas fa-play-circle';
    if(name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) return 'fas fa-music';
    if(name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)) return 'fas fa-image';
    if(name.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i)) return 'fas fa-file-pdf';
    if(name.match(/\.(zip|rar|7z|tar|gz)$/i)) return 'fas fa-file-archive';
    return 'fas fa-file';
}

function formatTempo(segundos) {
    if(!segundos || isNaN(segundos)) return '0:00';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function mostrarStatus(msg, tipo) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = 'status ' + tipo;
    el.style.display = 'block';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// EXPORTAR FUNÇÕES PARA O HTML
window.playVideo = playVideo;
window.fecharVideo = fecharVideo;
window.baixarVideo = baixarVideo;
window.compartilharVideo = compartilharVideo;
window.playAudio = playAudio;
window.toggleAudio = toggleAudio;
window.fecharAudio = fecharAudio;
window.visualizarArquivo = visualizarArquivo;
window.baixarArquivo = baixarArquivo;
window.compartilharArquivo = compartilharArquivo;
window.deletarArquivo = deletarArquivo;
window.gerarQR = gerarQR;
window.fecharQR = fecharQR;
window.copiarLink = copiarLink;
window.mudarTema = mudarTema;
window.detectarIP = detectarIP;
window.atualizarStatus = atualizarStatus;
window.copiarUrlStatus = copiarUrlStatus;
window.gerarQRCodeConexao = gerarQRCodeConexao;

// INICIAR
document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', function() {
    if (statusInterval) clearInterval(statusInterval);
});