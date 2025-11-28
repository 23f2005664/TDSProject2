# Use Python 3.10 slim as base
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# 1. Install system dependencies (ffmpeg for audio, git/curl for playwright)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy requirements and install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Install Playwright SYSTEM dependencies (Requires Root)
RUN playwright install-deps

# 4. Create a non-root user and setup permissions
RUN useradd -m -u 1000 user
# Create logs directory and assign ownership to user
RUN mkdir -p logs && chown -R user:user /app

# 5. Switch to non-root user
USER user

# 6. Install Playwright BROWSER binaries (As User - this fixes the error)
# This installs Chromium into /home/user/.cache/
RUN playwright install chromium

# 7. Copy application code
COPY --chown=user:user . .

# Expose port 7860 (Hugging Face default)
EXPOSE 7860

# Command to run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
