const db = require("./database");

const init = async () => {
  await db.run(
    "CREATE TABLE Users (id INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(32));"
  );
  await db.run(
    "CREATE TABLE Friends (id INTEGER PRIMARY KEY AUTOINCREMENT, userId int, friendId int);"
  );

  // Create indexes on the Friends table
  await db.run("CREATE INDEX idx_friends_userId ON Friends (userId);");
  await db.run("CREATE INDEX idx_friends_friendId ON Friends (friendId);");

  const users = [];
  const names = ["foo", "bar", "baz"];
  for (i = 0; i < 27000; ++i) {
    let n = i;
    let name = "";
    for (j = 0; j < 3; ++j) {
      name += names[n % 3];
      n = Math.floor(n / 3);
      name += n % 10;
      n = Math.floor(n / 10);
    }
    users.push(name);
  }
  const friends = users.map(() => []);
  for (i = 0; i < friends.length; ++i) {
    const n = 10 + Math.floor(90 * Math.random());
    const list = [...Array(n)].map(() =>
      Math.floor(friends.length * Math.random())
    );
    list.forEach((j) => {
      if (i === j) {
        return;
      }
      if (friends[i].indexOf(j) >= 0 || friends[j].indexOf(i) >= 0) {
        return;
      }
      friends[i].push(j);
      friends[j].push(i);
    });
  }
  console.log("Init Users Table...");
  await Promise.all(
    users.map((un) => db.run(`INSERT INTO Users (name) VALUES ('${un}');`))
  );
  console.log("Init Friends Table...");
  await Promise.all(
    friends.map((list, i) => {
      return Promise.all(
        list.map((j) =>
          db.run(
            `INSERT INTO Friends (userId, friendId) VALUES (${i + 1}, ${
              j + 1
            });`
          )
        )
      );
    })
  );
  console.log("Ready.");
};

const search = async (req, res) => {
  const query = req.params.query;
  const userId = parseInt(req.params.userId);
  if (query === "null") {
    return res
      .status(400)
      .json({ error: "Query parameter is missing or empty" });
  }
  try {
    const results = await db.all(`
      WITH RECURSIVE connections AS (
        SELECT
          friendId,
          1 AS connection
        FROM Friends
        WHERE userId = ${userId}
        UNION
        SELECT
          f.friendId,
          c.connection + 1 AS connection
        FROM connections AS c
        JOIN Friends AS f ON c.friendId = f.userId
        WHERE c.connection < 4
      )
      SELECT
        u.id,
        u.name,
        CASE
          WHEN u.id = ${userId} THEN 0
          WHEN f.userId IS NOT NULL THEN 1
          WHEN c.friendId IS NOT NULL THEN c.connection
          ELSE 0
        END AS connection
      FROM Users AS u
      LEFT JOIN Friends AS f ON u.id = f.friendId AND f.userId = ${userId}
      LEFT JOIN connections AS c ON u.id = c.friendId
      WHERE u.name LIKE '${query}%'
      LIMIT 20;
    `);
    res.status(200).json({
      success: true,
      users: results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
};

const friend = async (req, res) => {
  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);

  try {
    // Check if the friendship already exists
    const existingFriendship = await db.all(
      `SELECT * FROM Friends WHERE (userId = ${userId} AND friendId = ${friendId}) OR (userId = ${friendId} AND friendId = ${userId})`
    );
    if (existingFriendship.length === 0) {
      // Insert the friendship into the Friends table
      await db.run(
        `INSERT OR IGNORE INTO Friends (userId, friendId) VALUES (${userId}, ${friendId})`
      );
      res.status(200).json({ success: true });
    } else {
      res.status(200).json({ success: false, message: "Friendship already exists" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const unfriend = async (req, res) => {
  const userId = parseInt(req.params.userId);
  const friendId = parseInt(req.params.friendId);

  try {
    // Delete the friendship entry from the Friends table
    await db.run(
      `DELETE FROM Friends WHERE (userId = ${userId} AND friendId = ${friendId}) OR (userId = ${friendId} AND friendId = ${userId});`
    );
    // Return a success response
    res.status(200).json({ success: true });
  } catch (err) {
    // Handle errors
    res.status(500).json({ success: false, error: err });
  }
};


module.exports = {
  init: init,
  search: search,
  friend: friend,
  unfriend: unfriend,
};
