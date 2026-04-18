import * as dotenv from 'dotenv';
dotenv.config();

const KAKAO_API_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const headers = { "Authorization": `KakaoAK ${process.env.KAKAO_REST_API_KEY}`, "Content-Type": "application/json" };

async function testPriority(priority: string) {
    const url = `${KAKAO_API_URL}?origin=127.001698,37.582336&destination=127.027610,37.497912&priority=${priority}&car_type=1`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log(`Priority [${priority}]: ` + (data.routes ? "SUCCESS" : JSON.stringify(data)));
}

async function run() {
    await testPriority("RECOMMEND"); // 추천경로
    await testPriority("TIME"); // 최단시간
    await testPriority("DISTANCE"); // 최단거리
}

run();
