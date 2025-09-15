const port = 3000
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const initializePassport = require('./passportConfig');
const pool = require('./db');
require("dotenv").config();
const pgSession = require('connect-pg-simple')(session);
const cors = require("cors");
const { validate: isUUID } = require("uuid");
const http = require('http');
const socketManager = require('./socketManager');

const app = express();
const server = http.createServer(app);
const sessionMiddleware = session({
  store: new pgSession({
    pool: pool, // your existing pg pool
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year
  }
})
socketManager(server,sessionMiddleware);

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));


const GoogleStrategy = require("passport-google-oauth20").Strategy;

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // check if user exists
      const result = await pool.query(
        "SELECT * FROM users WHERE google_id = $1",
        [profile.id]
      );

      let user;
      if (result.rows.length > 0) {
        user = result.rows[0];
      } else {
        // create new user
        const insertResult = await pool.query(
          "INSERT INTO users (google_id, email, username) VALUES ($1, $2, $3) RETURNING *",
          [profile.id, profile.emails[0].value, profile.displayName]
        );
        user = insertResult.rows[0];
      }

      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));



// Serialize/deserialize user for sessions
passport.serializeUser((user, done) => {
  done(null, user.id); // or user.google_id
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});



initializePassport(passport);

app.use(express.urlencoded({ extended: false }));


// Test DB route
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Example protected route
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.send(`Hello ${req.user.username}`);
});

// Kick off Google login
app.post("/auth/google", async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // payload contains email, name, picture, sub (Google user ID)
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;

    // check DB
    let result = await pool.query("SELECT * FROM users WHERE google_id = $1", [googleId]);
    let user;

    if (result.rows.length > 0) {
      user = result.rows[0];
    } else {
      const insert = await pool.query(
        "INSERT INTO users (google_id, email, username) VALUES ($1, $2, $3) RETURNING *",
        [googleId, email, name]
      );
      user = insert.rows[0];
    }

    // send user info or issue your own session/JWT
    res.json({ user });

  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google callback route
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    // At this point, user is authenticated
    // You can redirect to frontend with a token
    res.redirect("http://localhost:5173/home"); // your React app
  }
);

app.get("/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ user: null });
  }
});

app.post('/logout', function(req, res, next){
  req.logout(function(err) {
    if (err) { return next(err); }
  });
});

app.post('/newroom', async function(req,res,next){
  console.log(req.user.id);
  console.log(req.user.email);
  const insert = await pool.query(
      "INSERT INTO rooms (owner_id) VALUES ($1) RETURNING *",
        [req.user.id]
    );
    const room = insert.rows[0];
    res.json(room)
})

app.get('/getroom/:id', async function(req,res,next){
  const roomID = req.params.id;
  if (!isUUID(roomID)) {
      return res.status(400).json({ error: "Invalid room ID format" });
    }
  const result = await pool.query(
      "SELECT * FROM rooms WHERE id=$1",[roomID]
    )
  if(result.rows.length===0){
    return res.status(404).json({error: "Room not found."})
  }
  res.json(result.rows[0]);
})