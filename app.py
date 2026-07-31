from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, session
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
from datetime import datetime, timedelta
import glob
from supabase import create_client, Client
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'conexz-secret')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
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

# Banco de dados local (fallback)
db = {'files': {}, 'shared_links': {}, 'users': {}}
device_id = secrets.token_hex(8)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def format_size(bytes):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
    return f"{bytes:.1f} TB"

# ==========================================
# ROTAS DO PWA
# ==========================================

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory('static', 'sw.js')

# ==========================================
# AUTENTICAÇÃO
# ==========================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registrar novo usuário"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    username = data.get('username')
    
    if not email or not password or not username:
        return jsonify({'error': 'Preencha todos os campos'}), 400
    
    if not supabase:
        # Fallback local
        if email in db['users']:
            return jsonify({'error': 'Email já cadastrado'}), 400
        db['users'][email] = {
            'username': username,
            'password': hashlib.md5(password.encode()).hexdigest(),
            'created_at': time.time()
        }
        return jsonify({
            'success': True,
            'message': 'Usuário criado com sucesso!',
            'user': {'email': email, 'username': username}
        })
    
    try:
        result = supabase.auth.sign_up({
            'email': email,
            'password': password,
            'options': {
                'data': {
                    'username': username,
                    'full_name': username
                }
            }
        })
        
        if result.user:
            return jsonify({
                'success': True,
                'message': 'Usuário criado com sucesso!',
                'user': {
                    'id': result.user.id,
                    'email': result.user.email,
                    'username': username
                }
            })
        else:
            return jsonify({'error': 'Erro ao criar usuário'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login do usuário"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Preencha todos os campos'}), 400
    
    if not supabase:
        # Fallback local
        if email not in db['users']:
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        user = db['users'][email]
        if user['password'] != hashlib.md5(password.encode()).hexdigest():
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        session['user_id'] = email
        session['user_email'] = email
        session['user_username'] = user['username']
        session.permanent = True
        return jsonify({
            'success': True,
            'message': 'Login realizado!',
            'user': {'email': email, 'username': user['username']}
        })
    
    try:
        result = supabase.auth.sign_in_with_password({
            'email': email,
            'password': password
        })
        
        if result.user:
            session['user_id'] = result.user.id
            session['user_email'] = result.user.email
            session['user_username'] = result.user.user_metadata.get('username', 'Usuário')
            session.permanent = True
            
            return jsonify({
                'success': True,
                'message': 'Login realizado com sucesso!',
                'user': {
                    'id': result.user.id,
                    'email': result.user.email,
                    'username': result.user.user_metadata.get('username', 'Usuário')
                }
            })
        else:
            return jsonify({'error': 'Email ou senha incorretos'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout do usuário"""
    session.clear()
    return jsonify({'success': True, 'message': 'Logout realizado'})

@app.route('/api/auth/user')
def get_user():
    """Buscar usuário atual"""
    if 'user_id' in session:
        return jsonify({
            'id': session['user_id'],
            'email': session.get('user_email'),
            'username': session.get('user_username', 'Usuário'),
            'authenticated': True
        })
    return jsonify({'authenticated': False}), 401

@app.route('/api/auth/check')
def check_auth():
    """Verificar se o usuário está autenticado"""
    if 'user_id' in session:
        return jsonify({'authenticated': True, 'user_id': session['user_id']})
    return jsonify({'authenticated': False})

# ==========================================
# ARQUIVOS POR USUÁRIO
# ==========================================

def get_user_id():
    """Pega o ID do usuário atual"""
    if 'user_id' in session:
        return session['user_id']
    return 'anonymous'

def save_file_to_db(file_id, filename, file_path, file_size, user_id=None):
    """Salva arquivo no Supabase ou local"""
    if not user_id:
        user_id = get_user_id()
    
    if not supabase:
        db['files'][file_id] = {
            'id': file_id,
            'name': filename,
            'path': file_path,
            'size': file_size,
            'size_formatted': format_size(file_size),
            'date': time.time(),
            'date_formatted': datetime.now().strftime('%d/%m/%Y %H:%M'),
            'user_id': user_id,
            'shared': False
        }
        return True
    
    try:
        data = {
            'file_id': file_id,
            'filename': filename,
            'file_path': file_path,
            'file_size': file_size,
            'user_id': user_id,
            'shared': False,
            'created_at': datetime.now().isoformat()
        }
        supabase.table('files').insert(data).execute()
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar: {e}")
        # Fallback local
        db['files'][file_id] = {
            'id': file_id,
            'name': filename,
            'path': file_path,
            'size': file_size,
            'size_formatted': format_size(file_size),
            'date': time.time(),
            'date_formatted': datetime.now().strftime('%d/%m/%Y %H:%M'),
            'user_id': user_id,
            'shared': False
        }
        return False

def get_files_from_db(user_id=None):
    """Busca arquivos do Supabase ou local"""
    if not user_id:
        user_id = get_user_id()
    
    if not supabase:
        files = []
        for file_id, info in db['files'].items():
            if info.get('user_id') == user_id:
                files.append({
                    'id': file_id,
                    'name': info['name'],
                    'size': info['size'],
                    'size_formatted': info['size_formatted'],
                    'date': info['date_formatted'],
                    'shared': info.get('shared', False)
                })
        return files
    
    try:
        result = supabase.table('files').select('*').eq('user_id', user_id).execute()
        files = []
        for item in result.data:
            files.append({
                'id': item['file_id'],
                'name': item['filename'],
                'size': item['file_size'],
                'size_formatted': format_size(item['file_size']),
                'date': item['created_at'],
                'shared': item.get('shared', False)
            })
        return files
    except Exception as e:
        print(f"❌ Erro ao buscar: {e}")
        # Fallback local
        files = []
        for file_id, info in db['files'].items():
            if info.get('user_id') == user_id:
                files.append({
                    'id': file_id,
                    'name': info['name'],
                    'size': info['size'],
                    'size_formatted': info['size_formatted'],
                    'date': info['date_formatted'],
                    'shared': info.get('shared', False)
                })
        return files

def get_file_path(file_id):
    """Busca caminho do arquivo"""
    if file_id in db['files']:
        return db['files'][file_id]['path']
    
    if supabase:
        try:
            result = supabase.table('files').select('file_path').eq('file_id', file_id).execute()
            if result.data:
                return result.data[0]['file_path']
        except:
            pass
    
    # Buscar na pasta uploads
    files = glob.glob(f"uploads/{file_id}_*")
    if files:
        return files[0]
    
    return None

def delete_file_from_db(file_id):
    """Deleta arquivo do Supabase ou local"""
    if file_id in db['files']:
        del db['files'][file_id]
    
    if supabase:
        try:
            supabase.table('files').delete().eq('file_id', file_id).execute()
            return True
        except:
            pass
    return False

def get_file_owner(file_id):
    """Pega o dono do arquivo"""
    if file_id in db['files']:
        return db['files'][file_id].get('user_id')
    
    if supabase:
        try:
            result = supabase.table('files').select('user_id').eq('file_id', file_id).execute()
            if result.data:
                return result.data[0]['user_id']
        except:
            pass
    return None

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
    """Gera QR Code com a URL pública do Render"""
    url = "https://conexz-app.onrender.com"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return jsonify({
        'qr': qr_base64,
        'url': url
    })

@app.route('/api/upload', methods=['POST'])
def upload():
    """Upload de arquivo para o usuário"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    user_id = session['user_id']
    
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nome vazio'}), 400
    
    file_id = hashlib.md5(file.filename.encode() + str(time.time()).encode()).hexdigest()
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(file_path)
    size = os.path.getsize(file_path)
    
    save_file_to_db(file_id, file.filename, file_path, size, user_id)
    
    socketio.emit('new_file', {
        'id': file_id,
        'name': file.filename,
        'size': format_size(size),
        'user_id': user_id
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
    """Listar arquivos do usuário"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    user_id = session['user_id']
    files = get_files_from_db(user_id)
    return jsonify(files)

@app.route('/api/view/<file_id>')
def view_file(file_id):
    """Visualizar arquivo"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    file_path = get_file_path(file_id)
    if not file_path:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado no servidor'}), 404
    
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
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'json': 'application/json',
        'zip': 'application/zip'
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')
    
    return send_file(file_path, mimetype=mimetype)

@app.route('/api/download/<file_id>')
def download_file(file_id):
    """Baixar arquivo"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    file_path = get_file_path(file_id)
    if not file_path:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado no servidor'}), 404
    
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename
    )

@app.route('/api/share-link/<file_id>')
def share_file(file_id):
    """Criar link compartilhável"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    if not get_file_path(file_id):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    token = secrets.token_urlsafe(12)
    share_url = f"{request.host_url}api/s/{token}"
    
    db['shared_links'][token] = {
        'file_id': file_id,
        'expires': time.time() + 86400  # 24 horas
    }
    
    return jsonify({
        'link': share_url,
        'expires': time.time() + 86400,
        'token': token
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
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login primeiro'}), 401
    
    user_id = session['user_id']
    
    # Verificar se o arquivo pertence ao usuário
    owner = get_file_owner(file_id)
    if owner and owner != user_id:
        return jsonify({'error': 'Você não tem permissão para deletar este arquivo'}), 403
    
    file_path = get_file_path(file_id)
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    delete_file_from_db(file_id)
    
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Arquivo deletado'})

@app.route('/api/status')
def status():
    """Status do servidor"""
    if 'user_id' in session:
        user_id = session['user_id']
        files = get_files_from_db(user_id)
        return jsonify({
            'status': 'online',
            'device': device_id,
            'ip': get_local_ip(),
            'port': 5001,
            'files': len(files),
            'authenticated': True
        })
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_local_ip(),
        'port': 5001,
        'authenticated': False
    })

@app.route('/api/status-completo')
def status_completo():
    """Status completo com IP, hora e contagem de arquivos"""
    now = datetime.now()
    
    if 'user_id' in session:
        user_id = session['user_id']
        files = get_files_from_db(user_id)
    else:
        files = []
    
    videos = 0
    musicas = 0
    imagens = 0
    documentos = 0
    
    for file in files:
        name = file['name'].lower()
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
        'arquivos': len(files),
        'videos': videos,
        'musicas': musicas,
        'imagens': imagens,
        'documentos': documentos,
        'status': 'online',
        'authenticated': 'user_id' in session
    })

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
    ║   📱 CONEXZ - TRANSFERÊNCIA INTELIGENTE (PROFISSIONAL)      ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║  🌐  LOCAL:    http://localhost:{}                           ║
    ║  📱  CELULAR:  http://{}:{}                ║
    ║  📱  DISPOSITIVO: {}                                     ║
    ║  🔐  SEGURANÇA: Login com email                            ║
    ║  💾  ARQUIVOS: Por usuário                                  ║
    ║  📷  QR CODE:  https://conexz-app.onrender.com              ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, device_id[:8]))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{ip}:{port}")
    print("🔐 Faça login para acessar seus arquivos")
    print("📷 QR Code: https://conexz-app.onrender.com\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True
    )
