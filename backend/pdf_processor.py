import base64
import fitz  # PyMuPDF
import PIL.Image
import io


def extract_text_from_pdf(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    pages_text = []
    pages_images = []
    page_count = len(doc)

    for page_num in range(page_count):
        page = doc[page_num]
        text = page.get_text()
        pages_text.append(text)

        mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        img_b64 = base64.b64encode(img_bytes).decode()
        pages_images.append({
            "page": page_num + 1,
            "image_b64": img_b64,
        })

    doc.close()

    total_text = "\n\n".join(
        f"--- Page {i+1} ---\n{t}" for i, t in enumerate(pages_text)
    )
    # Heuristic: if fewer than 80 chars per page on average, likely scanned
    is_scanned = len(total_text.strip()) < 80 * page_count

    return {
        "text": total_text,
        "pages_images": pages_images,
        "is_scanned": is_scanned,
        "page_count": page_count,
    }


def load_pil_images(pdf_data: dict, max_pages: int = 5) -> list:
    images = []
    for page in pdf_data["pages_images"][:max_pages]:
        img_bytes = base64.b64decode(page["image_b64"])
        img = PIL.Image.open(io.BytesIO(img_bytes))
        images.append(img)
    return images
