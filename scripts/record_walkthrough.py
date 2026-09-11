import asyncio
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

TOTAL_DURATION = 152.0  # seconds (matches 151.89s voiceover)
AUDIO_FILE = r"C:\Users\Farhan\Downloads\WhatsApp Audio 2026-09-04 at 01.58.57.mp4"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "artifacts_video"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_VIDEO_DIR = OUTPUT_DIR / "raw"
RAW_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
FINAL_OUTPUT_MP4 = OUTPUT_DIR / "freightiq_sih_walkthrough_final.mp4"

async def setup_helpers(page):
    """Inject glowing virtual cursor and smooth transition controllers into DOM."""
    await page.evaluate("""() => {
        let cursor = document.getElementById('virtual-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'virtual-cursor';
            cursor.style.position = 'fixed';
            cursor.style.width = '18px';
            cursor.style.height = '18px';
            cursor.style.borderRadius = '50%';
            cursor.style.backgroundColor = 'rgba(14, 165, 233, 0.85)';
            cursor.style.border = '2px solid #ffffff';
            cursor.style.boxShadow = '0 0 14px rgba(14, 165, 233, 0.95), 0 0 4px rgba(255, 255, 255, 0.8)';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '9999999';
            cursor.style.transform = 'translate(-50%, -50%)';
            cursor.style.transition = 'left 0.4s cubic-bezier(0.25, 1, 0.5, 1), top 0.4s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease';
            cursor.style.left = '960px';
            cursor.style.top = '540px';
            document.body.appendChild(cursor);
        }
        window.__moveCursor = (x, y, ms = 400) => {
            const c = document.getElementById('virtual-cursor');
            if (c) {
                c.style.transition = `left ${ms}ms cubic-bezier(0.25, 1, 0.5, 1), top ${ms}ms cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease`;
                c.style.left = `${x}px`;
                c.style.top = `${y}px`;
            }
        };
        window.__pulseCursor = () => {
            const c = document.getElementById('virtual-cursor');
            if (c) {
                c.style.transform = 'translate(-50%, -50%) scale(0.75)';
                setTimeout(() => c.style.transform = 'translate(-50%, -50%) scale(1)', 150);
            }
        };
    }""")

async def move_cursor(page, x, y, ms=500):
    """Smoothly animate the virtual cursor to (x, y)."""
    await page.evaluate(f"window.__moveCursor({x}, {y}, {ms})")
    await asyncio.sleep(ms / 1000.0)

async def scroll_to(page, y, wait_sec=1.5):
    """Smooth scroll the page to y position."""
    await page.evaluate(f"window.scrollTo({{ top: {y}, behavior: 'smooth' }})")
    await asyncio.sleep(wait_sec)

async def click_element(page, loc):
    """Move virtual cursor smoothly to element, pulse, and click."""
    try:
        box = await loc.bounding_box()
        if box:
            x = box['x'] + box['width'] / 2
            y = box['y'] + box['height'] / 2
            await page.evaluate(f"window.__moveCursor({x}, {y}, 350)")
            await asyncio.sleep(0.35)
            await page.evaluate("window.__pulseCursor()")
            await asyncio.sleep(0.1)
        await loc.click()
    except Exception as e:
        print(f"[Click notice]: {e}")
        try:
            await loc.click(force=True)
        except Exception:
            pass

async def record():
    print("=" * 60)
    print("FREIGHTIQ SIH 2:30 AUTOMATED HIGH QUALITY VIDEO RECORDING")
    print("=" * 60)

    # Clean old webm videos in raw directory
    for f in RAW_VIDEO_DIR.glob("*.webm"):
        try:
            f.unlink()
        except Exception:
            pass

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--enable-font-antialiasing",
                "--force-device-scale-factor=1",
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(RAW_VIDEO_DIR),
            record_video_size={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # Step 0: Clear state to guarantee clean onboarding run
        print("[Setup] Clearing localStorage and loading landing page...")
        await page.goto("http://127.0.0.1:5173/")
        await page.evaluate("() => localStorage.clear()")
        await page.reload()
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        start_time = time.time()
        print(f"[*] Started recording clock at {time.strftime('%H:%M:%S')}")

        # -------------------------------------------------------------
        # 0:00–0:12 (12s) — COLD OPEN
        # -------------------------------------------------------------
        print("[0:00 - 0:12] Cold Open — Product Landing Hero")
        await asyncio.sleep(4.0)
        # Move cursor over key metrics
        await move_cursor(page, 300, 680, ms=800)
        await asyncio.sleep(2.0)
        await move_cursor(page, 500, 680, ms=800)
        await asyncio.sleep(2.0)
        await move_cursor(page, 440, 530, ms=800)
        await asyncio.sleep(2.4)

        # -------------------------------------------------------------
        # 0:12–0:28 (16s) — THE PROBLEM
        # -------------------------------------------------------------
        print("[0:12 - 0:28] The Problem — Showcase Simulator & Core Engines")
        # Scroll to Live Simulator (#sandbox)
        await scroll_to(page, 850, wait_sec=1.5)
        await move_cursor(page, 650, 480, ms=600)
        await asyncio.sleep(3.5)

        # Scroll to Core Engines (#engines)
        await scroll_to(page, 1750, wait_sec=1.5)
        await move_cursor(page, 550, 420, ms=600)
        await asyncio.sleep(3.5)

        # Scroll to Why FreightIQ (#comparison)
        await scroll_to(page, 2550, wait_sec=1.5)
        await move_cursor(page, 700, 500, ms=600)
        await asyncio.sleep(3.4)

        # -------------------------------------------------------------
        # 0:28–0:36 (8s) — ENTER FREIGHTIQ
        # -------------------------------------------------------------
        print("[0:28 - 0:36] Enter FreightIQ — Create Workspace & Sign In")
        await scroll_to(page, 0, wait_sec=1.0)
        
        # Click Enter Command Center
        btn = page.locator("button").filter(has_text="Enter Command Center").first
        await click_element(page, btn)
        await asyncio.sleep(0.5)
        await setup_helpers(page)

        # Fill Login / Signup form
        name_input = page.locator("input[placeholder='Priya Sharma']").first
        await name_input.fill("Priya Sharma")
        await asyncio.sleep(1.0)
        
        email_input = page.locator("input[placeholder='you@company.com']").first
        await email_input.fill("judge@sih.gov.in")
        await asyncio.sleep(1.0)
        
        pass_input = page.locator("input[type='password']").first
        await pass_input.fill("admin123")
        await asyncio.sleep(0.8)

        sub_btn = page.locator("button[type='submit']").first
        await click_element(page, sub_btn)
        await asyncio.sleep(1.2)

        # -------------------------------------------------------------
        # 0:36–0:50 (14s) — ONBOARDING
        # -------------------------------------------------------------
        print("[0:36 - 0:50] Onboarding Flow — Paradip, Corridor, Cargoes")
        await setup_helpers(page)

        # Step 1: Select Paradip Port
        print("  -> Selecting Paradip Port")
        p_card = page.locator("text='Paradip Port'").first
        await click_element(page, p_card)
        await asyncio.sleep(1.5)
        next_btn = page.locator("button").filter(has_text="Next").first
        await click_element(page, next_btn)
        await asyncio.sleep(1.5)

        # Step 2: Select Corridor Newcastle -> Paradip
        print("  -> Selecting Newcastle -> Paradip corridor")
        r_card = page.locator("text='Newcastle (Australia)'").first
        await click_element(page, r_card)
        await asyncio.sleep(1.5)
        next_btn = page.locator("button").filter(has_text="Next").first
        await click_element(page, next_btn)
        await asyncio.sleep(1.5)

        # Step 3: Select Cargoes (Thermal Coal, Iron Ore, Bauxite)
        print("  -> Selecting Cargo types")
        await click_element(page, page.locator("text='Thermal Coal'").first)
        await asyncio.sleep(1.0)
        await click_element(page, page.locator("text='Iron Ore'").first)
        await asyncio.sleep(1.0)
        await click_element(page, page.locator("text='Bauxite'").first)
        await asyncio.sleep(1.0)
        
        print("  -> Launching Dashboard")
        launch_btn = page.locator("button").filter(has_text="Launch Dashboard").first
        await click_element(page, launch_btn)
        await asyncio.sleep(2.0)

        # -------------------------------------------------------------
        # 0:50–1:08 (18s) — COMMAND CENTER
        # -------------------------------------------------------------
        print("[0:50 - 1:08] Command Center — Executive KPIs, Congestion, Risk Wire")
        await setup_helpers(page)

        # Hover top KPIs (Baltic Dry, Capesize, Supramax)
        await move_cursor(page, 400, 190, ms=600)
        await asyncio.sleep(2.5)
        await move_cursor(page, 720, 190, ms=600)
        await asyncio.sleep(2.5)

        # Scroll down to Indian Ports Congestion Heatmap / AIS Live map
        await scroll_to(page, 450, wait_sec=1.5)
        await move_cursor(page, 620, 520, ms=600)
        await asyncio.sleep(3.5)

        # Scroll down to Forward Freight curve & AI risk wire
        await scroll_to(page, 850, wait_sec=1.5)
        await move_cursor(page, 950, 480, ms=600)
        await asyncio.sleep(3.0)

        # Scroll back up smoothly
        await scroll_to(page, 0, wait_sec=1.4)

        # -------------------------------------------------------------
        # 1:08–1:25 (17s) — AI COPILOT
        # -------------------------------------------------------------
        print("[1:08 - 1:25] AI Copilot — Natural Language & Port Constraint Checks")
        copilot_link = page.locator("a[href='/copilot']").first
        await click_element(page, copilot_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # Click prompt input and type question
        copilot_input = page.locator("input[placeholder*='Ask Copilot']").first
        await click_element(page, copilot_input)
        prompt_text = "Recommend vessel for 75,000 MT Coal from Newcastle to Paradip"
        await copilot_input.fill(prompt_text)
        await asyncio.sleep(1.5)
        await page.keyboard.press("Enter")

        # Allow response to render and showcase
        await asyncio.sleep(4.5)
        await move_cursor(page, 520, 450, ms=600)
        await asyncio.sleep(2.0)
        await scroll_to(page, 260, wait_sec=1.5)
        await asyncio.sleep(3.0)

        # -------------------------------------------------------------
        # 1:25–1:43 (18s) — FORECAST ENGINE
        # -------------------------------------------------------------
        print("[1:25 - 1:43] Forecast Engine — Multi-factor ML & SHAP Drivers")
        fc_link = page.locator("a[href='/forecast']").first
        await click_element(page, fc_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # Select 24W horizon
        w24_btn = page.locator("button").filter(has_text="24W").first
        await click_element(page, w24_btn)
        await asyncio.sleep(1.0)

        # Click Run Forecast
        run_fc_btn = page.locator("button").filter(has_text="Run Forecast").first
        await click_element(page, run_fc_btn)
        await asyncio.sleep(2.5)

        # Hover over the interactive Plotly curve and confidence band
        await move_cursor(page, 550, 420, ms=600)
        await asyncio.sleep(2.5)
        await move_cursor(page, 750, 390, ms=600)
        await asyncio.sleep(2.5)

        # Scroll down to SHAP Feature Importance drivers
        await scroll_to(page, 650, wait_sec=1.5)
        await move_cursor(page, 500, 500, ms=600)
        await asyncio.sleep(3.5)

        # -------------------------------------------------------------
        # 1:43–1:58 (15s) — VESSEL OPTIMIZER
        # -------------------------------------------------------------
        print("[1:43 - 1:58] Vessel Optimizer — Physical Constraint Matrix")
        v_link = page.locator("a[href='/vessels']").first
        await click_element(page, v_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # Click Optimize
        opt_btn = page.locator("button").filter(has_text="Optimize").first
        await click_element(page, opt_btn)
        await asyncio.sleep(2.0)

        # Hover over recommended vessel card (Panamax)
        await move_cursor(page, 480, 320, ms=600)
        await asyncio.sleep(2.5)

        # Scroll to Vessel Feasibility Matrix (Capesize draft rejection)
        await scroll_to(page, 400, wait_sec=1.5)
        await move_cursor(page, 600, 450, ms=600)
        await asyncio.sleep(2.5)

        # Scroll to Landed Cost Breakdown
        await scroll_to(page, 800, wait_sec=1.5)
        await asyncio.sleep(2.0)

        # -------------------------------------------------------------
        # 1:58–2:09 (11s) — ROUTE INTELLIGENCE
        # -------------------------------------------------------------
        print("[1:58 - 2:09] Route Intelligence — Interactive AIS Map & Port Queue")
        r_link = page.locator("a[href='/routes']").first
        await click_element(page, r_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # Move mouse across map corridors
        await move_cursor(page, 850, 480, ms=600)
        await asyncio.sleep(2.5)

        # Click the Paradip desk chip button
        try:
            chip = page.locator(".fr24-desk-chip").filter(has_text="Paradip").first
            if await chip.is_visible():
                await click_element(page, chip)
            else:
                chips = page.locator(".fr24-desk-chip")
                if await chips.count() > 0:
                    await click_element(page, chips.first)
        except Exception as e:
            print(f"[Notice clicking port chip]: {e}")

        # Port drawer opens showing ships in queue, wait times, and draft restrictions
        await asyncio.sleep(1.5)
        await move_cursor(page, 1550, 400, ms=600)
        await asyncio.sleep(3.4)

        # -------------------------------------------------------------
        # 2:09–2:19 (10s) — RISK MONITOR
        # -------------------------------------------------------------
        print("[2:09 - 2:19] Risk Monitor — Geopolitical Chokepoint Matrix")
        rk_link = page.locator("a[href='/risk']").first
        await click_element(page, rk_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # View top risk scores & Red Sea critical card
        await move_cursor(page, 520, 260, ms=600)
        await asyncio.sleep(2.5)

        # Scroll to Maritime Chokepoint Risk Matrix
        await scroll_to(page, 450, wait_sec=1.5)
        await move_cursor(page, 620, 480, ms=600)
        await asyncio.sleep(3.0)

        # -------------------------------------------------------------
        # 2:19–2:26 (7s) — STRATEGY ENGINE
        # -------------------------------------------------------------
        print("[2:19 - 2:26] Strategy Engine — Spot vs Term Recommendation")
        st_link = page.locator("a[href='/strategy']").first
        await click_element(page, st_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        # Highlight ENTER NOW — SPOT recommendation & 82% confidence
        await move_cursor(page, 460, 240, ms=600)
        await asyncio.sleep(2.0)

        # Scroll to Forward Freight curve & comparison table
        await scroll_to(page, 380, wait_sec=1.5)
        await asyncio.sleep(1.5)

        # -------------------------------------------------------------
        # 2:26–2:32 (6s) — FINAL CLOSE
        # -------------------------------------------------------------
        print("[2:26 - 2:32] Final Close — Product Landing Page")
        home_link = page.locator("a[href='/']").first
        await click_element(page, home_link)
        await asyncio.sleep(1.0)
        await setup_helpers(page)
        await scroll_to(page, 0, wait_sec=0.8)
        await move_cursor(page, 960, 380, ms=600)

        # Ensure total duration hits 152.0s
        elapsed = time.time() - start_time
        remaining = TOTAL_DURATION - elapsed
        if remaining > 0:
            print(f"Holding on closing screen for remaining {remaining:.1f}s...")
            await asyncio.sleep(remaining)

        print("[*] Recording completed. Closing browser context to flush video...")
        await page.close()
        video_path = await page.video.path()
        await context.close()
        await browser.close()

    print(f"[+] Raw video recorded to: {video_path}")
    return video_path

def merge_audio_video(raw_video_path, audio_path, output_mp4):
    """Mux the raw Playwright video and voiceover audio using ffmpeg."""
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print("=" * 60)
    print("MERGING VIDEO AND AUDIO TRACK")
    print(f"Video: {raw_video_path}")
    print(f"Audio: {audio_path}")
    print(f"Output: {output_mp4}")
    print("=" * 60)

    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", str(raw_video_path),
        "-i", str(audio_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(output_mp4)
    ]

    print(f"Running ffmpeg command: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[Error] FFmpeg failed with code {res.returncode}:\n{res.stderr}")
        raise RuntimeError("FFmpeg merge failed")
    print(f"[+] Successfully merged final video: {output_mp4}")

def main():
    raw_video = asyncio.run(record())
    merge_audio_video(raw_video, AUDIO_FILE, FINAL_OUTPUT_MP4)
    print("\n" + "=" * 60)
    print("ALL STEPS COMPLETED!")
    print(f"Final Walkthrough MP4: {FINAL_OUTPUT_MP4}")
    print("=" * 60)

if __name__ == "__main__":
    main()
