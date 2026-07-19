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
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

# Carregar variáveis de ambiente
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'conexz-secret'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ==========================================
# CONFIGURAR SUPABASE
# ==========================================

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Conectado ao Supabase!")
    except Exception as e:
        print(f"❌ Erro ao conectar Supabase: {e}")

# ==========================================
# CONFIGURAÇÕES
# ==========================================

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB

# Armazenamento local (fallback)
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
# FUNÇÕES DO SUPABASE STORAGE
# ==========================================

def save_file_to_storage(file_id, filename, file_data, file_size):
    """Salva arquivo no Supabase Storage (nuvem)"""
    if not supabase:
        return False
    
    try:
        # Salvar no Storage
        bucket = supabase.storage.from_('conexz-files')
        bucket.upload(f"{file_id}_{filename}", file_data)
        
        # Salvar metadados na tabela
        data = {
            'file_id': file_id,
            'filename': filename,
            'file_size': file_size,
            'file_type': filename.split('.')[-1] if '.' in filename else '',
            'created_at': datetime.now().isoformat()
        }
        supabase.table('files').insert(data).execute()
        
        print(f"✅ Arquivo salvo na nuvem: {filename}")
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar na nuvem: {e}")
        return False

def get_files_from_storage():
    """Busca arquivos do Supabase Storage"""
    if not supabase:
        return []
    
    try:
        # Buscar metadados
        result = supabase.table('files').select('*').order('created_at', desc=True).execute()
        
        files = []
        for item in result.data:
            # Gerar URL pública
            try:
                bucket = supabase.storage.from_('conexz-files')
                url = bucket.get_public_url(f"{item['file_id']}_{item['filename']}")
            except:
                url = None
            
            files.append({
                'id': item['file_id'],
                'name': item['filename'],
                'size': item['file_size'],
                'date': item['created_at'],
                'url': url
            })
        return files
    except Exception as e:
        print(f"❌ Erro ao buscar arquivos: {e}")
        return []

def delete_file_from_storage(file_id, filename):
    """Deleta arquivo do Supabase Storage"""
    if not supabase:
        return False
    
    try:
        # Deletar do Storage
        bucket = supabase.storage.from_('conexz-files')
        bucket.remove([f"{file_id}_{filename}"])
        
        # Deletar metadados
        supabase.table('files').delete().eq('file_id', file_id).execute()
        return True
    except Exception as e:
        print(f"❌ Erro ao deletar: {e}")
        return False

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
    
    # Salvar localmente (fallback)
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(file_path)
    size = os.path.getsize(file_path)
    
    # Salvar na nuvem (Supabase Storage)
    file.seek(0)  # Voltar ao início do arquivo
    file_data = file.read()
    save_file_to_storage(file_id, file.filename, file_data, size)
    
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
    # Buscar da nuvem
    files = get_files_from_storage()
    print(f"📂 {len(files)} arquivos na nuvem")
    return jsonify(files)

@app.route('/api/view/<file_id>')
def view(file_id):
    """Visualizar arquivo (da nuvem)"""
    if not supabase:
        return jsonify({'error': 'Nuvem não disponível'}), 500
    
    try:
        # Buscar nome do arquivo
        result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
        if not result.data:
            return jsonify({'error': 'Arquivo não encontrado'}), 404
        
        filename = result.data[0]['filename']
        bucket = supabase.storage.from_('conexz-files')
        url = bucket.get_public_url(f"{file_id}_{filename}")
        
        # Redirecionar para a URL pública
        return jsonify({'url': url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<file_id>')
def download(file_id):
    """Baixar arquivo (da nuvem)"""
    if not supabase:
        return jsonify({'error': 'Nuvem não disponível'}), 500
    
    try:
        # Buscar nome do arquivo
        result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
        if not result.data:
            return jsonify({'error': 'Arquivo não encontrado'}), 404
        
        filename = result.data[0]['filename']
        bucket = supabase.storage.from_('conexz-files')
        url = bucket.get_public_url(f"{file_id}_{filename}")
        
        return jsonify({'download_url': url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    """Deletar arquivo"""
    if not supabase:
        return jsonify({'error': 'Nuvem não disponível'}), 500
    
    try:
        # Buscar nome do arquivo
        result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
        if result.data:
            filename = result.data[0]['filename']
            delete_file_from_storage(file_id, filename)
        
        socketio.emit('file_deleted', {'id': file_id})
        return jsonify({'message': '🗑️ Arquivo deletado'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/status')
def status():
    files = get_files_from_storage()
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_ip(),
        'files': len(files),
        'cloud': supabase is not None
    })

@app.route('/manifest.json')
def manifest():
    return send_file('static/manifest.json', mimetype='application/json')

# ==========================================
# INICIAR SERVIDOR
# ==========================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    ip = get_ip()
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║   📱 CONEXZ - SALVANDO ARQUIVOS NA NUVEM!                   ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  ☁️  NUVEM:    {}                                            ║
    ║  💾  ARQUIVOS: SALVOS NA NUVEM (NUNCA SOMEM!)               ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, "✅ CONECTADO" if supabase else "❌ LOCAL"))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{ip}:{port}")
    print("☁️  ARQUIVOS SALVOS NA NUVEM - NUNCA SOMEM!\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True
    )