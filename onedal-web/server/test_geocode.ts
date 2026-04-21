import { config } from "dotenv";
config();
import { geocodeAddress } from "./src/routes/kakaoUtil";

async function run() {
    const key = process.env.KAKAO_REST_API_KEY || "";
    console.log("Key length:", key.length);
    const res = await geocodeAddress(key, "경기 광주시 오포읍 오포로 538-21 오포물류센터");
    console.log("Result:", res);
}
run();
