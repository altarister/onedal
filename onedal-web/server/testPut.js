require("dotenv").config({ path: __dirname + "/.env" });
const jwt = require("jsonwebtoken");
console.log("Secret:", process.env.JWT_SECRET ? "exists" : "missing");
// Get actual user id from DB
const Database = require("better-sqlite3");
const db = new Database("local.db");
const user = db.prepare("SELECT id FROM users LIMIT 1").get();

if (!user) {
    console.error("No user in DB");
    process.exit(1);
}

const token = jwt.sign(
    { id: user.id, email: "test@test.com", name: "Test", role: "USER" },
    process.env.JWT_SECRET || "fallback",
    { expiresIn: "1h" }
);

fetch("http://localhost:4000/api/settings", {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ carType: 2, defaultPriority: "TIME" })
}).then(async res => {
    console.log(res.status, await res.text());
}).catch(console.error);
