from PIL import Image

src_path = r"C:\Users\Trending Pc\Desktop\Proyectos\Personal\IA\Imagenes_Compartidas\logotransparentevvectorialESTICC.png"
out_path = r"C:\Users\Trending Pc\Desktop\Proyectos\Personal\IA\PROYECTOS_DESARROLLO\ESTICC\src-tauri\icons\icon_source.png"

src = Image.open(src_path).convert("RGBA")

canvas_size = 1024
padding = 100
max_logo = canvas_size - (padding * 2)

scale = min(max_logo / src.width, max_logo / src.height)
new_w = round(src.width * scale)
new_h = round(src.height * scale)

logo_scaled = src.resize((new_w, new_h), Image.LANCZOS)

canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
x = (canvas_size - new_w) // 2
y = (canvas_size - new_h) // 2
canvas.paste(logo_scaled, (x, y), logo_scaled)

canvas.save(out_path, "PNG")
print(f"Canvas generado: {canvas_size}x{canvas_size}px")
print(f"Logo escalado: {new_w}x{new_h}px  (posicion: {x},{y})")
print(f"Guardado en: {out_path}")

# Generar 64x64 (tauri icon no lo crea automaticamente)
icon_64 = canvas.resize((64, 64), Image.LANCZOS)
out_64 = r"C:\Users\Trending Pc\Desktop\Proyectos\Personal\IA\PROYECTOS_DESARROLLO\ESTICC\src-tauri\icons\64x64.png"
icon_64.save(out_64, "PNG")
print(f"64x64.png generado")
