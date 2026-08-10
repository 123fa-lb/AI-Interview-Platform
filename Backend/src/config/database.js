const mongoose = require("mongoose")
const dns = require("dns")

dns.setServers(["8.8.8.8", "1.1.1.1"])

async function connectToDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("Connected to Database")
    }
    catch (err) {
        console.log("Database Connection Error:", err)
    }
}

module.exports = connectToDB