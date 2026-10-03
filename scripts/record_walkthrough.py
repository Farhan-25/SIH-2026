import asyncio
import subprocess
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

TOTAL_DURATION = 269.78  # matches WhatsApp Audio 2026-09-26 (00:04:29.78)
AUDIO_FILE = r"C:\Users\Farhan\Downloads\WhatsApp Audio 2026-09-26 at 23.58.43.mp4"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "artifacts_video"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_VIDEO_DIR = OUTPUT_DIR / "raw"
RAW_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
FINAL_OUTPUT_MP4 = OUTPUT_DIR / "freightiq_sih_walkthrough_final.mp4"

INTRO_IFRAME_HTML = """
<iframe id="intro-motion-frame" src="/intro_motion.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:none;z-index:999999;transition:opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1);"></iframe>
"""

OUTRO_HTML = """
<div id="ai-cinematic-outro" style="position:fixed;inset:0;z-index:999999;background:#030712;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;font-family:Inter,system-ui,sans-serif;transition:opacity 0.8s ease;">
  <div style="position:absolute;inset:0;background-image:url('/video_assets/outro_branding.jpg');background-size:cover;background-position:center;filter:brightness(1.05);"></div>
  <div style="position:relative;z-index:10;margin-top:40px;display:flex;flex-direction:column;align-items:center;gap:12px;">
    <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(15,23,42,0.85);border:1px solid rgba(14,165,233,0.7);padding:8px 24px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:2px;color:#38bdf8;text-transform:uppercase;box-shadow:0 0 30px rgba(14,165,233,0.4);backdrop-filter:blur(12px);">
      <span style="width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 10px #38bdf8;"></span>
      Smart India Hackathon 2026 • SIH26006
    </div>
  </div>
</div>
"""


async def wait_until(start_time: float, target_sec: float, label: str = ""):
    """Hold until wall-clock recording time hits the voiceover cue."""
    remaining = target_sec - (time.time() - start_time)
    if remaining > 0.05:
        if label:
            print(f"  sync wait {remaining:.1f}s → {label}")
        await asyncio.sleep(remaining)


async def setup_helpers(page):
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
            cursor.style.zIndex = '99999999';
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
    await page.evaluate(f"window.__moveCursor({x}, {y}, {ms})")
    await asyncio.sleep(ms / 1000.0)


async def scroll_to(page, y, wait_sec=1.2):
    await page.evaluate(f"window.scrollTo({{ top: {y}, behavior: 'smooth' }})")
    await asyncio.sleep(wait_sec)


async def click_element(page, loc):
    try:
        box = await loc.bounding_box()
        if box:
            x = box["x"] + box["width"] / 2
            y = box["y"] + box["height"] / 2
            await page.evaluate(f"window.__moveCursor({x}, {y}, 350)")
            await asyncio.sleep(0.35)
            await page.evaluate("window.__pulseCursor()")
            await asyncio.sleep(0.08)
        await loc.click()
    except Exception as e:
        print(f"[Click notice]: {e}")
        try:
            await loc.click(force=True)
        except Exception:
            pass


async def goto_app(page, path):
    loc = page.locator(f"a[href='{path}']").first
    if await loc.count() > 0:
        await click_element(page, loc)
    else:
        await page.goto(f"http://127.0.0.1:5173{path}")
    await asyncio.sleep(0.6)
    await setup_helpers(page)


async def record():
    print("=" * 60)
    print("FREIGHTIQ WALKTHROUGH — synchronized to 4:29.78 narration")
    print("=" * 60)

    for f in RAW_VIDEO_DIR.glob("*.webm"):
        try:
            f.unlink()
        except Exception:
            pass

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--enable-font-antialiasing",
            ],
        )
        # 4K UHD recording with 2x Device Scale Factor (Razor-sharp text & vectors)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=2,
            record_video_dir=str(RAW_VIDEO_DIR),
            record_video_size={"width": 3840, "height": 2160},
        )
        page = await context.new_page()

        print("[Setup] Loading landing page...")
        await page.goto("http://127.0.0.1:5173/")
        await page.evaluate("() => localStorage.clear()")
        await page.reload()
        await asyncio.sleep(1.0)
        await setup_helpers(page)

        start_time = time.time()
        print("[*] Recording clock started")

        # ─── 0:00–0:11 DYNAMIC ANIMATED INTRO: BEAT 1 (India Dry Bulk Imports) ───
        print("[0:00] Motion Graphic Intro: Beat 1 (100M+ Tonnes Bulk Imports & East Coast Radar)")
        await page.evaluate(f"() => {{ document.body.insertAdjacentHTML('beforeend', `{INTRO_IFRAME_HTML}`); }}")
        await move_cursor(page, 450, 480, ms=700)
        await wait_until(start_time, 11.0, "0:11 Beat 2 Million Dollar Decisions")

        # ─── 0:11–0:21 DYNAMIC ANIMATED INTRO: BEAT 2 (Decisions & Spot Exposure) ───
        print("[0:11] Motion Graphic Intro: Beat 2 (Multi-Million Decisions & Spot Exposure)")
        await page.evaluate("""() => {
            const frame = document.getElementById('intro-motion-frame');
            if (frame && frame.contentWindow && frame.contentWindow.setIntroBeat) {
                frame.contentWindow.setIntroBeat(2);
            }
        }""")
        await move_cursor(page, 480, 520, ms=600)
        await wait_until(start_time, 21.0, "0:21 Beat 3 Chokepoints & Monsoons")

        # ─── 0:21–0:33 DYNAMIC ANIMATED INTRO: BEAT 3 (Chokepoints, Monsoons & Draft) ───
        print("[0:21] Motion Graphic Intro: Beat 3 (Suez Chokepoint, Monsoon Swells & 8m Haldia Draft)")
        await page.evaluate("""() => {
            const frame = document.getElementById('intro-motion-frame');
            if (frame && frame.contentWindow && frame.contentWindow.setIntroBeat) {
                frame.contentWindow.setIntroBeat(3);
            }
        }""")
        await move_cursor(page, 520, 520, ms=600)
        await wait_until(start_time, 32.5, "0:32.5 Fade Out Intro")

        # ─── 0:33–0:43 PRODUCT REVEAL → ENTER COMMAND CENTER ───
        print("[0:33] Smooth dissolve out intro → Reveal FreightIQ Platform")
        await page.evaluate("""() => {
            const frame = document.getElementById('intro-motion-frame');
            if (frame) {
                if (frame.contentWindow && frame.contentWindow.fadeOutIntro) {
                    frame.contentWindow.fadeOutIntro();
                }
                frame.style.opacity = '0';
                setTimeout(() => frame.remove(), 900);
            }
        }""")
        await asyncio.sleep(0.9)
        await scroll_to(page, 0, wait_sec=0.5)
        btn = page.locator("button").filter(has_text="Enter Command Center").first
        await click_element(page, btn)
        await asyncio.sleep(0.5)
        await setup_helpers(page)
        await page.locator("input[placeholder='Priya Sharma']").first.fill("Priya Sharma")
        await asyncio.sleep(0.4)
        await page.locator("input[placeholder='you@company.com']").first.fill("judge@sih.gov.in")
        await asyncio.sleep(0.4)
        await page.locator("input[type='password']").first.fill("admin123")
        await click_element(page, page.locator("button[type='submit']").first)
        await wait_until(start_time, 43.0, "0:43 Onboarding")

        # ─── 0:43–0:55 ONBOARDING ───
        print("[0:43] Onboarding — Ports, Corridors, Cargo")
        await setup_helpers(page)
        try:
            await click_element(page, page.locator("button").filter(has_text="Select All").first)
        except Exception:
            await click_element(page, page.locator("text='Paradip Port'").first)
        await asyncio.sleep(0.6)
        await click_element(page, page.locator("button").filter(has_text="Next").first)
        await asyncio.sleep(0.6)
        await click_element(page, page.locator("text='Newcastle (Australia)'").first)
        await asyncio.sleep(0.5)
        await click_element(page, page.locator("button").filter(has_text="Next").first)
        await asyncio.sleep(0.5)
        await click_element(page, page.locator("text='Thermal Coal'").first)
        await asyncio.sleep(0.3)
        await click_element(page, page.locator("text='Coking Coal'").first)
        await asyncio.sleep(0.3)
        await click_element(page, page.locator("text='Iron Ore'").first)
        await asyncio.sleep(0.4)
        await click_element(page, page.locator("button").filter(has_text="Launch Dashboard").first)
        await wait_until(start_time, 55.0, "0:55 Command Centre")

        # ─── 0:55–1:25 COMMAND CENTRE ───
        print("[0:55] Command Centre — Market & Operational Indicators")
        await setup_helpers(page)
        await move_cursor(page, 380, 180, ms=500)
        await asyncio.sleep(3.5)
        await move_cursor(page, 720, 180, ms=500)
        await asyncio.sleep(3.5)
        await move_cursor(page, 1080, 180, ms=500)
        await asyncio.sleep(3.0)
        await scroll_to(page, 420, wait_sec=1.2)
        await move_cursor(page, 640, 500, ms=500)
        await asyncio.sleep(5.0)
        await scroll_to(page, 820, wait_sec=1.2)
        await move_cursor(page, 960, 460, ms=500)
        await asyncio.sleep(4.0)
        await wait_until(start_time, 85.0, "1:25 AI Copilot")

        # ─── 1:25–1:46 AI COPILOT ───
        print("[1:25] AI Copilot — Natural Language Market Briefing")
        await goto_app(page, "/copilot")
        copilot_input = page.locator("input[placeholder*='Ask Copilot']").first
        await click_element(page, copilot_input)
        await copilot_input.fill("Why is Newcastle to Paradip freight rising, and what is Red Sea risk?")
        await asyncio.sleep(1.0)
        await page.keyboard.press("Enter")
        await asyncio.sleep(6.0)
        await move_cursor(page, 540, 430, ms=500)
        await asyncio.sleep(3.0)
        await scroll_to(page, 240, wait_sec=1.0)
        await wait_until(start_time, 106.0, "1:46 Freight Forecasting")

        # ─── 1:46–2:29 FREIGHT FORECASTING ENGINE ───
        print("[1:46] Freight Forecasting Engine")
        await goto_app(page, "/forecast")
        await click_element(page, page.locator("button").filter(has_text="4W").first)
        await asyncio.sleep(0.8)
        await click_element(page, page.locator("button").filter(has_text="24W").first)
        await asyncio.sleep(0.8)
        await click_element(page, page.locator("button").filter(has_text="Run Forecast").first)
        await asyncio.sleep(3.5)
        await move_cursor(page, 560, 410, ms=500)
        await asyncio.sleep(5.0)
        await move_cursor(page, 820, 380, ms=500)
        await asyncio.sleep(5.0)
        await scroll_to(page, 620, wait_sec=1.2)
        await move_cursor(page, 520, 500, ms=500)
        await asyncio.sleep(8.0)
        await scroll_to(page, 900, wait_sec=1.0)
        await wait_until(start_time, 149.0, "2:29 Vessel Optimiser")

        # ─── 2:29–3:03 VESSEL OPTIMISER (HALDIA THEN GANGAVARAM) ───
        print("[2:29] Vessel Optimiser — Testing Haldia 8m Draft Constraint")
        await goto_app(page, "/vessels")
        dest_select = page.locator("select.form-control").nth(1)
        try:
            await dest_select.select_option(value="IN_HLD")
        except Exception:
            try:
                await dest_select.select_option(label="Haldia Dock Complex")
            except Exception as e:
                print(f"[Haldia select notice]: {e}")
        await asyncio.sleep(0.6)
        
        # Click Optimize for Haldia
        opt_btn = page.locator("button").filter(has_text="Optimize").first
        await click_element(page, opt_btn)
        await asyncio.sleep(2.5)
        await scroll_to(page, 320, wait_sec=1.0)
        await move_cursor(page, 620, 480, ms=500)
        print("  showing Haldia draft constraint & lighterage calculations...")
        await asyncio.sleep(6.5)

        # Switch destination to Gangavaram Deepwater Port
        print("[2:48] Switching destination to Gangavaram Port")
        await scroll_to(page, 0, wait_sec=0.8)
        try:
            await dest_select.select_option(value="IN_GNV")
        except Exception:
            try:
                await dest_select.select_option(label="Gangavaram Port")
            except Exception as e:
                print(f"[Gangavaram select notice]: {e}")
        await asyncio.sleep(0.8)
        
        # Click Optimize for Gangavaram
        await click_element(page, opt_btn)
        await asyncio.sleep(2.5)
        print("  showing Gangavaram deepwater feasible vessels & landed cost...")
        await move_cursor(page, 480, 290, ms=500)
        await asyncio.sleep(3.0)
        await scroll_to(page, 340, wait_sec=1.0)
        await move_cursor(page, 560, 480, ms=500)
        await wait_until(start_time, 183.0, "3:03 Route Intelligence Map")

        # ─── 3:03–3:14 ROUTE INTELLIGENCE MAP ───
        print("[3:03] Route Intelligence Map — Live Corridor & Vessels")
        await goto_app(page, "/routes")
        await asyncio.sleep(1.5)
        
        # Click Paradip Port Chip to zoom in & display queue intelligence
        chip = page.locator(".fr24-desk-chip").filter(has_text="Paradip").first
        if await chip.count() > 0 and await chip.is_visible():
            print("  clicking Paradip port chip...")
            await click_element(page, chip)
            await asyncio.sleep(2.0)

        # Search for MV BROAD BONNIE to open live telemetry card
        search_input = page.locator(".fr24-search-input").first
        if await search_input.count() > 0:
            print("  selecting MV BROAD BONNIE to display vessel trajectory & telemetry...")
            await click_element(page, search_input)
            await search_input.fill("Bonnie")
            await asyncio.sleep(0.8)
            dropdown_item = page.locator(".dropdown-item").first
            if await dropdown_item.count() > 0:
                await click_element(page, dropdown_item)
                await asyncio.sleep(2.0)
        
        await move_cursor(page, 240, 420, ms=600)
        await wait_until(start_time, 194.0, "3:14 Corridor Risk Monitor")

        # ─── 3:14–3:39 CORRIDOR RISK MONITOR (ALL 4 TABS) ───
        print("[3:14] Risk Monitor — Tab 1: Chokepoints & Geopolitics")
        await goto_app(page, "/risk")
        await asyncio.sleep(1.0)
        await move_cursor(page, 520, 250, ms=500)
        await asyncio.sleep(4.0)

        # Tab 2: FinBERT Sentiment
        print("[3:20] Risk Monitor — Tab 2: FinBERT Sentiment")
        tab_sentiment = page.locator("button").filter(has_text="FinBERT Sentiment").first
        if await tab_sentiment.count() > 0:
            await click_element(page, tab_sentiment)
            await asyncio.sleep(1.0)
            await move_cursor(page, 480, 360, ms=500)
            await asyncio.sleep(4.0)

        # Tab 3: Live News Feed
        print("[3:26] Risk Monitor — Tab 3: Live News Feed")
        tab_news = page.locator("button").filter(has_text="Live News Feed").first
        if await tab_news.count() > 0:
            await click_element(page, tab_news)
            await asyncio.sleep(1.0)
            await move_cursor(page, 620, 420, ms=500)
            await asyncio.sleep(4.0)

        # Tab 4: Corridor & Weather
        print("[3:32] Risk Monitor — Tab 4: Corridor & Weather")
        tab_weather = page.locator("button").filter(has_text="Corridor & Weather").first
        if await tab_weather.count() > 0:
            await click_element(page, tab_weather)
            await asyncio.sleep(1.0)
            await scroll_to(page, 250, wait_sec=0.8)
            await move_cursor(page, 520, 460, ms=500)

        await wait_until(start_time, 219.0, "3:39 Strategy Engine")

        # ─── 3:39–4:10 STRATEGY & TIMING ENGINE ───
        print("[3:39] Strategy & Timing Engine — Procurement Decisions")
        await goto_app(page, "/strategy")
        await move_cursor(page, 460, 230, ms=500)
        await asyncio.sleep(5.0)
        await scroll_to(page, 360, wait_sec=1.1)
        await move_cursor(page, 700, 420, ms=500)
        await asyncio.sleep(7.0)
        await scroll_to(page, 620, wait_sec=1.0)
        await wait_until(start_time, 250.0, "4:10 AI Outro Branding")

        # ─── 4:10–4:30 AI CINEMATIC OUTRO SLATE ───
        print("[4:10] AI Outro Branding Slate — FreightIQ Closing")
        await page.evaluate(f"() => {{ document.body.insertAdjacentHTML('beforeend', `{OUTRO_HTML}`); }}")
        await move_cursor(page, 960, 500, ms=800)
        await wait_until(start_time, TOTAL_DURATION, "end of narration")

        print("[*] Closing browser to flush video...")
        await page.close()
        video_path = await page.video.path()
        await context.close()
        await browser.close()

    print(f"[+] Raw video recorded: {video_path}")
    return video_path


def merge_audio_video(raw_video_path, audio_path, output_mp4):
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print("=" * 60)
    print("MERGING VIDEO + NARRATION")
    print(f"Video: {raw_video_path}")
    print(f"Audio: {audio_path}")
    print(f"Output: {output_mp4}")
    print("=" * 60)
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", str(raw_video_path),
        "-i", str(audio_path),
        "-filter:v", "crop=1920:1080:0:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "14",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "320k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(output_mp4),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stderr[-2000:])
        raise RuntimeError("FFmpeg merge failed")
    print(f"[+] Final video: {output_mp4}")


def main():
    raw_video = asyncio.run(record())
    merge_audio_video(raw_video, AUDIO_FILE, FINAL_OUTPUT_MP4)
    print("\nALL STEPS COMPLETED!")
    print(f"Final MP4: {FINAL_OUTPUT_MP4}")


if __name__ == "__main__":
    main()
