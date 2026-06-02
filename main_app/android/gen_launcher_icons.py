"""
Generate Android launcher icons from the PWA app icon (Daily Script wordmark).

Source of truth: web_pwa/public/m/icons/icon-book-512.png  (the manifest's canonical
app icon — pixel-identical to icon-512.png). Wordmark "Daily Script." in cream
#FAF8F2 on espresso #0E0C0A with an orange #D85A30 book-spine accent.

Outputs (res/):
  mipmap-<dpi>/ic_launcher_foreground.png   adaptive foreground (transparent, safe-zone scaled)
  mipmap-<dpi>/ic_launcher_monochrome.png   themed-icon silhouette (Android 13+)
  mipmap-<dpi>/ic_launcher.png              legacy square (opaque, fills frame, = PWA icon)
  mipmap-<dpi>/ic_launcher_round.png        legacy round (circle-masked)
The espresso background layer is supplied as @color/ic_launcher_background.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(
    HERE, "..", "..", "web_pwa", "public", "m", "icons", "icon-book-512.png"))
RES = os.path.join(HERE, "app", "src", "main", "res")

BG = (14, 12, 10)            # espresso #0E0C0A
CREAM = (250, 248, 242)      # text
# Wordmark content geometry measured in the 512px source:
CONTENT_CENTER = (264, 267)  # bbox center of the wordmark
CONTENT_BBOX = (114, 150, 416, 386)  # left,top,right,bottom (right/bottom exclusive-ish)
CONTENT_RADIUS = 173.6       # max pixel distance from center (source px)

# dpi bucket -> (adaptive full px = 108dp, legacy launcher px = 48dp)
DENSITIES = {
    "mdpi":    (108, 48),
    "hdpi":    (162, 72),
    "xhdpi":   (216, 96),
    "xxhdpi":  (324, 144),
    "xxxhdpi": (432, 192),
}

# Place the wordmark so its farthest pixel sits at 0.30*canvas from center.
# Guaranteed adaptive safe circle radius is 0.3056*canvas (66dp/108/2); 0.30
# leaves a hair of margin for launcher parallax. -> ~52% wordmark width.
TARGET_RADIUS_FRAC = 0.30

# Splash screen icon (Android 12+ SplashScreen API). The system masks the icon
# to the central 2/3 circle (radius 0.333*canvas); 0.32 fills it without clipping.
SPLASH_SIZE = 1152
SPLASH_RADIUS_FRAC = 0.32


def load_keyed_sprite():
    """Return an RGBA sprite cropped to the wordmark, dark bg keyed to transparent.
    Semi-transparent edge pixels keep their original RGB so that re-compositing
    over the identical espresso background reproduces the source exactly."""
    im = Image.open(SRC).convert("RGB")
    px = im.load()
    W, H = im.size
    rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out = rgba.load()
    T = 260.0  # L1 distance at which a pixel is fully opaque
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            d = abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2])
            a = 0 if d <= 0 else min(255, int(round(d / T * 255)))
            out[x, y] = (r, g, b, a)
    l, t, rr, bb = CONTENT_BBOX
    return rgba.crop((l, t, rr, bb))


def scaled_sprite(sprite, canvas, white=False, radius_frac=TARGET_RADIUS_FRAC):
    """Scale the sprite so its content radius maps to radius_frac*canvas,
    return an RGBA canvas x canvas image with the sprite centered."""
    target_r = radius_frac * canvas
    s = target_r / CONTENT_RADIUS
    new_w = max(1, round(sprite.width * s))
    new_h = max(1, round(sprite.height * s))
    spr = sprite.resize((new_w, new_h), Image.LANCZOS)
    if white:
        # keep alpha, force RGB to white for the monochrome themed icon
        a = spr.getchannel("A")
        spr = Image.merge("RGBA", (
            a.point(lambda _: 255), a.point(lambda _: 255),
            a.point(lambda _: 255), a))
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(spr, ((canvas - new_w) // 2, (canvas - new_h) // 2), spr)
    return out


def legacy_square(size):
    """Opaque legacy icon = the PWA icon downscaled (fills the frame)."""
    im = Image.open(SRC).convert("RGB").resize((size, size), Image.LANCZOS)
    return im.convert("RGBA")


def circle_mask(size):
    # supersampled circle for clean edges
    ss = size * 4
    m = Image.new("L", (ss, ss), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).ellipse((0, 0, ss - 1, ss - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main():
    sprite = load_keyed_sprite()
    for dpi, (full, legacy) in DENSITIES.items():
        d = os.path.join(RES, "mipmap-" + dpi)
        os.makedirs(d, exist_ok=True)

        scaled_sprite(sprite, full).save(os.path.join(d, "ic_launcher_foreground.png"))
        scaled_sprite(sprite, full, white=True).save(
            os.path.join(d, "ic_launcher_monochrome.png"))

        sq = legacy_square(legacy)
        sq.save(os.path.join(d, "ic_launcher.png"))

        rnd = sq.copy()
        rnd.putalpha(circle_mask(legacy))
        rnd.save(os.path.join(d, "ic_launcher_round.png"))

        print(f"{dpi:8s} fg/mono {full}px  legacy {legacy}px")

    # Splash screen logo — single high-res asset, density-independent.
    splash_dir = os.path.join(RES, "drawable-nodpi")
    os.makedirs(splash_dir, exist_ok=True)
    scaled_sprite(sprite, SPLASH_SIZE, radius_frac=SPLASH_RADIUS_FRAC).save(
        os.path.join(splash_dir, "splash_logo.png"))
    print(f"splash   {SPLASH_SIZE}px -> drawable-nodpi/splash_logo.png")
    print("source:", SRC)


if __name__ == "__main__":
    main()
