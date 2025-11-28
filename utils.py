import os
import json
import time
import requests
import logging
import re
import base64
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
from faster_whisper import WhisperModel
import pypdf
import pandas as pd
import io
import zipfile

# --- CONFIGURATION ---
AIPIPE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6IjIzZjIwMDU2NjRAZHMuc3R1ZHkuaWl0bS5hYy5pbiJ9.1ppmjBFeLixKKKoOfnPUAJuTyGKoub0nqfyizo4y2zU"
AIPIPE_URL = "https://aipipe.org/openrouter/v1/chat/completions"

logger = logging.getLogger(__name__)

current_dataframe = None

# --- FILE EXTENSIONS ---
EXT_AUDIO = ('.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.opus', '.webm', '.mid', '.midi')
EXT_VIDEO = ('.mp4', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mpeg', '.mpg', '.m4v', '.3gp')
EXT_PDF   = ('.pdf',)
EXT_DATA  = ('.csv', '.tsv', '.json', '.xml', '.sql') 
EXT_TEXT  = ('.txt', '.md', '.log', '.py', '.js', '.html', '.css', '.java', '.c', '.cpp')
EXT_ARCHIVE = ('.zip',)
EXT_IMAGE = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')

# Initialize Whisper
try:
    whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    logger.info("Whisper model loaded.")
except Exception as e:
    logger.error(f"Failed to load Whisper: {e}")
    whisper_model = None

def get_llm_response(prompt_text, images_b64=None):
    """
    Sends text AND a list of images to LLM.
    """
    headers = {
        "Authorization": f"Bearer {AIPIPE_TOKEN}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hf.space"
    }
    
    # Construct Content Payload
    content_payload = [{"type": "text", "text": prompt_text}]
    
    # Add Images if present
    if images_b64:
        for i, img_str in enumerate(images_b64):
            if len(img_str) > 0: 
                content_payload.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{img_str}"
                    }
                })

    payload = {
        "model": "openai/gpt-4o-mini", 
        "messages": [{"role": "user", "content": content_payload}]
    }
    
    try:
        resp = requests.post(AIPIPE_URL, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()['choices'][0]['message']['content']
    except Exception as e:
        logger.error(f"LLM API Error: {e}")
        return None

def transcribe_media(media_url):
    try:
        logger.info(f"Downloading media: {media_url}")
        resp = requests.get(media_url)
        path = urlparse(media_url).path
        ext = os.path.splitext(path)[1] or ".mp3"
        filename = f"temp_media{ext}"
        with open(filename, "wb") as f:
            f.write(resp.content)
        
        if whisper_model:
            segments, _ = whisper_model.transcribe(filename)
            text = " ".join([s.text for s in segments])
            logger.info(f"TRANSCRIPTION: {text}") 
        else:
            text = "[Whisper model not loaded]"
        
        if os.path.exists(filename): os.remove(filename)
        return text
    except Exception as e:
        logger.error(f"Media error: {e}")
        return f"[Error extracting media: {e}]"

def extract_pdf_text(pdf_url):
    try:
        logger.info(f"Downloading PDF: {pdf_url}")
        resp = requests.get(pdf_url)
        with io.BytesIO(resp.content) as f:
            reader = pypdf.PdfReader(f)
            text = "\n".join([page.extract_text() for page in reader.pages])
        return text
    except Exception as e:
        logger.error(f"PDF error: {e}")
        return f"[Error extracting PDF: {e}]"

def extract_text_file(text_url):
    try:
        logger.info(f"Downloading Text file: {text_url}")
        resp = requests.get(text_url)
        return resp.content.decode('utf-8', errors='replace')[:15000] 
    except Exception as e:
        logger.error(f"Text error: {e}")
        return f"[Error reading text file: {e}]"

def handle_zip_file(zip_url):
    extracted_data = ""
    try:
        logger.info(f"Downloading ZIP file: {zip_url}")
        resp = requests.get(zip_url)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            for filename in z.namelist():
                if filename.endswith(('.csv', '.json', '.txt', '.md', '.sql', '.xml')):
                    with z.open(filename) as f:
                        content = f.read().decode('utf-8', errors='ignore')[:5000]
                        extracted_data += f"\n=== ZIP CONTENT: {filename} ===\n{content}\n"
        return extracted_data
    except Exception as e:
        logger.error(f"ZIP error: {e}")
        return f"[Error extracting ZIP: {e}]"

def download_image_as_base64(img_url):
    """Downloads an image and converts to Base64 string."""
    try:
        logger.info(f"Downloading Image: {img_url}")
        resp = requests.get(img_url, timeout=10)
        # Basic check
        if resp.status_code != 200: return None
        return base64.b64encode(resp.content).decode('utf-8')
    except Exception as e:
        logger.error(f"Image download failed: {e}")
        return None

def handle_data_file(data_url):
    global current_dataframe
    try:
        logger.info(f"Downloading Data file: {data_url}")
        
        if data_url.lower().endswith('.sql'):
            return extract_text_file(data_url)

        if data_url.lower().endswith('.json'):
            try:
                current_dataframe = pd.read_json(data_url)
            except ValueError:
                logger.info("JSON is not tabular. Reading as plain text.")
                return extract_text_file(data_url)
                
        elif data_url.lower().endswith('.tsv'):
            current_dataframe = pd.read_csv(data_url, sep='\t')
        else:
            current_dataframe = pd.read_csv(data_url)
            try:
                if len(current_dataframe.columns) > 0:
                    float(current_dataframe.columns[0]) 
                    logger.info("Numeric header detected. Reloading with header=None.")
                    current_dataframe = pd.read_csv(data_url, header=None)
                    current_dataframe.columns = [f"col_{i}" for i in range(len(current_dataframe.columns))]
            except:
                pass
            
        current_dataframe.columns = current_dataframe.columns.astype(str)
        
        buffer = io.StringIO()
        current_dataframe.info(buf=buffer)
        schema_info = buffer.getvalue()
        sample = current_dataframe.head(3).to_markdown()
        
        return f"Data File Loaded into DataFrame 'df'.\n\nSCHEMA:\n{schema_info}\n\nSAMPLE ROWS:\n{sample}"
    except Exception as e:
        logger.error(f"Data load error: {e}")
        return extract_text_file(data_url)

def scrape_page_and_links(url):
    logger.info(f"Scraping URL: {url}")
    context_data = ""
    links_found = []
    collected_images_b64 = [] 

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            if url.endswith(EXT_PDF): return (f"=== PDF CONTENT ===\n{extract_pdf_text(url)}", [])
            if url.endswith(EXT_DATA): return (f"=== DATA CONTENT ===\n{handle_data_file(url)}", [])
            
            page.goto(url, timeout=60000)
            page.wait_for_load_state("networkidle")
            
            # --- SCREENSHOT REMOVED ---
            
            content_html = page.content()
            soup = BeautifulSoup(content_html, "html.parser")
            
            # --- DOWNLOAD <img> TAGS ---
            img_tags = soup.find_all('img')
            for img in img_tags:
                src = img.get('src')
                if src and not src.startswith("data:"): 
                    full_img_url = urljoin(url, src)
                    if full_img_url not in links_found:
                        links_found.append(full_img_url)
                        if len(collected_images_b64) < 3: # Limit to 3 images
                            b64 = download_image_as_base64(full_img_url)
                            if b64:
                                collected_images_b64.append(b64)
                                logger.info(f"🖼️ Downloaded and attached image: {full_img_url}")

            for script in soup(["script", "style"]):
                script.decompose()
            main_text = soup.get_text(separator="\n", strip=True)
            context_data += f"=== CONTENT OF {url} ===\n{main_text}\n\n"

            # --- PROCESS LINKS ---
            tags = soup.find_all(['a', 'audio', 'video', 'source'])
            
            for tag in tags:
                link = tag.get('href') or tag.get('src')
                if not link: continue
                full_link = urljoin(url, link)
                lower_link = full_link.lower()
                
                # Check for Linked Images
                if lower_link.endswith(EXT_IMAGE):
                    if full_link not in links_found:
                        links_found.append(full_link)
                        if len(collected_images_b64) < 3:
                            b64 = download_image_as_base64(full_link)
                            if b64:
                                collected_images_b64.append(b64)
                                context_data += f"\n[Attached Linked Image: {full_link}]\n"

                elif lower_link.endswith(EXT_AUDIO) or lower_link.endswith(EXT_VIDEO):
                    if full_link not in links_found:
                        links_found.append(full_link)
                        context_data += f"=== MEDIA TRANSCRIPT ({full_link}) ===\n{transcribe_media(full_link)}\n\n"
                elif lower_link.endswith(EXT_PDF):
                    if full_link not in links_found:
                        links_found.append(full_link)
                        context_data += f"=== PDF CONTENT ({full_link}) ===\n{extract_pdf_text(full_link)}\n\n"
                elif lower_link.endswith(EXT_DATA):
                    if full_link not in links_found:
                        links_found.append(full_link)
                        context_data += f"=== DATA FILE ({full_link}) ===\n{handle_data_file(full_link)}\n\n"
                elif lower_link.endswith(EXT_TEXT):
                     if full_link not in links_found:
                        links_found.append(full_link)
                        context_data += f"=== TEXT CONTENT ({full_link}) ===\n{extract_text_file(full_link)}\n\n"
                elif lower_link.endswith(EXT_ARCHIVE):
                     if full_link not in links_found:
                        links_found.append(full_link)
                        context_data += f"=== ZIP ARCHIVE CONTENT ({full_link}) ===\n{handle_zip_file(full_link)}\n\n"
                elif tag.name == 'a' and full_link.startswith("http") and full_link not in links_found:
                    if lower_link.endswith(('.exe', '.rar', '.7z')): continue
                    if len(links_found) < 8: 
                        links_found.append(full_link)
                        try:
                            sub_page = context.new_page()
                            sub_page.goto(full_link, timeout=30000)
                            try: sub_page.wait_for_load_state("domcontentloaded", timeout=5000)
                            except: pass
                            sub_content = sub_page.content()
                            sub_soup = BeautifulSoup(sub_content, "html.parser")
                            sub_text = sub_soup.get_text(separator=" ", strip=True)[:3000]
                            context_data += f"=== LINKED PAGE CONTENT ({full_link}) ===\n{sub_text}\n\n"
                            sub_page.close()
                        except: pass
                            
        except Exception as e:
            logger.error(f"Playwright error: {e}")
            context_data += f"Error scraping {url}: {e}"
        finally:
            browser.close()

    return context_data, collected_images_b64

def solve_single_question(current_url, email, secret):
    global current_dataframe
    logger.info(f"--- STARTING QUESTION: {current_url} ---")
    current_dataframe = None
    start_time = time.time()
    MAX_TIME = 170
    
    page_context, images_b64 = scrape_page_and_links(current_url)
    
    attempt_history = ""
    last_next_url_seen = None

    while (time.time() - start_time) < MAX_TIME:
        calculated_answer = None
        if current_dataframe is not None:
            logger.info("Data file detected. Asking LLM for Python code...")
            code_prompt = f"""
            You have a Pandas DataFrame named `df`.
            Cols are STRINGS.
            CONTEXT: {page_context}
            PREVIOUS FAILED ATTEMPTS: {attempt_history}
            TASK: Write a SINGLE Python expression to answer the question.
            Return ONLY the code.
            """
            llm_code = get_llm_response(code_prompt)
            if llm_code:
                llm_code = llm_code.replace("```python", "").replace("```", "").strip()
                logger.info(f"Executing Code: {llm_code}")
                try:
                    result = eval(llm_code, {"df": current_dataframe, "pd": pd})
                    calculated_answer = str(result)
                    logger.info(f"Calculated Answer: {calculated_answer}")
                except Exception as e:
                    calculated_answer = f"Error calculating: {e}"

        system_prompt = "You are an AI agent. Identify the correct submission URL and answer."
        user_prompt = f"""
        PAGE CONTEXT: {page_context}
        PREVIOUS ATTEMPTS: {attempt_history}
        """
        if calculated_answer:
            user_prompt += f"\n\n*** PROGRAMMATIC ANSWER: {calculated_answer} ***\n*** USE THIS VALUE. ***"
        
        user_prompt += """
        INSTRUCTIONS:
        1. Find submit URL.
        2. Output JSON with "submit_url" and "answer".
        
        IMPORTANT:
        - If the answer is HTML, SQL, or Code, ensure it is properly escaped in the JSON value.
        - Example for code: { "answer": "<div class=\\"test\\">Hello</div>" }
        - If images are attached, use them to answer visual questions.
        """

        llm_out = get_llm_response(system_prompt + "\n" + user_prompt, images_b64)
        if not llm_out:
            time.sleep(2)
            continue

        try:
            clean_out = llm_out.replace("```json", "").replace("```", "").strip()
            submission_data = json.loads(clean_out)
            submit_url = submission_data.get("submit_url")
            answer = submission_data.get("answer")
            
            if not submit_url or answer is None: raise ValueError("Missing submit_url/answer")

            payload = {"email": email, "secret": secret, "url": current_url, "answer": answer}
            logger.info(f"Submitting to {submit_url} with payload: {payload}")
            
            post_resp = requests.post(submit_url, json=payload, timeout=10)
            resp_json = post_resp.json()
            logger.info(f"Submission Response: {resp_json}")

            if resp_json.get("correct") is True:
                logger.info("Answer Correct!")
                return resp_json.get("url") 
            else:
                reason = resp_json.get("reason", "Unknown error")
                attempt_history += f"\nAttempt '{answer}' failed: {reason}."
                if resp_json.get("url"): last_next_url_seen = resp_json.get("url")
                logger.info("Waiting 10 seconds before retrying...")
                time.sleep(10)
        except Exception as e:
            logger.warning(f"LLM/Network glitch (Retrying): {e}")
            attempt_history += f"\nError: {str(e)}"
            time.sleep(2)

    return last_next_url_seen if last_next_url_seen else None

def run_quiz_chain(email, secret, start_url):
    current_url = start_url
    while current_url:
        logger.info(f"=== Starting Chain Link: {current_url} ===")
        next_url = solve_single_question(current_url, email, secret)
        if next_url: current_url = next_url
        else:
            logger.info("_________________________________________________")
            logger.info("   🎉 QUIZ COMPLETED SUCCESSFULLY! 🎉")
            logger.info("_________________________________________________")
            break
