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
        print(f"❌ Erro ao conectar: {e}")
else:
    print("⚠️ Supabase não configurado!")

# ==========================================
# CONFIGURAÇÕES
# ==========================================

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB

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
            'file_type': filename.split('.')[-1] if '.' in filename else ''
        }
        supabase.table('files').insert(data).execute()
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar: {e}")
        return False

def get_files_from_db():
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
        print(f"❌ Erro ao buscar: {e}")
        return []

def get_file_path_from_db(file_id):
    if not supabase:
        if file_id in db['files']:
            return db['files'][file_id]['path']
        return None
    
    try:
        result = supabase.table('files').select('file_path').eq('file_id', file_id).execute()
        if result.data:
            return result.data[0]['file_path']
        return None
    except:
        return None

def delete_file_from_db(file_id):
    if not supabase:
        if file_id in db['files']:
            del db['files'][file_id]
            return True
        return False
    
    try:
        supabase.table('files').delete().eq('file_id', file_id).execute()
        return True
    except:
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
    
    file_id = hashlib.md5(file.filename.encode() + str(time.time()).encode()).hexdigest()
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(file_path)
    size = os.path.getsize(file_path)
    
    save_file_to_db(file_id, file.filename, file_path, size)
    
    socketio.emit('new_file', {'id': file_id, 'name': file.filename})
    
    return jsonify({'id': file_id, 'name': file.filename, 'message': '✅ Enviado!'})

@app.route('/api/files')
def files():
    return jsonify(get_files_from_db())

@app.route('/api/view/<file_id>')
def view(file_id):
    file_path = get_file_path_from_db(file_id)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Não encontrado'}), 404
    return send_file(file_path)

@app.route('/api/download/<file_id>')
def download(file_id):
    file_path = get_file_path_from_db(file_id)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Não encontrado'}), 404
    filename = file_path.split('_', 1)[1] if '_' in file_path else file_path
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.route('/api/share/<file_id>')
def share(file_id):
    token = secrets.token_urlsafe(12)
    return jsonify({'link': f"{request.host_url}api/s/{token}", 'expires': int(time.time()) + 86400})

@app.route('/api/s/<token>')
def shared(token):
    files_list = get_files_from_db()
    if files_list:
        return download(files_list[0]['id'])
    return jsonify({'error': 'Nenhum arquivo'}), 404

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    file_path = get_file_path_from_db(file_id)
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    delete_file_from_db(file_id)
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Deletado'})

@app.route('/api/status')
def status():
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_ip(),
        'files': len(get_files_from_db()),
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
    
    print("""
    ╔═══════════════════════════════════════════════════╗
    ║   📱 CONEXZ - Transferência Inteligente          ║
    ╠═══════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:5001             ║
    ║  📱  CELULAR:  http://{}:5001      ║
    ║  ☁️  NUVEM:    {}                  ║
    ║  🎬  Player:   ✅ ATIVADO                       ║
    ╚═══════════════════════════════════════════════════╝
    """.format(get_ip(), "✅ CONECTADO" if supabase else "❌ LOCAL"))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{get_ip()}:5001\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True
    )