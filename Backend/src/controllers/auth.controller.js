const userModel = require("../models/user.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")

const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
}

/**
 * Register user
 */
async function registerUserController(req, res) {

    console.log("🔥 REGISTER API HIT")
    console.log("📦 Register body:", req.body)

    const { username, email, password } = req.body

    if (!username || !email || !password) {
        return res.status(400).json({
            message: "Please provide username, email and password"
        })
    }

    const isUserAlreadyExists = await userModel.findOne({
        $or: [{ username }, { email }]
    })

    if (isUserAlreadyExists) {
        console.log("❌ User already exists")

        return res.status(400).json({
            message: "Account already exists with this email address or username"
        })
    }

    const hash = await bcrypt.hash(password, 10)

    const user = await userModel.create({
        username,
        email,
        password: hash
    })

    console.log("✅ USER CREATED:", user.email)

    const token = jwt.sign(
        {
            id: user._id,
            username: user.username
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "1d"
        }
    )

    res.cookie("token", token, cookieOptions)

    return res.status(201).json({
        message: "User registered successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    })
}


/**
 * Login user
 */
async function loginUserController(req, res) {

    console.log("🔥 LOGIN API HIT")
    console.log("📦 Login body:", req.body)

    const { email, password } = req.body

    const user = await userModel.findOne({ email })

    console.log("👤 User:", user ? "FOUND" : "NOT FOUND")

    if (!user) {
        console.log("❌ User not found")

        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const isPasswordValid = await bcrypt.compare(
        password,
        user.password
    )

    console.log(
        "🔐 Password:",
        isPasswordValid ? "VALID" : "INVALID"
    )

    if (!isPasswordValid) {
        return res.status(400).json({
            message: "Invalid email or password"
        })
    }

    const token = jwt.sign(
        {
            id: user._id,
            username: user.username
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "1d"
        }
    )

    console.log("🎟️ Token created")

    res.cookie("token", token, cookieOptions)

    console.log("🍪 Cookie set")

    return res.status(200).json({
        message: "User loggedIn successfully.",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    })
}


/**
 * Logout user
 */
async function logoutUserController(req, res) {

    const token = req.cookies.token

    if (token) {
        await tokenBlacklistModel.create({
            token
        })
    }

    res.clearCookie("token", cookieOptions)

    return res.status(200).json({
        message: "User logged out successfully"
    })
}


/**
 * Get current logged in user
 */
async function getMeController(req, res) {

    const user = await userModel.findById(req.user.id)

    return res.status(200).json({
        message: "User details fetched successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    })
}


module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}