from PIL import Image, ImageDraw, ImageFont
import os

print("🎨 GERANDO ÍCONE DO CONEXZ...")

# ==========================================
# 1. CRIAR O ÍCONE BASE (512x512)
# ==========================================

size = 512
icon = Image.new('RGB', (size, size), '#0a0a1a')
draw = ImageDraw.Draw(icon)

# Gradiente Azul -> Roxo
for i in range(size):
    r = int(0 + (108 * i / size))
    g = int(212 - (149 * i / size))
    b = int(255 - (156 * i / size))
    draw.rectangle([0, i, size, i+1], fill=(r, g, b))

# Bordas arredondadas
mask = Image.new('L', (size, size), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.rounded_rectangle([0, 0, size, size], radius=80, fill=255)
icon.putalpha(mask)

# Texto "CZ"
try:
    font = ImageFont.truetype("arial.ttf", 200)
except:
    font = ImageFont.load_default()

draw = ImageDraw.Draw(icon)
text = "CZ"
bbox = draw.textbbox((0, 0), text, font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]
x = (size - text_width) // 2
y = (size - text_height) // 2 - 30
draw.text((x, y), text, fill="white", font=font)

# Subtítulo
try:
    font_small = ImageFont.truetype("arial.ttf", 30)
except:
    font_small = ImageFont.load_default()
subtext = "CONEXZ"
bbox = draw.textbbox((0, 0), subtext, font=font_small)
text_width = bbox[2] - bbox[0]
x = (size - text_width) // 2
y = y + 180
draw.text((x, y), subtext, fill=(255,255,255,200), font=font_small)

# Salvar ícone base
icon.save('icon_512.png')
print('✅ Ícone base criado: icon_512.png')

# ==========================================
# 2. REDIMENSIONAR PARA TODOS OS TAMANHOS
# ==========================================

print('\n📐 GERANDO TODOS OS TAMANHOS...')

sizes = {
    'mipmap-hdpi': 72,
    'mipmap-mdpi': 48,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

for folder, size in sizes.items():
    path = f'android/app/src/main/res/{folder}'
    os.makedirs(path, exist_ok=True)
    
    # Redimensionar
    resized = icon.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(f'{path}/ic_launcher.png')
    resized.save(f'{path}/ic_launcher_round.png')
    print(f'✅ {folder}/ic_launcher.png ({size}x{size})')

# ==========================================
# 3. CRIAR O ARQUIVO XML ADAPTATIVO
# ==========================================

xml_path = 'android/app/src/main/res/mipmap-anydpi-v26'
os.makedirs(xml_path, exist_ok=True)

xml_content = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>'''

with open(f'{xml_path}/ic_launcher.xml', 'w') as f:
    f.write(xml_content)
print('✅ mipmap-anydpi-v26/ic_launcher.xml')

# ==========================================
# 4. CRIAR A COR DE FUNDO
# ==========================================

colors_path = 'android/app/src/main/res/values'
os.makedirs(colors_path, exist_ok=True)

colors_content = '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#00D4FF</color>
</resources>'''

with open(f'{colors_path}/colors.xml', 'w') as f:
    f.write(colors_content)
print('✅ values/colors.xml')

# ==========================================
# 5. COPIAR ÍCONE PARA A PASTA DO PROJETO
# ==========================================

print('\n🎉 TODOS OS ÍCONES FORAM GERADOS!')
print('\n📂 Ícones criados em:')
print('   - icon_512.png (raiz do projeto)')
print('   - android/app/src/main/res/mipmap-*/ic_launcher.png')
print('\n📱 Agora execute: flutter clean && flutter build apk --release')