import os
from PIL import Image, ImageDraw

def create_icon():
    os.makedirs('assets', exist_ok=True)
    size = 512
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Minimal glass book mark with Lirune's charcoal and off-white brand palette.
    margin = 52
    draw.rounded_rectangle([margin, margin, size - margin, size - margin], radius=104,
                           fill=(32, 33, 36, 255), outline=(248, 248, 245, 110), width=5)
    draw.rounded_rectangle([122, 96, 390, 394], radius=32,
                           fill=(43, 45, 49, 255), outline=(248, 248, 245, 180), width=6)
    draw.polygon([(104, 116), (294, 116), (294, 372), (199, 326), (104, 372)],
                 fill=(35, 37, 41, 255), outline=(248, 248, 245, 220))
    draw.polygon([(244, 116), (294, 116), (294, 372), (269, 359), (244, 372)],
                 fill=(248, 248, 245, 255))
    draw.line([(148, 170), (246, 170)], fill=(248, 248, 245, 230), width=8)
    draw.line([(148, 210), (246, 210)], fill=(224, 224, 219, 210), width=7)
    draw.line([(148, 250), (220, 250)], fill=(200, 200, 195, 190), width=7)

    # Save PNG
    png_path = os.path.join('assets', 'icon.png')
    img.save(png_path, 'PNG')
    print(f"Saved PNG to {png_path}")

    # Generate multi-size ICO
    ico_path = os.path.join('assets', 'icon.ico')
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256), (512, 512)]
    img.save(ico_path, format='ICO', sizes=sizes)
    print(f"Saved multi-resolution ICO to {ico_path}")

def create_store_logos():
    """Create Microsoft Store required logos: 1080x1080 and 2160x2160"""
    os.makedirs('assets', exist_ok=True)
    
    for target_size in [1080, 2160]:
        img = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        scale = target_size / 512
        margin = int(52 * scale)
        radius = int(104 * scale)
        
        # Outer rounded rectangle
        draw.rounded_rectangle([margin, margin, target_size - margin, target_size - margin], radius=radius,
                               fill=(32, 33, 36, 255), outline=(248, 248, 245, 110), width=int(5 * scale))
        
        # Inner book shape
        inner_margin_left = int(122 * scale)
        inner_margin_top = int(96 * scale)
        inner_right = int(390 * scale)
        inner_bottom = int(394 * scale)
        inner_radius = int(32 * scale)
        draw.rounded_rectangle([inner_margin_left, inner_margin_top, inner_right, inner_bottom], radius=inner_radius,
                               fill=(43, 45, 49, 255), outline=(248, 248, 245, 180), width=int(6 * scale))
        
        # Book pages
        page_points = [
            (int(104 * scale), int(116 * scale)),
            (int(294 * scale), int(116 * scale)),
            (int(294 * scale), int(372 * scale)),
            (int(199 * scale), int(326 * scale)),
            (int(104 * scale), int(372 * scale))
        ]
        draw.polygon(page_points,
                     fill=(35, 37, 41, 255), outline=(248, 248, 245, 220))
        
        # Highlight page
        highlight_points = [
            (int(244 * scale), int(116 * scale)),
            (int(294 * scale), int(116 * scale)),
            (int(294 * scale), int(372 * scale)),
            (int(269 * scale), int(359 * scale)),
            (int(244 * scale), int(372 * scale))
        ]
        draw.polygon(highlight_points,
                     fill=(248, 248, 245, 255))
        
        # Text lines
        line1 = [(int(148 * scale), int(170 * scale)), (int(246 * scale), int(170 * scale))]
        line2 = [(int(148 * scale), int(210 * scale)), (int(246 * scale), int(210 * scale))]
        line3 = [(int(148 * scale), int(250 * scale)), (int(220 * scale), int(250 * scale))]
        draw.line(line1, fill=(248, 248, 245, 230), width=int(8 * scale))
        draw.line(line2, fill=(224, 224, 219, 210), width=int(7 * scale))
        draw.line(line3, fill=(200, 200, 195, 190), width=int(7 * scale))
        
        # Save store logo
        filename = f'StoreLogo_{target_size}x{target_size}.png'
        filepath = os.path.join('assets', filename)
        img.save(filepath, 'PNG')
        print(f"Saved Store logo to {filepath}")

if __name__ == '__main__':
    create_icon()
    create_store_logos()
