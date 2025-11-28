from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging
import os
from datetime import datetime
from utils import run_quiz_chain

# --- CONFIGURATION ---
EXPECTED_SECRET = "123"

# --- LOGGING SETUP ---
# Create logs directory
os.makedirs("logs", exist_ok=True)

# Generate timestamped filename
timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
log_filename = f"logs/app_{timestamp}.log"

# Configure logging to write to file AND console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- CUSTOM EXCEPTION HANDLER ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Invalid JSON Payload: {exc}")
    return JSONResponse(
        status_code=400,
        content={"detail": "Invalid JSON or missing fields", "errors": str(exc)},
    )

class QuizRequest(BaseModel):
    email: str
    secret: str
    url: str

@app.post("/llm-quiz")
async def start_quiz(task: QuizRequest, background_tasks: BackgroundTasks):
    # 1. Log the Full Payload
    logger.info(f"📥 RECEIVED PAYLOAD: {task.model_dump_json()}")

    # 2. Verify Secret
    if task.secret != EXPECTED_SECRET:
        logger.warning(f"⛔ Invalid Secret received: {task.secret}")
        raise HTTPException(status_code=403, detail="Invalid secret")

    # 3. Add task to background
    background_tasks.add_task(run_quiz_chain, task.email, task.secret, task.url)

    return {"message": "Quiz started", "status": "processing", "log_file": log_filename}

@app.get("/")
def home():
    return {"status": "Active", "current_log_file": log_filename}

@app.get("/logs")
def get_logs():
    """Returns the content of the current session's log file."""
    try:
        with open(log_filename, "r") as f:
            lines = f.readlines()
            # Return last 200 lines to avoid payload size issues
            return {"current_log": "".join(lines[-200:])} 
    except Exception as e:
        return {"error": str(e)}
