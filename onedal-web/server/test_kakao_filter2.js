require('dotenv').config({path: '/Users/seungwookkim/reps/onedal/onedal-web/server/.env'});
const key = process.env.KAKAO_REST_API_KEY;

async function testQuery(type, query) {
    const url = `https://dapi.kakao.com/v2/local/search/${type}.json?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Authorization": `KakaoAK ${key}` } });
    const data = await res.json();
    if (data.documents && data.documents.length > 0) {
        console.log(`[${type}] ${query} -> Match: ${data.documents[0].address_name || data.documents[0].place_name} (x: ${data.documents[0].x}, y: ${data.documents[0].y})`);
    } else {
        console.log(`[${type}] ${query} -> No match`);
    }
}

async function run() {
    await testQuery('keyword', '경기 광주 홈플러스');
    await testQuery('keyword', '홈플러스 경기광주점');
    await testQuery('keyword', '경기 광주시 경안동 홈플러스');
}
run();
