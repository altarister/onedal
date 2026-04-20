require('dotenv').config({path: '/Users/seungwookkim/reps/onedal/onedal-web/server/.env'});
const key = process.env.KAKAO_REST_API_KEY;

const REGION_MAP = {
    "서울": "서울", "서울특별시": "서울",
    "경기": "경기", "경기도": "경기",
    "인천": "인천", "인천광역시": "인천",
    "강원": "강원", "강원도": "강원",
    "충남": "충남", "충청남도": "충남",
    "충북": "충북", "충청북도": "충북",
    "대전": "대전", "대전광역시": "대전",
    "세종": "세종", "세종특별자치시": "세종",
    "경북": "경북", "경상북도": "경북",
    "경남": "경남", "경상남도": "경남",
    "대구": "대구", "대구광역시": "대구",
    "부산": "부산", "부산광역시": "부산",
    "울산": "울산", "울산광역시": "울산",
    "전북": "전북", "전라북도": "전북",
    "전남": "전남", "전라남도": "전남",
    "광주": "광주", "광주광역시": "광주",
    "제주": "제주", "제주특별자치도": "제주", "제주도": "제주"
};

async function testQuery(originalQuery, type, fallbackQuery) {
    const url = `https://dapi.kakao.com/v2/local/search/${type}.json?query=${encodeURIComponent(fallbackQuery)}`;
    const res = await fetch(url, { headers: { "Authorization": `KakaoAK ${key}` } });
    const data = await res.json();
    if (data.documents && data.documents.length > 0) {
        let bestDoc = null;
        const words = originalQuery.trim().split(/\s+/);
        const expectedRegion = REGION_MAP[words[0]];

        for (const doc of data.documents) {
            if (expectedRegion) {
                const addrRegion = doc.address_name ? doc.address_name.split(' ')[0] : '';
                const roadRegion = doc.road_address && doc.road_address.address_name ? doc.road_address.address_name.split(' ')[0] : '';
                
                if (addrRegion !== expectedRegion && roadRegion !== expectedRegion) {
                    console.log(` -> [REJECTED] original: '${originalQuery}', matched: '${doc.address_name || ''}' / '${(doc.road_address&&doc.road_address.address_name) || ''}' (expected: ${expectedRegion})`);
                    continue;
                }
            }
            bestDoc = doc;
            break;
        }

        if (bestDoc) {
            console.log(` -> [ACCEPTED] Match: ${bestDoc.address_name} (x: ${bestDoc.x}, y: ${bestDoc.y})`);
        } else {
            console.log(` -> No matches passed filter.`);
        }
    } else {
        console.log(` -> No match from Kakao`);
    }
}

async function run() {
    await testQuery('경기 광주시 경안동 204-5 홈플러스 광주점', 'keyword', '홈플러스 광주점');
    await testQuery('경기 광주시 경안동 204-5 홈플러스 광주점', 'keyword', '경기 광주시 홈플러스 광주점');
}
run();
