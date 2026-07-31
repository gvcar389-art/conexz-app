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
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'conexz-secret-key-production-2026')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent' if os.getenv('PRODUCTION') else 'threading')

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
        print(f"❌ Erro ao conectar ao Supabase: {e}")
else:
    print("⚠️ Supabase não configurado! Rodando com armazenamento local de sessão/fallback.")

# ==========================================
# CONFIGURAÇÕES DE ARQUIVO
# ==========================================

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # Limite de 1GB

# Banco de dados local (fallback em memória)
db = {'files': {}, 'shared_links': {}, 'users': {}}
device_id = secrets.token_hex(8)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def format_size(bytes_num):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_num < 1024:
            return f"{bytes_num:.1f} {unit}"
        bytes_num /= 1024
    return f"{bytes_num:.1f} TB"

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
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    username = data.get('username', '').strip()
    
    if not email or not password or not username:
        return jsonify({'error': 'Preencha todos os campos obrigatórios'}), 400
    
    if not supabase:
        if email in db['users']:
            return jsonify({'error': 'Email já cadastrado'}), 400
        db['users'][email] = {
            'username': username,
            'password': hashlib.sha256(password.encode()).hexdigest(),
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
            return jsonify({'error': 'Erro ao registrar usuário no provedor de autenticação'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login do usuário"""
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    
    if not email or not password:
        return jsonify({'error': 'Preencha todos os campos'}), 400
    
    if not supabase:
        if email not in db['users']:
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        user = db['users'][email]
        if user['password'] != hashlib.sha256(password.encode()).hexdigest():
            return jsonify({'error': 'Email ou senha incorretos'}), 401
        
        session['user_id'] = email
        session['user_email'] = email
        session['user_username'] = user['username']
        session.permanent = True
        return jsonify({
            'success': True,
            'message': 'Login realizado com sucesso!',
            'user': {'email': email, 'username': user['username']}
        })
    
    try:
        result = supabase.auth.sign_in_with_password({
            'email': email,
            'password': password
        })
        
        if result.user:
            username_meta = result.user.user_metadata.get('username') if result.user.user_metadata else None
            username = username_meta or email.split('@')[0]
            
            session['user_id'] = result.user.id
            session['user_email'] = result.user.email
            session['user_username'] = username
            session.permanent = True
            
            return jsonify({
                'success': True,
                'message': 'Login realizado com sucesso!',
                'user': {
                    'id': result.user.id,
                    'email': result.user.email,
                    'username': username
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
    return jsonify({'success': True, 'message': 'Logout realizado com sucesso'})

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
    """Verificar status da autenticação"""
    if 'user_id' in session:
        return jsonify({'authenticated': True, 'user_id': session['user_id']})
    return jsonify({'authenticated': False})

# ==========================================
# GERENCIAMENTO DE ARQUIVOS E BANCO
# ==========================================

def get_user_id():
    """Retorna o ID do usuário da sessão ou anônimo"""
    return session.get('user_id', 'anonymous')

def save_file_to_db(file_id, filename, file_path, file_size, user_id=None):
    """Salva dados do arquivo no Supabase ou localmente"""
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
        print(f"❌ Erro ao salvar registro no Supabase: {e}")
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
    """Retorna lista de arquivos do usuário"""
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
                'date': item.get('created_at', ''),
                'shared': item.get('shared', False)
            })
        return files
    except Exception as e:
        print(f"❌ Erro ao buscar lista no Supabase: {e}")
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
    """Encontra o caminho físico do arquivo"""
    if file_id in db['files']:
        return db['files'][file_id]['path']
    
    if supabase:
        try:
            result = supabase.table('files').select('file_path').eq('file_id', file_id).execute()
            if result.data:
                return result.data[0]['file_path']
        except Exception:
            pass
    
    files = glob.glob(os.path.join(UPLOAD_FOLDER, f"{file_id}_*"))
    if files:
        return files[0]
    
    return None

def delete_file_from_db(file_id):
    """Exclui o registro do arquivo"""
    if file_id in db['files']:
        del db['files'][file_id]
    
    if supabase:
        try:
            supabase.table('files').delete().eq('file_id', file_id).execute()
            return True
        except Exception:
            pass
    return False

# ==========================================
# COMPARTILHAMENTO
# ==========================================

@app.route('/api/share/<file_id>', methods=['POST'])
def share_file_user(file_id):
    """Compartilhar arquivo com outro usuário por e-mail"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login para compartilhar'}), 401
    
    data = request.get_json() or {}
    target_email = data.get('email', '').strip()
    
    if not target_email:
        return jsonify({'error': 'Email do destinatário é obrigatório'}), 400
    
    if not supabase:
        return jsonify({'error': 'Recurso de compartilhamento disponível com Supabase habilitado'}), 400
    
    try:
        result = supabase.auth.admin.list_users()
        target_user = None
        for user in result:
            if user.email == target_email:
                target_user = user
                break
        
        if not target_user:
            return jsonify({'error': 'Usuário de destino não encontrado'}), 404
        
        share_data = {
            'file_id': file_id,
            'from_user': session['user_id'],
            'to_user': target_user.id,
            'status': 'pending',
            'created_at': datetime.now().isoformat()
        }
        supabase.table('shares').insert(share_data).execute()
        
        return jsonify({
            'success': True,
            'message': f'Arquivo compartilhado com {target_email} com sucesso!'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/shared-files')
def get_shared_files():
    """Buscar arquivos compartilhados com a conta conectada"""
    if 'user_id' not in session:
        return jsonify({'error': 'Faça login para visualizar'}), 401
    
    if not supabase:
        return jsonify({'error': 'Recurso disponível apenas com Supabase'}), 400
    
    try:
        result = supabase.table('shares').select('*').eq('to_user', session['user_id']).execute()
        files = []
        for item in result.data:
            files.append({
                'file_id': item['file_id'],
                'from_user': item['from_user'],
                'status': item['status'],
                'created_at': item.get('created_at')
            })
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ==========================================
# ROTAS DA API DE MÍDIA E DISPOSITIVO
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
    """Gera QR Code dinâmico para conexão local ou servidor hospedado"""
    server_url = os.getenv('PUBLIC_URL', f"http://{get_local_ip()}:5001")
    
    qr = qrcode.QRCode(version=1, box_size=10, border=3)
    qr.add_data(server_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return jsonify({
        'qr': qr_base64,
        'url': server_url
    })

@app.route('/api/upload', methods=['POST'])
def upload():
    """Upload de arquivos e notificação via Socket.IO"""
    user_id = get_user_id()
    
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado na requisição'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nome do arquivo está vazio'}), 400
    
    filename = file.filename
    file_id = hashlib.md5(f"{filename}{time.time()}".encode()).hexdigest()
    file_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{filename}")
    
    try:
        file.save(file_path)
        size = os.path.getsize(file_path)
        
        save_file_to_db(file_id, filename, file_path, size, user_id)
        
        socketio.emit('new_file', {
            'id': file_id,
            'name': filename,
            'size': format_size(size),
            'user_id': user_id
        })
        
        return jsonify({
            'success': True,
            'id': file_id,
            'name': filename,
            'size': size,
            'size_formatted': format_size(size),
            'message': '✅ Arquivo enviado com sucesso!'
        })
    except Exception as e:
        return jsonify({'error': f'Falha ao salvar arquivo: {str(e)}'}), 500

@app.route('/api/files')
def list_files():
    """Lista todos os arquivos cadastrados do usuário atual"""
    user_id = get_user_id()
    files = get_files_from_db(user_id)
    return jsonify(files)

@app.route('/api/view/<file_id>')
def view_file(file_id):
    """Exibição inline de arquivos de áudio, vídeo ou imagens"""
    file_path = get_file_path(file_id)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não encontrado no servidor'}), 404
    
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    
    mimetypes = {
        'mp4': 'video/mp4', 'webm': 'video/webm', 'mkv': 'video/x-matroska',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'flac': 'audio/flac',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
        'pdf': 'application/pdf', 'txt': 'text/plain; charset=utf-8', 'json': 'application/json'
    }
    mimetype = mimetypes.get(ext, 'application/octet-stream')
    
    return send_file(file_path, mimetype=mimetype)

@app.route('/api/download/<file_id>')
def download_file(file_id):
    """Download forçado do arquivo selecionado"""
    file_path = get_file_path(file_id)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Arquivo não localizado para download'}), 404
    
    filename = os.path.basename(file_path)
    if '_' in filename:
        filename = filename.split('_', 1)[1]
    
    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename
    )

@app.route('/api/share-link/<file_id>')
def share_link(file_id):
    """Gera link temporário público para download sem necessidade de login"""
    file_path = get_file_path(file_id)
    if not file_path:
        return jsonify({'error': 'Arquivo inexistente'}), 404
    
    token = secrets.token_urlsafe(16)
    expires_at = time.time() + 86400  # Válido por 24 horas
    
    db['shared_links'][token] = {
        'file_id': file_id,
        'expires': expires_at
    }
    
    share_url = f"{request.host_url}api/s/{token}"
    return jsonify({
        'link': share_url,
        'expires': expires_at,
        'token': token
    })

@app.route('/api/s/<token>')
def shared_access(token):
    """Acesso ao link compartilhado por token"""
    if token not in db['shared_links']:
        return jsonify({'error': 'Link de acesso inválido ou revogado'}), 404
    
    link = db['shared_links'][token]
    if time.time() > link['expires']:
        del db['shared_links'][token]
        return jsonify({'error': 'Link temporário expirado'}), 410
    
    return download_file(link['file_id'])

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """Exclusão de arquivos com verificação de autoridade"""
    user_id = get_user_id()
    
    if supabase:
        try:
            result = supabase.table('files').select('user_id').eq('file_id', file_id).execute()
            if result.data and result.data[0]['user_id'] != user_id:
                return jsonify({'error': 'Sem permissão para remover este arquivo'}), 403
        except Exception:
            pass
    
    file_path = get_file_path(file_id)
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Erro ao remover arquivo físico: {e}")
    
    delete_file_from_db(file_id)
    socketio.emit('file_deleted', {'id': file_id})
    
    return jsonify({'success': True, 'message': '🗑️ Arquivo deletado com sucesso'})

@app.route('/api/status')
def status():
    """Verificação simples de status do servidor"""
    user_id = get_user_id()
    files = get_files_from_db(user_id)
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_local_ip(),
        'port': 5001,
        'files': len(files),
        'authenticated': 'user_id' in session
    })

@app.route('/api/status-completo')
def status_completo():
    """Estatísticas detalhadas de uso e tipos de arquivos"""
    now = datetime.now()
    user_id = get_user_id()
    files = get_files_from_db(user_id)
    
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
    client_device = request.args.get('device_id', 'desconhecido')
    emit('device_connected', {'device_id': client_device}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    client_device = request.args.get('device_id', 'desconhecido')
    emit('device_disconnected', {'device_id': client_device}, broadcast=True)

# ==========================================
# INICIAR SERVIDOR
# ==========================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    ip = get_local_ip()
    
    print("""
    ╔═══════════════════════════════════════════════════════════════╗
    ║   📱 CONEXZ - TRANSFERÊNCIA INTELIGENTE (PROFISSIONAL)       ║
    ╠═══════════════════════════════════════════════════════════════╣
    ║   🌐  LOCAL:    http://localhost:{}                           ║
    ║   📱  CELULAR:  http://{}:{}                                ║
    ║   📱  DISPOSITIVO ID: {}                                    ║
    ║   🔐  SEGURANÇA: Login com sessão isolada                      ║
    ╚═══════════════════════════════════════════════════════════════╝
    """.format(port, ip, port, device_id[:8]))
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True
    )
