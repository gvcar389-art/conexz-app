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
import glob
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
else:
    print("⚠️ Supabase não configurado!")

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
# FUNÇÕES DE ARMAZENAMENTO (COM SUPABASE)
# ==========================================

def save_file_to_supabase(file_id, filename, file_data, file_size):
    """Salva arquivo no Supabase Storage"""
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
        
        print(f"✅ Arquivo salvo no Supabase: {filename}")
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar no Supabase: {e}")
        return False

def get_files_from_supabase():
    """Busca arquivos do Supabase"""
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

def delete_file_from_supabase(file_id, filename):
    """Deleta arquivo do Supabase"""
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
    db['files'][file_id] = {
        'name': file.filename,
        'path': file_path,
        'size': size,
        'date': time.time()
    }
    
    # Salvar no Supabase
    file.seek(0)  # Voltar ao início do arquivo
    file_data = file.read()
    save_file_to_supabase(file_id, file.filename, file_data, size)
    
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
    # Buscar do Supabase primeiro
    files = get_files_from_supabase()
    
    # Se não tiver no Supabase, buscar localmente
    if not files:
        for file_id, info in db['files'].items():
            files.append({
                'id': file_id,
                'name': info['name'],
                'size': info['size'],
                'date': datetime.fromtimestamp(info['date']).isoformat(),
                'url': None
            })
    
    print(f"📂 {len(files)} arquivos encontrados")
    return jsonify(files)

@app.route('/api/view/<file_id>')
def view(file_id):
    """Visualizar arquivo (da nuvem ou local)"""
    # Tentar do Supabase
    if supabase:
        try:
            bucket = supabase.storage.from_('conexz-files')
            result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
            if result.data:
                filename = result.data[0]['filename']
                url = bucket.get_public_url(f"{file_id}_{filename}")
                return jsonify({'url': url})
        except:
            pass
    
    # Fallback local
    file_path = None
    if file_id in db['files']:
        file_path = db['files'][file_id]['path']
    else:
        files = glob.glob(f"uploads/{file_id}_*")
        if files:
            file_path = files[0]
    
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    return send_file(file_path)

@app.route('/api/download/<file_id>')
def download(file_id):
    """Baixar arquivo (da nuvem ou local)"""
    # Tentar do Supabase
    if supabase:
        try:
            result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
            if result.data:
                filename = result.data[0]['filename']
                bucket = supabase.storage.from_('conexz-files')
                url = bucket.get_public_url(f"{file_id}_{filename}")
                return jsonify({'download_url': url})
        except:
            pass
    
    # Fallback local
    file_path = None
    if file_id in db['files']:
        file_path = db['files'][file_id]['path']
    else:
        files = glob.glob(f"uploads/{file_id}_*")
        if files:
            file_path = files[0]
    
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    """Deletar arquivo"""
    # Deletar do Supabase
    if supabase:
        try:
            result = supabase.table('files').select('filename').eq('file_id', file_id).execute()
            if result.data:
                filename = result.data[0]['filename']
                delete_file_from_supabase(file_id, filename)
        except:
            pass
    
    # Deletar local
    if file_id in db['files']:
        file_path = db['files'][file_id]['path']
        if os.path.exists(file_path):
            os.remove(file_path)
        del db['files'][file_id]
    
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Arquivo deletado'})

@app.route('/api/status')
def status():
    files = get_files_from_supabase() or list(db['files'].values())
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
    ║   📱 CONEXZ - TRANSFERÊNCIA INTELIGENTE (NUVEM)            ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  ☁️  NUVEM:    {}                                            ║
    ║  💾  ARQUIVOS: SALVOS NA NUVEM (NUNCA SOMEM!)               ║
    ║  📂  HISTÓRICO: ACESSO A TODOS OS ARQUIVOS                  ║
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