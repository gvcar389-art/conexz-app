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

app = Flask(__name__)
app.config['SECRET_KEY'] = 'conexz-secret'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Criar pasta de uploads
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB

# Banco de dados simples
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/device')
def device():
    return jsonify({'id': device_id, 'ip': get_ip(), 'port': 5001})

@app.route('/api/qr')
def qr():
    try:
        import qrcode
        import io
        import base64
        import json
        
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
        return jsonify({
            'error': str(e),
            'qr': None,
            'url': f"http://{get_ip()}:5001"
        }), 500

@app.route('/api/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nome vazio'}), 400
    
    file_id = hashlib.md5(file.filename.encode() + str(time.time()).encode()).hexdigest()
    path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
    file.save(path)
    size = os.path.getsize(path)
    
    db['files'][file_id] = {
        'name': file.filename,
        'path': path,
        'size': size,
        'date': time.time()
    }
    
    socketio.emit('new_file', {'id': file_id, 'name': file.filename})
    
    return jsonify({'id': file_id, 'name': file.filename, 'message': '✅ Enviado!'})

@app.route('/api/files')
def files():
    result = []
    for fid, info in db['files'].items():
        result.append({
            'id': fid,
            'name': info['name'],
            'size': info['size'],
            'date': info['date']
        })
    return jsonify(result)

@app.route('/api/view/<file_id>')
def view(file_id):
    if file_id not in db['files']:
        return jsonify({'error': 'Não encontrado'}), 404
    return send_file(db['files'][file_id]['path'])

@app.route('/api/download/<file_id>')
def download(file_id):
    if file_id not in db['files']:
        return jsonify({'error': 'Não encontrado'}), 404
    info = db['files'][file_id]
    return send_file(info['path'], as_attachment=True, download_name=info['name'])

@app.route('/api/share/<file_id>')
def share(file_id):
    if file_id not in db['files']:
        return jsonify({'error': 'Não encontrado'}), 404
    token = secrets.token_urlsafe(12)
    return jsonify({'link': f"{request.host_url}api/s/{token}", 'expires': int(time.time()) + 86400})

@app.route('/api/s/<token>')
def shared(token):
    for fid in db['files']:
        return download(fid)
    return jsonify({'error': 'Nenhum arquivo'}), 404

@app.route('/api/delete/<file_id>', methods=['DELETE'])
def delete(file_id):
    if file_id not in db['files']:
        return jsonify({'error': 'Não encontrado'}), 404
    info = db['files'][file_id]
    if os.path.exists(info['path']):
        os.remove(info['path'])
    del db['files'][file_id]
    socketio.emit('file_deleted', {'id': file_id})
    return jsonify({'message': '🗑️ Deletado'})

@app.route('/api/status')
def status():
    return jsonify({
        'status': 'online',
        'device': device_id,
        'ip': get_ip(),
        'files': len(db['files'])
    })

@app.route('/manifest.json')
def manifest():
    return send_file('static/manifest.json', mimetype='application/json')

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    
    print("""
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║   📱 CONEXZ - Transferência Inteligente          ║
    ║                                                   ║
    ╠═══════════════════════════════════════════════════╣
    ║                                                   ║
    ║  🌐  LOCAL:    http://localhost:5001             ║
    ║  📱  CELULAR:  http://{}:5001      ║
    ║                                                   ║
    ║  🎬  Player de Vídeo: ✅ ATIVADO                 ║
    ║  🎵  Player de Áudio: ✅ ATIVADO                 ║
    ║  🔗  QR Code:    /api/qr                        ║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
    """.format(get_ip()))
    
    print(f"\n📱 NO CELULAR DIGITE: http://{get_ip()}:5001\n")
    
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True
    )