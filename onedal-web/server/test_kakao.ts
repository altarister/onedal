import { config } from "dotenv";
config();
async function run() {
    const apiKey = process.env.KAKAO_REST_API_KEY || "";
    const getHeaders = () => ({ "Authorization": `KakaoAK ${apiKey}`, "Content-Type": "application/json" });
    
    const queries = [
        { type: "address", text: "경기 광주시 오포읍 오포로 538-21" },
        { type: "keyword", text: "경기 광주시 오포읍 오포로 538-21 오포물류센터" },
        { type: "address", text: "경기 광주시 오포읍 오포로 538-21 오포물류센터" },
        { type: "keyword", text: "538-21 오포물류센터" },
        { type: "keyword", text: "경기 광주시 오포읍 오포물류센터" }
    ];

    for (const q of queries) {
        const url = `https://dapi.kakao.com/v2/local/search/${q.type}.json?query=${encodeURIComponent(q.text)}`;
        const res = await fetch(url, { headers: getHeaders() });
        const data = await res.json();
        console.log(`[${q.type}] ${q.text} -> docs: ${data.documents?.length}`);
    }
}
run();
