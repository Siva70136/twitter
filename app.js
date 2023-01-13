const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(4000);
    console.log("server started at http://localhost:4000");
  } catch (e) {
    console.log(`error message ${e.message}`);
  }
};

initializeDb();

const authentication = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;

        next();
      }
    });
  }
};

const convertResponseObj = (data) => {
  return {
    username: data.username,
    tweet: data.tweet,
    dateTime: data.date_time,
  };
};

const convertResponseName = (data) => {
  return {
    name: data.name,
  };
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getQuery = `SELECT * FROM user WHERE username='${username}'`;
  const data = await db.get(getQuery);

  if (data === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, data.password);
    if (isPassword === true) {
      const payload = {
        username: username,
      };
      response.status(200);
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getQuery = `SELECT * FROM user WHERE username='${username}'`;
  const data = await db.get(getQuery);

  if (data !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length <= 5) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashPassword = await bcrypt.hash(password, 10);
    const postQuery = `INSERT INTO user (name,username,password,gender) VALUES ('${name}','${username}','${hashPassword}','${gender}');`;
    const data = await db.run(postQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

app.get("/user/tweets/feed/", authentication, async (req, res) => {
  const getQuery = `SELECT * FROM tweet NATURAL JOIN user  order by date_time DESC LIMIT 4;`;
  const getObj = await db.all(getQuery);
  res.send(getObj.map((each) => convertResponseObj(each)));
});

app.get("/user/following/", authentication, async (req, res) => {
  const getQuery = `SELECT * FROM  follower LEFT JOIN user ON user.user_id=follower.following_user_id;`;
  const getObj = await db.all(getQuery);
  res.send(getObj.map((each) => convertResponseName(each)));
});

app.get("/user/followers/", authentication, async (req, res) => {
  const getQuery = `SELECT * FROM  follower LEFT JOIN user ON user.user_id=follower.follower_user_id;`;
  const getObj = await db.all(getQuery);
  res.send(getObj.map((each) => convertResponseName(each)));
});

app.get("/tweets/:tweetId/", authentication, async (req, res) => {
  const { tweetId } = req.params;
  const getQuery = `SELECT * FROM  follower CROSS JOIN reply ON reply.user_id=follower.following_user_id WHERE reply.tweet_id=${tweetId};`;
  const getObj = await db.all(getQuery);
  res.send(getObj);
});

app.post("/user/tweets/", authentication, async (req, res) => {
  const { tweet } = req.body;

  const postQuery = `INSERT INTO tweet (tweet) VALUES ('${tweet}');`;
  const data = await db.run(postQuery);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getQuery = `SELECT * FROM user WHERE username='${username}'`;
  const data = await db.get(getQuery);
  const getTweet = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetInfo = await db.get(getTweet);
  console.log(tweetInfo.user_id);
  if (tweetInfo.user_id === data.user_id) {
    const deleteQuery = `DELETE FROM user WHERE user_id='${data.user_id}'`;
    const data2 = await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
