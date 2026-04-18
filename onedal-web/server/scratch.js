const Database = require("better-sqlite3");
const db = new Database(":memory:");

db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY,
        car_type INTEGER DEFAULT 1,
        car_fuel TEXT DEFAULT 'GASOLINE',
        car_hipass BOOLEAN DEFAULT 1,
        fuel_price INTEGER DEFAULT 1600,
        fuel_efficiency REAL DEFAULT 10.0,
        default_priority TEXT DEFAULT 'RECOMMEND' CHECK(default_priority IN ('RECOMMEND', 'TIME', 'DISTANCE')),
        avoid_toll BOOLEAN DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO users VALUES ('user1');
    INSERT INTO user_settings(user_id) VALUES ('user1');
`);

try {
    const updateStmt = db.prepare(`
        UPDATE user_settings 
        SET car_type = COALESCE(@carType, car_type),
            car_fuel = COALESCE(@carFuel, car_fuel),
            car_hipass = COALESCE(@carHipass, car_hipass),
            fuel_price = COALESCE(@fuelPrice, fuel_price),
            fuel_efficiency = COALESCE(@fuelEfficiency, fuel_efficiency),
            default_priority = COALESCE(@defaultPriority, default_priority),
            avoid_toll = COALESCE(@avoidToll, avoid_toll)
        WHERE user_id = @userId
    `);
    
    updateStmt.run({
        userId: 'user1',
        carType: 2,
        carFuel: null,
        carHipass: null,
        fuelPrice: null,
        fuelEfficiency: null,
        defaultPriority: "TIME",
        avoidToll: null
    });
    console.log("Success!");
    console.log(db.prepare("SELECT * FROM user_settings").get());
} catch(e) {
    console.error("Error:", e);
}
