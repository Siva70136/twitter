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
  const { username } = req;
  const id = await db.get(
    `SELECT user_id from user WHERE username='${username}'`
  );
  const userId = id.user_id;

  const getQuery = `SELECT * FROM tweet INNER JOIN user ON user.user_id=tweet.user_id WHERE tweet.user_id IN (SELECT following_user_id FROM  follower WHERE follower_user_id=${userId})  order by date_time DESC LIMIT 4;`;
  const getObj = await db.all(getQuery);
  console.log(getObj);
  res.send(getObj.map((each) => convertResponseObj(each)));
});

app.get("/user/following/", authentication, async (req, res) => {
  const { username } = req;
  const id = await db.get(
    `SELECT user_id from user WHERE username='${username}'`
  );
  //console.log(id);
  const userId = id.user_id;

  const getQuery = `SELECT name FROM user where user_id IN (SELECT following_user_id FROM  follower WHERE follower_user_id=${userId});`;
  const getObj = await db.all(getQuery);

  res.send(getObj);
});
app.get("/user/followers/", authentication, async (req, res) => {
  const { username } = req;
  const id = await db.get(
    `SELECT user_id from user WHERE username='${username}'`
  );
  const userId = id.user_id;
  const getQuery = `SELECT name FROM user where user_id IN (SELECT follower_user_id FROM  follower WHERE following_user_id=${userId});`;
  const getObj = await db.all(getQuery);
  console.log(getObj);
  res.send(getObj);
});

app.get("/tweets/:tweetId", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  try {
    // Get the user_id of the logged-in user
    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const user = await db.get(userQuery);
    const userId = user.user_id;

    // Check if the logged-in user is following the owner of the tweet
    const tweetOwnerQuery = `
      SELECT user_id 
      FROM tweet 
      WHERE tweet_id = ${tweetId}
      AND user_id IN (
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id = ${userId}
      )`;

    const tweetOwner = await db.get(tweetOwnerQuery);

    // Scenario 1: If the logged-in user is not following the tweet owner
    if (tweetOwner === undefined) {
      response.status(401).send("Invalid Request");
      return;
    }

    // Scenario 2: If the logged-in user is following the tweet owner, retrieve tweet details
    const tweetQuery = `
      SELECT tweet.tweet, 
             tweet.date_time AS dateTime,
             (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
             (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies
      FROM tweet
      WHERE tweet.tweet_id = ${tweetId}`;
    
    const tweetDetails = await db.get(tweetQuery);

    // Format the response as required
    response.send({
      tweet: tweetDetails.tweet,
      likes: tweetDetails.likes,
      replies: tweetDetails.replies,
      dateTime: tweetDetails.dateTime,
    });
  } catch (error) {
    console.error(error.message);
    response.status(500).send("Server Error");
  }
});


app.get("/tweets/:tweetId/replies/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  try {
    // Get the user_id of the logged-in user
    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const user = await db.get(userQuery);
    const userId = user.user_id;

    // Check if the logged-in user is following the owner of the tweet
    const tweetOwnerQuery = `
      SELECT user_id 
      FROM tweet 
      WHERE tweet_id = ${tweetId}
      AND user_id IN (
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id = ${userId}
      )`;

    const tweetOwner = await db.get(tweetOwnerQuery);

    // Scenario 1: If the logged-in user is not following the tweet owner
    if (tweetOwner === undefined) {
      response.status(401).send("Invalid Request");
      return;
    }

    // Scenario 2: If the logged-in user is following the tweet owner, return the replies
    const repliesQuery = `
      SELECT user.name, reply.reply 
      FROM reply
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${tweetId}`;

    const replies = await db.all(repliesQuery);

    // Format the response to match the desired structure
    const formattedReplies = replies.map((reply) => ({
      name: reply.name,
      reply: reply.reply,
    }));

    response.send({ replies: formattedReplies });
  } catch (error) {
    console.error(error.message);
    response.status(500).send("Server Error");
  }
});

app.get("/tweets/:tweetId/likes/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  
  try {
    // Get the user_id of the logged-in user
    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const user = await db.get(userQuery);
    const userId = user.user_id;
    
    // Check if the logged-in user is following the owner of the tweet
    const tweetOwnerQuery = `
      SELECT user_id 
      FROM tweet 
      WHERE tweet_id = ${tweetId}
      AND user_id IN (
        SELECT following_user_id 
        FROM follower 
        WHERE follower_user_id = ${userId}
      )`;
    
    const tweetOwner = await db.get(tweetOwnerQuery);
    
    if (tweetOwner === undefined) {
      response.status(401).send("Invalid Request");
      return;
    }
    
    // Get the list of usernames who liked the tweet
    const likesQuery = `
      SELECT user.username 
      FROM like
      INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ${tweetId}`;
    
    const likes = await db.all(likesQuery);
    
    // Extract usernames
    const likedUsernames = likes.map((like) => like.username);
    
    // Send the response
    response.send({ likes: likedUsernames });
  } catch (error) {
    console.log(error.message);
    response.status(500).send("Server Error");
  }
});


app.get("/user/tweets/", authentication, async (req, res) => {
  const { username } = req;
  const id = await db.get(`SELECT * from user WHERE username='${username}'`);
  const userId = id.user_id;
  //console.log(userId);
  const getQuery = `SELECT tweet.tweet AS tweet, 
       COUNT(DISTINCT reply.reply_id) AS replies,
       COUNT(DISTINCT like.like_id) AS likes ,
       tweet.date_time AS dateTime
        FROM tweet 
        INNER JOIN reply ON tweet.tweet_id = reply.tweet_id 
        INNER JOIN like ON tweet.tweet_id = like.tweet_id 
        WHERE tweet.user_id = ${userId} 
        GROUP BY tweet.tweet_id;`;
  const data = await db.all(getQuery);
  console.log(data);
  res.send(data);
});

app.post("/user/tweets/", authentication, async (req, res) => {
  const { tweet } = req.body;

  const postQuery = `INSERT INTO tweet (tweet) VALUES ('${tweet}');`;
  const data = await db.run(postQuery);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  try {
    // Get the user_id of the logged-in user
    const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const user = await db.get(userQuery);
    const userId = user.user_id;

    // Check if the tweet belongs to the logged-in user
    const tweetOwnerQuery = `
      SELECT user_id 
      FROM tweet 
      WHERE tweet_id = ${tweetId}`;
    
    const tweetOwner = await db.get(tweetOwnerQuery);

    // Scenario 1: If the tweet belongs to another user, respond with 401
    if (tweetOwner === undefined || tweetOwner.user_id !== userId) {
      response.status(401).send("Invalid Request");
      return;
    }

    // Scenario 2: If the tweet belongs to the logged-in user, proceed to delete it
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
    await db.run(deleteTweetQuery);

    // Respond with a confirmation message
    response.send("Tweet Removed");
  } catch (error) {
    console.error(error.message);
    response.status(500).send("Server Error");
  }
});


module.exports = app;
