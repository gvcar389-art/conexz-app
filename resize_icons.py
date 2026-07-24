from PIL import Image
import os

# Carregar o ícone
icon = Image.open('icon_512.png')

# Tamanhos necessários
sizes = {
    'mipmap-hdpi': 72,
    'mipmap-mdpi': 48,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# Criar pasta se não existir
os.makedirs('android/app/src/main/res', exist_ok=True)

# Gerar cada tamanho
for folder, size in sizes.items():
    path = f'android/app/src/main/res/{folder}'
    os.makedirs(path, exist_ok=True)
    
    resized = icon.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(f'{path}/ic_launcher.png')
    print(f'✅ {folder}/ic_launcher.png ({size}x{size})')