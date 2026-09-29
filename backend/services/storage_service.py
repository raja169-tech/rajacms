"""
services/storage_service.py — Supabase Storage upload and signed URL generation.

Security enforced:
- MIME type via magic-byte sniffing (not file extension)
- Max file size: 5 MB
- Image re-encoded via Pillow to strip EXIF metadata and neutralize polyglot files
- Storage path (not public URL) stored in DB; signed URLs generated at render time with 5-min TTL
"""
import io
import os
import uuid
from fastapi import HTTPException, UploadFile, status
from PIL import Image
from database import get_supabase
from config import get_settings

settings = get_settings()

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
SIGNED_URL_EXPIRY_SECONDS = 300  # 5 minutes


def _detect_mime(data: bytes) -> str:
    """
    Detect MIME type from magic bytes.
    Falls back to checking file headers manually if python-magic is unavailable.
    """
    try:
        import magic
        return magic.from_buffer(data, mime=True)
    except ImportError:
        # Fallback: check common image magic bytes
        if data[:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return "application/octet-stream"


def _re_encode_image(data: bytes, mime_type: str) -> tuple[bytes, str]:
    """
    Re-encode image using Pillow to:
    - Strip all EXIF/metadata
    - Neutralize polyglot file attacks
    - Normalize format
    Returns: (re-encoded bytes, extension)
    """
    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")  # Strips alpha, ensures clean conversion
        output = io.BytesIO()

        if mime_type == "image/png":
            img.save(output, format="PNG", optimize=True)
            ext = "png"
        elif mime_type == "image/webp":
            img.save(output, format="WEBP", quality=85)
            ext = "webp"
        else:
            img.save(output, format="JPEG", quality=85, optimize=True)
            ext = "jpg"

        return output.getvalue(), ext
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid or corrupt image file: {str(e)}",
        )


async def upload_proof(upload: UploadFile, client_id: str) -> str:
    """
    Validate, re-encode, and upload a payment proof image to Supabase Storage.

    Returns the storage path (not a URL) to store in transactions.proof_url.
    Call get_signed_url(path) when you need to display the image.
    """
    # Read file into memory
    data = await upload.read()

    # 1. Size check
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.",
        )

    # 2. MIME check via magic bytes (not file extension or Content-Type header)
    mime_type = _detect_mime(data)
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid file type '{mime_type}'. Only JPEG, PNG, and WebP are allowed.",
        )

    # 3. Re-encode to strip EXIF and neutralize polyglot files
    clean_data, ext = _re_encode_image(data, mime_type)

    # 4. Generate unique storage path
    storage_path = f"proofs/{client_id}/{uuid.uuid4()}.{ext}"

    # 5. Upload to private Supabase Storage bucket
    db = get_supabase()
    db.storage.from_(settings.supabase_storage_bucket).upload(
        path=storage_path,
        file=clean_data,
        file_options={"content-type": f"image/{ext}"},
    )

    return storage_path  # Return path, NOT a URL


def get_signed_url(storage_path: str) -> str:
    """
    Generate a short-lived signed URL (5 min TTL) for viewing a stored proof image.
    Call this at render time; never store the URL in the database.
    """
    db = get_supabase()
    result = db.storage.from_(settings.supabase_storage_bucket).create_signed_url(
        path=storage_path,
        expires_in=SIGNED_URL_EXPIRY_SECONDS,
    )
    return result["signedURL"]
