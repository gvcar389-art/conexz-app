from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
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
from datetime import datetime
import glob

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

# Banco de dados em memória
db = {'files': {}, 'shared_links': {}}
device_id = secrets.token_hex(8)

def get_local_ip():
    """Pega o IP local do computador"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def format_size(bytes):
    """Formata tamanho do arquivo"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
    return f"{bytes:.1f} TB"

# ==========================================
# ROTAS DA API
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/device')
def device():
    return jsonify({
        'id': device_id,
        'ip': get_local_ip(),
        'port': 5001
    })

@app.route('/api/qr')
def generate_qr():
    """Gera QR Code com o IP correto"""
    ip = get_local_ip()
    
    if ip == '127.0.0.1':
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
        except:
            ip = '127.0.0.1'
    
    data = json.dumps({
        'device_id': device_id,
        'ip': ip,
        'port': 5001
    })
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return jsonify({
        'qr': qr_base64,
        'url': f"http://{ip}:5001"
    })

@app.route('/api/upload', methods=['POST'])
def upload():
    """Upload de arquivo com salvamento local"""
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nome vazio'}), 400
    
    file_id = hashlib.md5(file.filename.encode() + str(time.time()).encode()).hexdigest()
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(file_path)
    size = os.path.getsize(file_path)
    
    db['files'][file_id] = {
        'id': file_id,
        'name': file.filename,
        'path': file_path,
        'size': size,
        'size_formatted': format_size(size),
        'date': time.time(),
        'date_formatted': datetime.now().strftime('%d/%m/%Y %H:%M')
    }
    
    print(f"✅ Arquivo salvo: {file.filename} ({format_size(size)})")
    
    socketio.emit('new_file', {
        'id': file_id,
        'name': file.filename,
        'size': format_size(size)
    })
    
    return jsonify({
        'id': file_id,
        'name': file.filename,
        'size': size,
        'size_formatted': format_size(size),
        'message': '✅ Arquivo enviado com sucesso!'
    })

@app.route('/api/files')
def list_files():
    """Lista todos os arquivos salvos"""
    files = []
    for file_id, info in db['files'].items():
        files.append({
            'id': file_id,
            'name': info['name'],
            'size': info['size'],
            'size_formatted': info['size_formatted'],
            'date': info['date_formatted']
        })
    files.sort(key=lambda x: x['date'], reverse=True)
    print(f"📂 {len(files)} arquivos listados")
    return jsonify(files)

@app.route('/api/view/<file_id>')
def view_file(file_id):
    """Visualizar arquivo"""
    if file_id not in db['files']:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    file_info = db['files'][file_id]
    if not os.path.exists(file_info['path']):
        return jsonify({'error': 'Arquivo não encontrado no servidor'}), 404
    
    filename = file_info['name']
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
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'json': 'application/json',
        'zip': 'application/zip'
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')
    
    return send_file(file_info['path'], mimetype=mimetype)

@app.route('/api/download/<file_id>')
def download_file(file_id):
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
def share_file(file_id):
    """Criar link compartilhável"""
    if file_id not in db['files']:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    token = secrets.token_urlsafe(12)
    share_url = f"{request.host_url}api/s/{token}"
    
    db['shared_links'][token] = {
        'file_id': file_id,
        'expires': time.time() + 86400
    }
    
    return jsonify({
        'link': share_url,
        'expires': time.time() + 86400
    })

@app.route('/api/s/<token>')
def shared_access(token):
    """Acessar link compartilhável"""
    if token not in db['shared_links']:
        return jsonify({'error': 'Link inválido'}), 404
    
    link = db['shared_links'][token]
    if time.time() > link['expires']:
        del db['shared_links'][token]
        return jsonify({'error': 'Link expirado'}), 410
    
    return download_file(link['file_id'])

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete_file(file_id):
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
        'ip': get_local_ip(),
        'port': 5001,
        'files': len(db['files'])
    })

@app.route('/api/status-completo')
def status_completo():
    """Status completo com IP, hora e contagem de arquivos"""
    now = datetime.now()
    
    videos = 0
    musicas = 0
    imagens = 0
    documentos = 0
    
    for file_id, info in db['files'].items():
        name = info['name'].lower()
        if name.endswith(('.mp4', '.webm', '.mov', '.mkv', '.avi')):
            videos += 1
        elif name.endswith(('.mp3', '.wav', '.ogg', '.flac', '.m4a')):
            musicas += 1
        elif name.endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')):
            imagens += 1
        elif name.endswith(('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt')):
            documentos += 1
    
    return jsonify({
        'ip': get_local_ip(),
        'port': 5001,
        'data': now.strftime('%d/%m/%Y'),
        'hora': now.strftime('%H:%M:%S'),
        'dispositivo': device_id[:8],
        'arquivos': len(db['files']),
        'videos': videos,
        'musicas': musicas,
        'imagens': imagens,
        'documentos': documentos,
        'status': 'online'
    })

# ==========================================
# CONEXÃO POR CÓDIGO
# ==========================================

# Armazenar códigos de conexão
connection_codes = {}
connected_devices = {}

def generate_connection_code():
    """Gera um código de 6 dígitos aleatório"""
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@app.route('/api/connection/generate', methods=['POST'])
def generate_connection():
    """Gera um novo código de conexão"""
    code = generate_connection_code()
    
    connection_codes[code] = {
        'created_at': time.time(),
        'expires_at': time.time() + 300,  # 5 minutos
        'device_id': device_id,
        'ip': get_local_ip(),
        'port': 5001
    }
    
    return jsonify({
        'code': code,
        'expires_in': 300,
        'ip': get_local_ip(),
        'port': 5001
    })

@app.route('/api/connection/connect', methods=['POST'])
def connect_with_code():
    """Conecta usando um código"""
    data = request.get_json()
    code = data.get('code', '').upper().strip()
    
    if code not in connection_codes:
        return jsonify({'error': 'Código inválido'}), 404
    
    conn = connection_codes[code]
    if time.time() > conn['expires_at']:
        del connection_codes[code]
        return jsonify({'error': 'Código expirado'}), 410
    
    device_id = data.get('device_id', 'desconhecido')
    connected_devices[device_id] = {
        'code': code,
        'connected_at': time.time(),
        'ip': conn['ip'],
        'port': conn['port']
    }
    
    socketio.emit('device_connected', {
        'device_id': device_id,
        'code': code,
        'ip': conn['ip']
    })
    
    return jsonify({
        'success': True,
        'message': '✅ Dispositivo conectado!',
        'ip': conn['ip'],
        'port': conn['port']
    })

@app.route('/api/connection/status')
def connection_status():
    """Verifica o status da conexão"""
    return jsonify({
        'connected_devices': len(connected_devices),
        'devices': connected_devices,
        'active_codes': len(connection_codes)
    })

@app.route('/api/connection/disconnect/<device_id>', methods=['DELETE'])
def disconnect_device(device_id):
    """Desconecta um dispositivo"""
    if device_id in connected_devices:
        del connected_devices[device_id]
        socketio.emit('device_disconnected', {'device_id': device_id})
        return jsonify({'message': '✅ Dispositivo desconectado'})
    return jsonify({'error': 'Dispositivo não encontrado'}), 404

# ==========================================
# SOCKET.IO EVENTOS
# ==========================================

@socketio.on('connect')
def handle_connect():
    device_id = request.args.get('device_id')
    if device_id:
        emit('device_connected', {'device_id': device_id}, broadcast=True)
        print(f"📱 Dispositivo conectado: {device_id[:8]}...")

@socketio.on('disconnect')
def handle_disconnect():
    device_id = request.args.get('device_id')
    if device_id:
        emit('device_disconnected', {'device_id': device_id}, broadcast=True)
        print(f"📱 Dispositivo desconectado: {device_id[:8]}...")

# ==========================================
# INICIAR SERVIDOR
# ==========================================

if __name__ == '__main__':
    port = 5001
    ip = get_local_ip()
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║   📱 CONEXZ - TRANSFERÊNCIA INTELIGENTE                     ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  📱  DISPOSITIVO: {}                                     ║
    ║  💾  ARQUIVOS: SALVOS LOCALMENTE                           ║
    ║  📂  PASTA:    uploads/                                     ║
    ║  🔗  CONEXÃO:  QR CODE + CÓDIGO                            ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, device_id[:8]))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{ip}:{port}")
    print("🔑 GERAR CÓDIGO DE CONEXÃO: /api/connection/generate")
    print("📂 Arquivos salvos na pasta 'uploads/'\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True
    )