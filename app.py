from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO
from flask_cors import CORS
import qrcode
import io
import base64
import os
import hashlib
import time
import socket
import secrets
import json

# ==========================================
# CONFIGURAÇÃO DO APP
# ==========================================

app = Flask(__name__)
app.config['SECRET_KEY'] = 'conexz-secret'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ==========================================
# CONFIGURAÇÕES
# ==========================================

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB

# Armazenamento em memória (100% LOCAL)
db = {'files': {}}
device_id = secrets.token_hex(8)

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# ==========================================
# ROTAS DA API
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/device')
def device():
    return jsonify({'id': device_id, 'ip': get_ip(), 'port': 5001})

@app.route('/api/qr')
def qr():
    try:
        data = json.dumps({'id': device_id, 'ip': get_ip(), 'port': 5001})
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        qr_base64 = base64.b64encode(buffered.getvalue()).decode()
        return jsonify({
            'qr': qr_base64,
            'url': f"http://{get_ip()}:5001"
        })
    except Exception as e:
        print(f"❌ Erro no QR Code: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nome vazio'}), 400
    
    # Gerar ID único
    file_id = hashlib.md5(file.filename.encode() + str(time.time()).encode()).hexdigest()
    
    # Salvar arquivo fisicamente
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(file_path)
    size = os.path.getsize(file_path)
    
    # Salvar no banco de dados em memória
    db['files'][file_id] = {
        'name': file.filename,
        'path': file_path,
        'size': size,
        'date': time.time()
    }
    
    print(f"✅ Arquivo salvo: {file.filename} ({size} bytes)")
    
    socketio.emit('new_file', {'id': file_id, 'name': file.filename})
    
    return jsonify({
        'id': file_id,
        'name': file.filename,
        'size': size,
        'message': '✅ Arquivo enviado com sucesso!'
    })

@app.route('/api/files')
def files():
    """Lista todos os arquivos"""
    files_list = []
    for file_id, info in db['files'].items():
        files_list.append({
            'id': file_id,
            'name': info['name'],
            'size': info['size'],
            'date': info['date']
        })
    print(f"📂 Listando {len(files_list)} arquivos")
    return jsonify(files_list)

@app.route('/api/view/<file_id>')
def view(file_id):
    file_path = get_file_path_from_db(file_id)
    if not file_path or not os.path.exists(file_path):
        # Tentar buscar na pasta uploads diretamente
        import glob
        files = glob.glob(f"uploads/{file_id}_*")
        if files:
            file_path = files[0]
        else:
            return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    # Detectar o tipo de arquivo
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    
    mimetypes = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf'
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')
    
    return send_file(file_path, mimetype=mimetype)

@app.route('/api/download/<file_id>')
def download(file_id):
    """Baixar arquivo"""
    if file_id not in db['files']:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    file_info = db['files'][file_id]
    if not os.path.exists(file_info['path']):
        return jsonify({'error': 'Arquivo não encontrado no servidor'}), 404
    
    return send_file(
        file_info['path'],
        as_attachment=True,
        download_name=file_info['name']
    )

@app.route('/api/share/<file_id>')
def share(file_id):
    """Criar link compartilhável"""
    if file_id not in db['files']:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    token = secrets.token_urlsafe(12)
    return jsonify({
        'link': f"{request.host_url}api/s/{token}",
        'expires': int(time.time()) + 86400
    })

@app.route('/api/s/<token>')
def shared(token):
    """Acessar link compartilhável"""
    # Pega o primeiro arquivo da lista
    for file_id in db['files']:
        return download(file_id)
    return jsonify({'error': 'Nenhum arquivo disponível'}), 404

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    """Deletar arquivo"""
    if file_id not in db['files']:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    file_info = db['files'][file_id]
    if os.path.exists(file_info['path']):
        os.remove(file_info['path'])
    
    del db['files'][file_id]
    
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Arquivo deletado'})

@app.route('/api/status')
def status():
    """Status do servidor"""
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_ip(),
        'files': len(db['files'])
    })

@app.route('/manifest.json')
def manifest():
    return send_file('static/manifest.json', mimetype='application/json')

# ==========================================
# INICIAR SERVIDOR
# ==========================================

if __name__ == '__main__':
    port = 5001
    ip = get_ip()
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║   📱 CONEXZ - Transferência Inteligente (100% LOCAL)        ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  📱  DISPOSITIVO: {}                                     ║
    ║  💾  ARMAZENAMENTO: LOCAL (SEM NUVEM)                       ║
    ║  🎬  PLAYER: ✅ ATIVADO                                    ║
    ║  🎨  CORES: ✅ FUNCIONANDO                                 ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, device_id[:8]))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{ip}:{port}")
    print("🎬 Envie um vídeo e clique em 'Vídeos' para assistir!\n")
    print("⚠️  ARQUIVOS FICAM SALVOS LOCALMENTE (pasta uploads/)")
    print("⚠️  QUANDO REINICIAR O SERVIDOR, OS ARQUIVOS SOMEM\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True
    )