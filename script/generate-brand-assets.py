from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024


def icon(channel="prod"):
    image = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((20, 20, 1004, 1004), radius=224, fill="#102827")
    draw.polygon([(512, 190), (838, 824), (670, 824), (512, 493), (354, 824), (186, 824)], fill="#B9E7CC")
    draw.polygon([(400, 647), (624, 647), (662, 724), (362, 724)], fill="#B9E7CC")
    draw.ellipse((450, 572, 574, 614), fill="#E7DCA5")
    draw.ellipse((497, 578, 527, 608), fill="#102827")
    if channel != "prod":
        draw.rounded_rectangle((376, 900, 648, 934), radius=17, fill="#E7DCA5" if channel == "dev" else "#A9BAEB")
    return image


for channel in ("prod", "dev", "beta"):
    base = ROOT / "packages/desktop/icons" / channel
    image = icon(channel)
    for target in base.rglob("*.png"):
        with Image.open(target) as previous:
            size = previous.size
        image.resize(size, Image.Resampling.LANCZOS).save(target)
    image.save(base / "icon.ico", sizes=[(x, x) for x in (16, 24, 32, 48, 64, 128, 256)])
    image.save(base / "icon.icns", format="ICNS")

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="20" y="20" width="984" height="984" rx="224" fill="#102827"/><path d="M512 190L838 824H670L512 493L354 824H186Z M400 647H624L662 724H362Z" fill="#B9E7CC"/><ellipse cx="512" cy="593" rx="62" ry="21" fill="#E7DCA5"/><circle cx="512" cy="593" r="15" fill="#102827"/></svg>'
favicon = ROOT / "packages/ui/src/assets/favicon"
(favicon / "amon.svg").write_text(svg, encoding="utf8")
image = icon()
for target in favicon.glob("*.png"):
    with Image.open(target) as previous:
        size = previous.size
    image.resize(size, Image.Resampling.LANCZOS).save(target)
for target in favicon.glob("*.ico"):
    image.save(target, sizes=[(x, x) for x in (16, 24, 32, 48, 64, 128, 256)])
for target in (favicon / "favicon.svg", favicon / "favicon-v3.svg"):
    target.write_text(svg, encoding="utf8")

# Windows checkouts contain materialized copies of the upstream asset symlinks.
public = ROOT / "packages/app/public"
for target in public.iterdir():
    source = favicon / target.name
    if source.is_file() and target.is_file():
        target.write_bytes(source.read_bytes())
print("Generated Amon desktop icons and app favicon assets for all channels")
