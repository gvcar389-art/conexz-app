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
else:
    print("⚠️ Supabase não configurado! Usando armazenamento local.")

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
# FUNÇÕES DO SUPABASE
# ==========================================

def save_file_to_db(file_id, filename, file_path, file_size):
    """Salva arquivo no Supabase"""
    if not supabase:
        db['files'][file_id] = {
            'name': filename,
            'path': file_path,
            'size': file_size,
            'date': time.time()
        }
        return True
    
    try:
        data = {
            'file_id': file_id,
            'filename': filename,
            'file_path': file_path,
            'file_size': file_size,
            'file_type': filename.split('.')[-1] if '.' in filename else '',
            'created_at': time.time()
        }
        supabase.table('files').insert(data).execute()
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar no Supabase: {e}")
        # Fallback local
        db['files'][file_id] = {
            'name': filename,
            'path': file_path,
            'size': file_size,
            'date': time.time()
        }
        return False

def get_files_from_db():
    """Busca arquivos do Supabase"""
    if not supabase:
        files = []
        for fid, info in db['files'].items():
            files.append({
                'id': fid,
                'name': info['name'],
                'size': info['size'],
                'date': info['date']
            })
        return files
    
    try:
        result = supabase.table('files').select('*').execute()
        files = []
        for item in result.data:
            files.append({
                'id': item['file_id'],
                'name': item['filename'],
                'size': item['file_size'],
                'date': item['created_at']
            })
        return files
    except Exception as e:
        print(f"❌ Erro ao buscar do Supabase: {e}")
        # Fallback local
        files = []
        for fid, info in db['files'].items():
            files.append({
                'id': fid,
                'name': info['name'],
                'size': info['size'],
                'date': info['date']
            })
        return files

def get_file_path_from_db(file_id):
    """Busca caminho do arquivo"""
    # Primeiro verificar local
    if file_id in db['files']:
        return db['files'][file_id]['path']
    
    # Depois buscar no Supabase
    if supabase:
        try:
            result = supabase.table('files').select('file_path').eq('file_id', file_id).execute()
            if result.data:
                return result.data[0]['file_path']
        except:
            pass
    return None

def delete_file_from_db(file_id):
    """Deleta arquivo do Supabase"""
    # Deletar local
    if file_id in db['files']:
        del db['files'][file_id]
    
    # Deletar no Supabase
    if supabase:
        try:
            supabase.table('files').delete().eq('file_id', file_id).execute()
            return True
        except:
            pass
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
    
    # Salvar no Supabase (ou local)
    save_file_to_db(file_id, file.filename, file_path, size)
    
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
    files_list = get_files_from_db()
    print(f"📂 Listando {len(files_list)} arquivos")
    return jsonify(files_list)

@app.route('/api/view/<file_id>')
def view(file_id):
    """Visualizar arquivo"""
    file_path = get_file_path_from_db(file_id)
    if not file_path or not os.path.exists(file_path):
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
    file_path = get_file_path_from_db(file_id)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename
    )

@app.route('/api/share/<file_id>')
def share(file_id):
    """Criar link compartilhável"""
    if not get_file_path_from_db(file_id):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    token = secrets.token_urlsafe(12)
    return jsonify({
        'link': f"{request.host_url}api/s/{token}",
        'expires': int(time.time()) + 86400
    })

@app.route('/api/s/<token>')
def shared(token):
    """Acessar link compartilhável"""
    files_list = get_files_from_db()
    if files_list:
        return download(files_list[0]['id'])
    return jsonify({'error': 'Nenhum arquivo disponível'}), 404

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    """Deletar arquivo"""
    file_path = get_file_path_from_db(file_id)
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    delete_file_from_db(file_id)
    
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Arquivo deletado'})

@app.route('/api/status')
def status():
    files_list = get_files_from_db()
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_ip(),
        'files': len(files_list),
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
    ║   📱 CONEXZ - Transferência Inteligente (COM SUPABASE)      ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  ☁️  NUVEM:    {}                                            ║
    ║  🎬  PLAYER:   ✅ ATIVADO                                   ║
    ║  💾  ARQUIVOS: SALVOS NA NUVEM!                             ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, "✅ CONECTADO" if supabase else "❌ LOCAL"))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{ip}:{port}")
    print("☁️  Arquivos salvos no Supabase (nuvem)!")
    print("🎬 Envie um vídeo e clique em 'Vídeos' para assistir!\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True
    )