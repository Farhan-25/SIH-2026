import os
from dotenv import load_dotenv

# Load env
load_dotenv()

def check_apis():
    print("Testing APIs...\n")
    
    # GFW
    print("1. GFW_API_TOKEN:")
    if not os.getenv("GFW_API_TOKEN"):
        print("   [FAIL] Missing GFW_API_TOKEN in .env")
    else:
        print("   [OK] Present in .env")

    # TwelveData
    print("\n2. TWELVEDATA_API_KEY:")
    if not os.getenv("TWELVEDATA_API_KEY"):
        print("   [FAIL] Missing TWELVEDATA_API_KEY in .env")
    else:
        try:
            from src.data.twelvedata_client import TwelveDataClient
            td = TwelveDataClient()
            bdi = td.fetch_latest_bdi()
            if bdi is not None:
                print("   [OK] TwelveData API is working.")
            else:
                print("   [WARN] TwelveData API returned None, but didn't throw an error. Check rate limits or symbol.")
        except Exception as e:
            print(f"   [FAIL] TwelveData API failed: {e}")

    # FRED
    print("\n3. FRED_API_KEY:")
    if not os.getenv("FRED_API_KEY"):
        print("   [FAIL] Missing FRED_API_KEY in .env")
    else:
        try:
            from src.data.fred_client import FREDClient
            fred = FREDClient()
            gdp = fred.get_global_gdp_indicator()
            if gdp is not None:
                print("   [OK] FRED API is working.")
            else:
                print("   [WARN] FRED API returned None.")
        except Exception as e:
            print(f"   [FAIL] FRED API failed: {e}")
            
    # Mapbox
    print("\n4. VITE_MAPBOX_TOKEN:")
    mapbox_token = os.getenv("VITE_MAPBOX_TOKEN")
    if not mapbox_token:
        print("   [FAIL] Missing VITE_MAPBOX_TOKEN in .env")
    else:
        try:
            import requests
            url = f"https://api.mapbox.com/styles/v1/mapbox/streets-v11?access_token={mapbox_token}"
            r = requests.get(url)
            if r.status_code == 200:
                print("   [OK] Mapbox API is working.")
            else:
                print(f"   [FAIL] Mapbox API failed: HTTP {r.status_code} - {r.text}")
        except Exception as e:
            print(f"   [FAIL] Mapbox API failed: {e}")

    print("\n5. DATAGOV_API_KEY:")
    if not os.getenv("DATAGOV_API_KEY"):
        print("   [WARN] DATAGOV_API_KEY is empty in .env")
    else:
        print("   [OK] Present in .env")

    print("\n6. COMMODITIES_API_KEY:")
    if not os.getenv("COMMODITIES_API_KEY"):
        print("   [WARN] COMMODITIES_API_KEY is empty in .env")
    else:
        print("   [OK] Present in .env")
        
    print("\n7. AISSTREAM_API_KEY:")
    if not os.getenv("AISSTREAM_API_KEY"):
        print("   [FAIL] Missing AISSTREAM_API_KEY in .env")
    else:
        print("   [OK] Present in .env")

if __name__ == "__main__":
    check_apis()
