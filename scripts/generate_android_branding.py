import os
from PIL import Image, ImageDraw

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    source_icon_path = os.path.join(root, 'assets', 'icon.png')
    if not os.path.exists(source_icon_path):
        raise FileNotFoundError(f"Source icon not found at {source_icon_path}")

    base_icon = Image.open(source_icon_path).convert('RGBA')
    print(f"Loaded source icon: {base_icon.size}")

    mobile_assets = os.path.join(root, 'mobile', 'assets')
    os.makedirs(mobile_assets, exist_ok=True)

    # 1. mobile/assets/icon.png (512x512)
    icon_512 = base_icon.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save(os.path.join(mobile_assets, 'icon.png'), 'PNG')

    # 2. Adaptive icon foreground (432x432)
    # The safe circle for adaptive icons is inner 66% (diameter 288px in 432px canvas).
    # We place the Lirune icon centered and scaled to 270x270 so it never clips on round masks.
    fg_size = 432
    target_inner = 270
    icon_fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    scaled_for_fg = base_icon.resize((target_inner, target_inner), Image.Resampling.LANCZOS)
    offset = (fg_size - target_inner) // 2
    icon_fg.paste(scaled_for_fg, (offset, offset), scaled_for_fg)
    icon_fg.save(os.path.join(mobile_assets, 'android-icon-foreground.png'), 'PNG')

    # 3. Adaptive icon background (432x432)
    bg_img = Image.new('RGBA', (fg_size, fg_size), (26, 26, 29, 255)) # #1A1A1D
    bg_img.save(os.path.join(mobile_assets, 'android-icon-background.png'), 'PNG')

    # 4. Adaptive icon monochrome
    # Extract alpha mask from foreground, fill with pure white for themed icons
    mono_img = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    alpha = icon_fg.split()[3]
    white = Image.new('RGBA', (fg_size, fg_size), (255, 255, 255, 255))
    mono_img.paste(white, (0, 0), alpha)
    mono_img.save(os.path.join(mobile_assets, 'android-icon-monochrome.png'), 'PNG')

    # 5. Splash icon (288x288)
    splash_icon = base_icon.resize((288, 288), Image.Resampling.LANCZOS)
    splash_icon.save(os.path.join(mobile_assets, 'splash-icon.png'), 'PNG')

    # 6. Favicon (48x48)
    fav_icon = base_icon.resize((48, 48), Image.Resampling.LANCZOS)
    fav_icon.save(os.path.join(mobile_assets, 'favicon.png'), 'PNG')

    # Now populate Android native mipmap and drawable directories:
    res_dir = os.path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'res')

    densities = {
        'mdpi': {'icon': 48, 'fg': 108, 'splash': 96},
        'hdpi': {'icon': 72, 'fg': 162, 'splash': 144},
        'xhdpi': {'icon': 96, 'fg': 216, 'splash': 192},
        'xxhdpi': {'icon': 144, 'fg': 324, 'splash': 288},
        'xxxhdpi': {'icon': 192, 'fg': 432, 'splash': 384},
    }

    for density, sizes in densities.items():
        mipmap_folder = os.path.join(res_dir, f'mipmap-{density}')
        os.makedirs(mipmap_folder, exist_ok=True)

        # ic_launcher.webp & ic_launcher_round.webp
        icon_dim = sizes['icon']
        d_icon = base_icon.resize((icon_dim, icon_dim), Image.Resampling.LANCZOS)
        d_icon.save(os.path.join(mipmap_folder, 'ic_launcher.webp'), 'WEBP')
        d_icon.save(os.path.join(mipmap_folder, 'ic_launcher_round.webp'), 'WEBP')

        # ic_launcher_foreground.webp
        fg_dim = sizes['fg']
        fg_inner = int(fg_dim * 0.62)
        d_fg = Image.new('RGBA', (fg_dim, fg_dim), (0, 0, 0, 0))
        scaled_inner = base_icon.resize((fg_inner, fg_inner), Image.Resampling.LANCZOS)
        d_offset = (fg_dim - fg_inner) // 2
        d_fg.paste(scaled_inner, (d_offset, d_offset), scaled_inner)
        d_fg.save(os.path.join(mipmap_folder, 'ic_launcher_foreground.webp'), 'WEBP')

        # ic_launcher_background.webp
        d_bg = Image.new('RGBA', (fg_dim, fg_dim), (26, 26, 29, 255))
        d_bg.save(os.path.join(mipmap_folder, 'ic_launcher_background.webp'), 'WEBP')

        # ic_launcher_monochrome.webp
        d_mono = Image.new('RGBA', (fg_dim, fg_dim), (0, 0, 0, 0))
        d_alpha = d_fg.split()[3]
        d_white = Image.new('RGBA', (fg_dim, fg_dim), (255, 255, 255, 255))
        d_mono.paste(d_white, (0, 0), d_alpha)
        d_mono.save(os.path.join(mipmap_folder, 'ic_launcher_monochrome.webp'), 'WEBP')

        # drawable splashscreen_logo.png
        drawable_folder = os.path.join(res_dir, f'drawable-{density}')
        os.makedirs(drawable_folder, exist_ok=True)
        splash_dim = sizes['splash']
        d_splash = base_icon.resize((splash_dim, splash_dim), Image.Resampling.LANCZOS)
        d_splash.save(os.path.join(drawable_folder, 'splashscreen_logo.png'), 'PNG')

    print("Successfully generated all Lirune Android branding assets!")

if __name__ == '__main__':
    main()
