from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os
import logging
import time

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Transcription API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model on startup
whisper_model = None

@app.on_event("startup")
async def load_model():
    global whisper_model
    try:
        logger.info("Loading Whisper Base model...")
        whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        logger.info("Whisper model loaded successfully!")
    except Exception as e:
        logger.error(f"Failed to load Whisper model: {e}")
        raise

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model_loaded": whisper_model is not None
    }

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio file to text using Whisper"""
    
    if not whisper_model:
        logger.error("Transcription request received but Whisper model not loaded!")
        raise HTTPException(status_code=503, detail="Whisper model not loaded")
    
    # Save uploaded file temporarily
    temp_file = None
    try:
        # Create temp file with proper extension
        suffix = os.path.splitext(file.filename)[1] or ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        logger.info(f"Processing {file.filename} ({len(content)} bytes, temp: {temp_path})")
        
        # Transcribe
        logger.info("Starting Whisper transcription...")
        start_time = time.time()
        segments, info = whisper_model.transcribe(temp_path, beam_size=5)
        text = " ".join([segment.text for segment in segments])
        elapsed = time.time() - start_time
        
        logger.info(f"✓ Transcription complete in {elapsed:.2f}s: '{text[:100]}...' (lang={info.language}, duration={info.duration:.1f}s)")
        
        return {
            "success": True,
            "transcription": text,
            "language": info.language,
            "duration": info.duration,
            "elapsed": elapsed
        }
        
    except Exception as e:
        logger.error(f"✗ Transcription failed for {file.filename}: {type(e).__name__}: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # Cleanup temp file
        if temp_file and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
                logger.debug(f"Cleaned up temp file: {temp_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup {temp_path}: {cleanup_error}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
