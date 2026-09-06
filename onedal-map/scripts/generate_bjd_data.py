"""
generate_bjd_data.py
V-World API 단일 소스 기반 전국 법정동 GeoJSON 빌드 스크립트

원본 데이터: 행안부 법정동 (V-World LT_C_ADEMD_INFO, LT_C_ADRI_INFO, LT_C_ADSIGG_INFO)
대상 지역: 서울(11), 인천(23), 경기(41) — 동일 API, 동일 스키마
출력 스키마: code, name, SIG_KOR_NM, EMD_KOR_NM, _isEmdGroup

Usage:
    python scripts/generate_bjd_data.py [VWORLD_API_KEY]
    python scripts/generate_bjd_data.py [VWORLD_API_KEY] --regions 11 23 41
"""
import re
import urllib.request
import urllib.parse
import json
import os
import sys
import time
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

# 지역 코드 → 광역 이름 매핑 (SIG 매칭 실패 시 fallback)
REGION_NAMES = {
    '11': '서울',
    '28': '인천',
    '41': '경기도',
}

# 기본 대상 지역 (서울 + 인천 + 경기)
DEFAULT_REGIONS = ['11', '28', '41']

# 번지 단위 법정동 패턴: "영등포동1가", "종로2가", "충정로2가" 등
# 같은 부모 이름("영등포동", "종로")끼리 Union하여 하나의 폴리곤으로 병합
GA_PATTERN = re.compile(r'^(.+?)\d+가$')


def fetch_layer(vworld_key, layer_name, attr_filter, size=1000):
    base_url = "https://api.vworld.kr/req/data"
    all_features = []
    page = 1
    
    while True:
        params = {
            "service": "data",
            "request": "GetFeature",
            "data": layer_name,
            "key": vworld_key,
            "domain": "http://www.altari.com",
            "attrFilter": attr_filter,
            "size": str(size),
            "page": str(page),
            "format": "json"
        }
        
        query = urllib.parse.urlencode(params)
        url = f"{base_url}?{query}"
        
        print(f"Fetching {layer_name} [{attr_filter}] page {page}...")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                
                status = res_data.get("response", {}).get("status")
                if status == "NOT_FOUND":
                    break
                elif status != "OK":
                    print(f"Error fetching data: {res_data}")
                    return None
                    
                features = res_data["response"]["result"]["featureCollection"]["features"]
                all_features.extend(features)
                print(f" -> Grabbed {len(features)} features (Total: {len(all_features)})")
                
                if len(features) < size:
                    break
                    
                page += 1
                time.sleep(0.1)
        except Exception as e:
            print(f"Exception on {layer_name} page {page}: {e}")
            break
            
    return all_features


def load_env(env_path):
    """프로젝트 루트의 .env 파일에서 키=값 쌍을 읽어 dict로 반환"""
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars


def main():
    # .env 파일에서 API 키 로드
    project_root = os.path.join(os.path.dirname(__file__), '..')
    env_vars = load_env(os.path.join(project_root, '.env'))
    
    vworld_key = None
    if len(sys.argv) >= 2 and not sys.argv[1].startswith('--'):
        vworld_key = sys.argv[1]
    else:
        vworld_key = env_vars.get('vworld_kr')
    
    if not vworld_key:
        print("❌ V-World API 키를 찾을 수 없습니다.")
        print("   .env 파일에 vworld_kr=YOUR_KEY 형태로 추가하거나,")
        print("   python generate_bjd_data.py [KEY] 로 전달해주세요.")
        sys.exit(1)
    
    print(f"🔑 V-World API Key: {vworld_key[:8]}...{vworld_key[-4:]}")
    
    # --regions 옵션 파싱
    regions = DEFAULT_REGIONS
    if '--regions' in sys.argv:
        idx = sys.argv.index('--regions')
        regions = []
        for arg in sys.argv[idx + 1:]:
            if arg.startswith('--'):
                break
            regions.append(arg)
    
    print(f"\n🚀 대상 지역: {', '.join(f'{r} ({REGION_NAMES.get(r, r)})' for r in regions)}")
    
    # ============================================================
    # 1. 전체 지역 데이터 통합 Fetch
    # ============================================================
    all_sigg = []
    all_dongs = []
    all_ris = []
    
    for region_code in regions:
        region_name = REGION_NAMES.get(region_code, region_code)
        
        # 1-1. 시군구 (SiGunGu)
        print(f"\n--- [{region_name}] Fetching Si/Gun/Gu ---")
        sigg = fetch_layer(vworld_key, "LT_C_ADSIGG_INFO", f"sig_cd:like:{region_code}", size=100)
        if sigg is None:
            print(f"⚠️ {region_name} SiGunGu 데이터 가져오기 실패, 스킵합니다.")
            continue
        all_sigg.extend(sigg)
        
        # 1-2. 읍면동 (Eup/Myeon/Dong)
        print(f"\n--- [{region_name}] Fetching Eup/Myeon/Dong ---")
        dongs = fetch_layer(vworld_key, "LT_C_ADEMD_INFO", f"emd_cd:like:{region_code}")
        if dongs is None:
            print(f"⚠️ {region_name} Dong 데이터 가져오기 실패, 스킵합니다.")
            continue
        all_dongs.extend(dongs)
        
        # 1-3. 리 (Ri) — 서울/인천은 리가 거의 없으므로, 경기도(41)에서만 fetch
        if region_code == '41':
            print(f"\n--- [{region_name}] Fetching Ri ---")
            ris = fetch_layer(vworld_key, "LT_C_ADRI_INFO", f"li_cd:like:{region_code}")
            if ris is None:
                print(f"⚠️ {region_name} Ri 데이터 가져오기 실패, 스킵합니다.")
            else:
                all_ris.extend(ris)
        
    print(f"\n📊 통합 결과: {len(all_sigg)} Cities, {len(all_dongs)} Eup/Myeon/Dongs, {len(all_ris)} Ris")
    
    # ============================================================
    # 2. Terminal Node 추출 (동일 스키마: code, name, SIG_KOR_NM, EMD_KOR_NM)
    # ============================================================
    terminal_features = []
    
    # SIGG lookup table
    sigg_lookup = {}
    for f in all_sigg:
        props = f["properties"]
        sigg_lookup[props.get("sig_cd", "")] = props.get("sig_kor_nm", "")
    
    # EMD lookup table
    emd_lookup = {}
    for f in all_dongs:
        props = f["properties"]
        emd_lookup[props.get("emd_cd", "")] = props.get("emd_kor_nm", "")
    
    # Process Dongs: 읍/면 제외, ~가 번지 단위는 부모 단위로 Union 처리
    # 서울/인천에는 "영등포동1가~8가", "종로1가~6가" 등 번지 단위 법정동이 다수 존재
    # → 같은 부모 이름 그룹을 하나의 폴리곤으로 병합해 기사가 인식할 수 있는 단위로 통합

    # 1단계: 가 그룹의 부모 이름 목록 사전 구축
    ga_parents_by_sig = set()  # (sig_code, parent_name)
    for f in all_dongs:
        name = f["properties"].get("emd_kor_nm", "")
        code = f["properties"].get("emd_cd", "")
        m = GA_PATTERN.match(name)
        if m:
            sig_code = code[:5] if len(code) >= 5 else ""
            ga_parents_by_sig.add((sig_code, m.group(1)))

    # 2단계: 각 법정동을 standalone / ga_group으로 분류
    ga_groups = {}  # (sig_code, parent_name) → {geometries, rep_code, sig_code, code_prefix}
    standalone_dongs = []

    for f in all_dongs:
        props = f["properties"]
        name = props.get("emd_kor_nm", "")
        code = props.get("emd_cd", "")

        if name.endswith("읍") or name.endswith("면"):
            continue

        sig_code = code[:5] if len(code) >= 5 else ""
        m = GA_PATTERN.match(name)

        if m:
            # "영등포동1가" → 가 그룹
            parent = m.group(1)
            key = (sig_code, parent)
        elif (sig_code, name) in ga_parents_by_sig:
            # "영등포동" 자체도 같은 그룹에 포함하여 함께 Union
            parent = name
            key = (sig_code, parent)
        else:
            standalone_dongs.append(f)
            continue

        if key not in ga_groups:
            ga_groups[key] = {"geometries": [], "sig_code": sig_code, "code_prefix": code[:2], "rep_code": code}

        # 가 없는 순수 동 코드를 대표 코드로 우선 사용 (예: 영등포동 자체의 코드)
        if not m:
            ga_groups[key]["rep_code"] = code

        try:
            geom = shape(f["geometry"])
            if not geom.is_valid:
                geom = geom.buffer(0)
            ga_groups[key]["geometries"].append(geom)
        except Exception:
            print(f"Warning: invalid geometry for {name} ({code})")

    # 3단계: standalone 법정동 추가
    for f in standalone_dongs:
        props = f["properties"]
        name = props.get("emd_kor_nm", "")
        code = props.get("emd_cd", "")
        sig_code = code[:5] if len(code) >= 5 else ""
        region_prefix = code[:2] if len(code) >= 2 else ""
        sig_name = sigg_lookup.get(sig_code, REGION_NAMES.get(region_prefix, "미분류"))

        terminal_features.append({
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {
                "code": code,
                "name": name,
                "SIG_KOR_NM": sig_name,
                "EMD_KOR_NM": name,
                "_isEmdGroup": True
            }
        })

    # 4단계: ~가 그룹 Union → 단일 폴리곤으로 병합
    print(f"\n--- Merging {len(ga_groups)} ~가 groups into single polygons ---")
    merged_ga_count = 0
    for (sig_code, parent_name), group_info in ga_groups.items():
        geoms = group_info["geometries"]
        if not geoms:
            continue
        try:
            merged_geom = unary_union(geoms)
            region_prefix = group_info["code_prefix"]
            sig_name = sigg_lookup.get(sig_code, REGION_NAMES.get(region_prefix, "미분류"))

            terminal_features.append({
                "type": "Feature",
                "geometry": mapping(merged_geom),
                "properties": {
                    "code": group_info["rep_code"],
                    "name": parent_name,
                    "SIG_KOR_NM": sig_name,
                    "EMD_KOR_NM": parent_name,
                    "_isEmdGroup": True
                }
            })
            merged_ga_count += 1
        except Exception as e:
            print(f"Failed to union 가 group {parent_name}: {e}")

    print(f"   → {len(ga_groups)}개 그룹 → {merged_ga_count}개 병합 feature 생성")
            
    # Process Ris (경기도 리 단위)
    for f in all_ris:
        props = f["properties"]
        name = props.get("li_kor_nm", "")
        code = props.get("li_cd", "")
        
        emd_code = code[:8] if len(code) >= 8 else ""
        parent_emd_name = emd_lookup.get(emd_code, "알수없음")
        
        sig_code = code[:5] if len(code) >= 5 else ""
        sig_name = sigg_lookup.get(sig_code, "경기도")
        
        new_props = {
            "code": code,
            "name": name,
            "SIG_KOR_NM": sig_name,
            "EMD_KOR_NM": parent_emd_name,
            "_isEmdGroup": False
        }
        terminal_features.append({
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": new_props
        })

    # ============================================================
    # 3. 읍/면 Spatial Union (리를 합쳐서 읍/면 폴리곤 생성)
    # ============================================================
    print("\n--- Performing spatial union for Eup/Myeon groups ---")
    ris_by_emd = {}
    for f in all_ris:
        props = f["properties"]
        code = props.get("li_cd", "")
        emd_code = code[:8] if len(code) >= 8 else ""
        if emd_code not in ris_by_emd:
            ris_by_emd[emd_code] = []
        try:
            geom = shape(f["geometry"])
            if geom.is_valid:
                ris_by_emd[emd_code].append(geom)
            else:
                ris_by_emd[emd_code].append(geom.buffer(0))
        except Exception as e:
            print(f"Warning: skipped invalid geometry in Ri {code}")

    for emd_code, geoms in ris_by_emd.items():
        if not geoms:
            continue
        try:
            merged_geom = unary_union(geoms)
            geom_json = mapping(merged_geom)
            
            parent_emd_name = emd_lookup.get(emd_code, "알수없음")
            sig_code = emd_code[:5] if len(emd_code) >= 5 else ""
            sig_name = sigg_lookup.get(sig_code, "경기도")
            
            terminal_features.append({
                "type": "Feature",
                "geometry": geom_json,
                "properties": {
                    "code": emd_code,
                    "name": parent_emd_name,
                    "SIG_KOR_NM": sig_name,
                    "EMD_KOR_NM": parent_emd_name,
                    "_isEmdGroup": True
                }
            })
        except Exception as e:
            print(f"Failed to union EMD {emd_code}: {e}")

    # ============================================================
    # 4. 읍/면 (읍/면 자체 폴리곤) — 리가 없는 읍/면도 포함시키기
    # ============================================================
    # 서울/인천에는 읍/면이 드물지만, 인천 강화군 등에 존재할 수 있음
    existing_emd_codes = set()
    for f in terminal_features:
        c = f["properties"]["code"]
        if len(c) == 8:
            existing_emd_codes.add(c)
    
    for f in all_dongs:
        props = f["properties"]
        name = props.get("emd_kor_nm", "")
        code = props.get("emd_cd", "")
        
        if (name.endswith("읍") or name.endswith("면")) and code not in existing_emd_codes:
            sig_code = code[:5] if len(code) >= 5 else ""
            region_prefix = code[:2] if len(code) >= 2 else ""
            fallback_name = REGION_NAMES.get(region_prefix, "미분류")
            sig_name = sigg_lookup.get(sig_code, fallback_name)
            
            terminal_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "code": code,
                    "name": name,
                    "SIG_KOR_NM": sig_name,
                    "EMD_KOR_NM": name,
                    "_isEmdGroup": True
                }
            })

    print(f"\n✅ Total features to save: {len(terminal_features)}")
    
    # 지역별 통계
    stats = {}
    for f in terminal_features:
        prefix = f["properties"]["code"][:2]
        region_name = REGION_NAMES.get(prefix, prefix)
        stats[region_name] = stats.get(region_name, 0) + 1
    for name, count in sorted(stats.items()):
        print(f"   {name}: {count}개")
    
    # ============================================================
    # 5. 출력
    # ============================================================
    out_geojson = {
        "type": "FeatureCollection",
        "features": terminal_features
    }
    
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'mapData')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "merged_map.geojson")
    
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, ensure_ascii=False)
        
    print(f"\n🎉 Saved to {out_path} ({os.path.getsize(out_path) / 1024 / 1024:.2f} MB)")
    print("모든 feature가 동일한 스키마(code, name, SIG_KOR_NM, EMD_KOR_NM)를 갖습니다.")


if __name__ == "__main__":
    main()
