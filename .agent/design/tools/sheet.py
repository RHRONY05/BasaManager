"""Contact sheet of screenshots for quick visual critique (designer tooling). usage: sheet.py out.png scale img1 img2 ..."""
import sys
from PIL import Image
out, scale, files = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
ims = [i.resize((int(i.width*scale), int(i.height*scale))) for i in ims]
W = sum(i.width for i in ims) + 20*(len(ims)-1); H = max(i.height for i in ims)
sheet = Image.new('RGB', (W, H), (128,128,128)); x = 0
for i in ims: sheet.paste(i, (x, 0)); x += i.width + 20
sheet.save(out)
