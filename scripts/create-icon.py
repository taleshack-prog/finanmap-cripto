#!/usr/bin/env python3
"""Gera ícone PNG para o FinanMap Cripto"""

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

import subprocess
import os

def create_icon_with_imagemagick():
    """Cria ícone usando ImageMagick (disponível na maioria dos Linux)"""
    output = os.path.expanduser("~/Downloads/finanmap-cripto/scripts/finanmap-icon.png")
    
    cmd = [
        "convert",
        "-size", "256x256",
        "xc:#0a0020",
        "-fill", "#7c3aff",
        "-draw", "roundrectangle 10,10 246,246 20,20",
        "-fill", "#0a0020",
        "-draw", "roundrectangle 14,14 242,242 18,18",
        # F
        "-fill", "#00d4ff",
        "-font", "DejaVu-Sans-Bold",
        "-pointsize", "120",
        "-gravity", "Center",
        "-annotate", "0", "F",
        # Borda neon
        "-fill", "none",
        "-stroke", "#7c3aff",
        "-strokewidth", "3",
        "-draw", "roundrectangle 10,10 246,246 20,20",
        output
    ]
    
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode == 0:
        print(f"✓ Ícone criado: {output}")
        return True
    return False

def create_icon_with_python():
    """Cria ícone usando PIL/Pillow"""
    output = os.path.expanduser("~/Downloads/finanmap-cripto/scripts/finanmap-icon.png")
    
    size = 256
    img = Image.new('RGB', (size, size), color='#0a0020')
    draw = ImageDraw.Draw(img)
    
    # Fundo com gradiente simulado
    for i in range(size):
        alpha = i / size
        r = int(10 + alpha * 20)
        g = int(0 + alpha * 5)
        b = int(32 + alpha * 20)
        draw.line([(0, i), (size, i)], fill=(r, g, b))
    
    # Borda roxa
    draw.rounded_rectangle([8, 8, size-8, size-8], radius=20, outline='#7c3aff', width=3)
    
    # Letra F em ciano
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 140)
    except:
        font = ImageFont.load_default()
    
    draw.text((size//2, size//2), "F", fill='#00d4ff', font=font, anchor='mm')
    
    # Ponto decorativo
    draw.ellipse([size//2-5, size-50, size//2+5, size-40], fill='#00d4ff')
    
    img.save(output)
    print(f"✓ Ícone criado: {output}")
    return True

if __name__ == "__main__":
    print("Gerando ícone FinanMap Cripto...")
    
    if PIL_AVAILABLE:
        create_icon_with_python()
    elif not create_icon_with_imagemagick():
        # Fallback: copia um ícone genérico
        print("PIL e ImageMagick não disponíveis — usando ícone padrão")
        subprocess.run([
            "cp",
            "/usr/share/icons/hicolor/256x256/apps/firefox.png",
            os.path.expanduser("~/Downloads/finanmap-cripto/scripts/finanmap-icon.png")
        ])
