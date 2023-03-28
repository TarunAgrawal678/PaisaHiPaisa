const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
// app.use(cookieParser());
const mysql = require("mysql");
const uuid = require("uuid");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");

const app = express();
const port = 3000;
const saltRounds = 10;
const jwtSecret = "my_secret";

// Configure middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware for parsing cookies
app.use(cookieParser());

// Configure Express to receive the value in JSON
app.use(express.urlencoded({ extended: "false" }));
app.use(express.json());

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "root",
  password: "root123",
  database: "paisahipaisa",
});

// other imports
app.set("view engine", "hbs");
const path = require("path");
const publicDir = path.join(__dirname, "./views/assets");
app.use(express.static(publicDir));

// Authenticate User
function authenticateUser(req, res, next) {
  const token = req.cookies.token;
  if (token) {
    jwt.verify(token, jwtSecret, (err, decodedToken) => {
      if (err) {
        res.sendStatus(401);
      } else {
        req.userId = decodedToken.userId;
        next();
      }
    });
  } else {
    res.sendStatus(401);
  }
}

// Authenticate admin
function authenticateAdmin(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send("Unauthorized1");
  }
  jwt.verify(token, jwtSecret, (err, decodedToken) => {
    if (err) {
      return res.status(401).send("Unauthorized2");
    }
    req.adminId = decodedToken.adminId;
    next();
  });
}

// User -----------------------------------------------------------------------

// Create user
app.post("/users/", (req, res) => {
  const { name, password, state, city, mobile_number } = req.body;

  // Generate user ID
  const userId = `${state.substring(0, 2)}-${city.substring(0, 2)}-${uuid
    .v4()
    .substring(0, 3)}`;
  // Hash password
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      // Add user to database

      pool.query(
        "INSERT INTO users SET ?",
        {
          name,
          password: hash,
          state,
          city,
          mobile_number,
          user_id: userId,
          wallet_balance: 0,
        },
        (err, results) => {
          if (err) {
            console.error(err);
            res.sendStatus(500);
          } else {
            res.sendStatus(200);
          }
        }
      );
    }
  });
});

// login page connection
app.get("/", (req, res) => {
  res.render("index");
});

// Login users
app.post("/login/", (req, res) => {
  const { name, password } = req.body;

  pool.query("SELECT * FROM users WHERE name = ?", name, (err, results) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else if (results.length === 0) {
      res.sendStatus(401);
    } else {
      const user = results[0];
      bcrypt.compare(password, user.password, (err, match) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
        } else if (!match) {
          res.sendStatus(401);
        } else {
          const token = jwt.sign({ userId: user.user_id }, jwtSecret);
          res.cookie("token", token, { httpOnly: true }); // set the token in the cookie
          res.redirect("/user"); // redirect to the user page
        }
      });
    }
  });
});

// Route for the user page
app.get("/user", authenticateUser, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const userId = decodedToken.userId;
    // Render the user.hbs template with the user data
    pool.query("SELECT * FROM numbers", (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        res.render("user", { userId, numbers: results });
      }
    });
  } else {
    res.redirect("/login");
  }
});

// Numbers -----------------------------------------------------------------------

// Generate  numbers
app.post("/numbers/", (req, res) => {
  const { value } = req.body;
  pool.query(
    "INSERT INTO numbers SET ?",
    {
      value,
    },
    (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    }
  );
});

// Update wallet balance
app.post("/wallet", (req, res) => {
  const { amount, type, user_id } = req.body;
  const status = "wallet";
  if (type !== "credit" && type !== "debit") {
    return res.sendStatus(400);
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      connection.beginTransaction((err) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
          connection.release();
        } else {
          const query =
            "UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?";
          const values = [type === "credit" ? amount : -amount, user_id];

          connection.query(query, values, (err, results) => {
            if (err) {
              console.error(err);
              connection.rollback(() => {
                res.sendStatus(500);
                connection.release();
              });
            } else {
              const query = "INSERT INTO transactions SET ?";
              const values = { user_id: user_id, amount, type, status };
              connection.query(query, values, (err, results) => {
                if (err) {
                  console.error(err);
                  connection.rollback(() => {
                    res.sendStatus(500);
                    connection.release();
                  });
                } else {
                  connection.commit((err) => {
                    if (err) {
                      console.error(err);
                      connection.rollback(() => {
                        res.sendStatus(500);
                        connection.release();
                      });
                    } else {
                      res.sendStatus(200);
                      connection.release();
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
});

// Get user wallet balance
app.get("/wallet/", authenticateUser, (req, res) => {
  pool.query(
    "SELECT wallet_balance FROM users WHERE user_id = ?",
    req.userId,
    (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        res.json({ balance: results[0].wallet_balance });
      }
    }
  );
});

// Bet on the number
app.post("/user/bet", authenticateUser, (req, res) => {
  const { bet, value, status } = req.body;

  if (bet < 10) {
    return res.sendStatus(400);
  }

  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      connection.beginTransaction((err) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
          connection.release();
        } else {
          const query = "UPDATE numbers SET bet = bet + ? WHERE value = ?";
          const values = [bet, value];

          connection.query(query, values, (err, results) => {
            if (err) {
              console.error(err);
              connection.rollback(() => {
                res.sendStatus(500);
                connection.release();
              });
            } else {
              const query = "INSERT INTO bets SET ?";
              const values = { user_id: req.userId, bet, value };
              connection.query(query, values, (err, results) => {
                if (err) {
                  console.error(err);
                  connection.rollback(() => {
                    res.sendStatus(500);
                    connection.release();
                  });
                } else {
                  const deduct = -bet;
                  const query1 =
                    "UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?";
                  const values1 = [deduct, (user_id = req.userId)];
                  connection.query(query1, values1, (err, results) => {
                    if (err) {
                      console.error(err);
                      connection.rollback(() => {
                        res.sendStatus(500);
                        connection.release();
                      });
                    } else {
                      connection.commit((err) => {
                        if (err) {
                          console.error(err);
                          connection.rollback(() => {
                            res.sendStatus(500);
                            connection.release();
                          });
                        }
                      });
                    }
                  });

                  const amount = bet;
                  const type = "debit";
                  const query2 = "INSERT INTO transactions SET ?";
                  const values2 = { user_id: req.userId, type, amount, status };
                  connection.query(query2, values2, (err, results) => {
                    if (err) {
                      console.error(err);
                      connection.rollback(() => {
                        res.sendStatus(500);
                        connection.release();
                      });
                    } else {
                      connection.commit((err) => {
                        if (err) {
                          console.error(err);
                          connection.rollback(() => {
                            res.sendStatus(500);
                            connection.release();
                          });
                        } else {
                          res.sendStatus(200);
                          connection.release();
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
});

// Number fetching
// app.get("/numbers/", (req, res) => {
//   pool.query("SELECT * FROM numbers", (err, results) => {
//     if (err) {
//       console.error(err);
//       res.sendStatus(500);
//     } else {
//       res.render("number", { numbers: results });
//     }
//   });
// });

// Get user transactions
// app.get("", (req, res) => {
//   pool.query(
//     "SELECT * FROM transactions WHERE user_id = ?",

//     (err, results) => {
//       if (err) {
//         console.error(err);
//         res.sendStatus(500);
//       } else {
//         res.render(transactions);
//       }
//     }
//   );
// });

// Route for /transaction
app.get("/transactions", authenticateAdmin, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const adminId = decodedToken.adminId;
    // Fetch data from the "users" table
    pool.query(
      "SELECT transactions.*, users.name, users.mobile_number FROM transactions LEFT JOIN users ON transactions.user_id = users.user_id",
      (err, results) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
        } else {
          // Render the manageusers.hbs template with the user data
          res.render("transactions", { adminId, transactions: results });
        }
      }
    );
  } else {
    res.redirect("/adminui/");
  }
});

// Route for /transaction
app.get("/bets", authenticateAdmin, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const adminId = decodedToken.adminId;
    // Fetch data from the "users" table
    pool.query(
      "SELECT bets.*, users.name, users.mobile_number FROM bets LEFT JOIN users ON bets.user_id = users.user_id",
      (err, results) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
        } else {
          // Render the manageusers.hbs template with the user data
          res.render("bets", { adminId, bets: results });
        }
      }
    );
  } else {
    res.redirect("/adminui/");
  }
});

// Admin -----------------------------------------------------------------------

// Create admin
app.post("/admins/", (req, res) => {
  const { name, password, city, mobile_number } = req.body;

  // Generate user ID
  const adminId = `${name.substring(0, 2)}-${city.substring(0, 2)}-${uuid
    .v4()
    .substring(0, 3)}`;
  // Hash password
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      // Add Admin to database

      pool.query(
        "INSERT INTO admins SET ?",
        {
          name,
          password: hash,
          city,
          mobile_number,
          admin_id: adminId,
        },
        (err, results) => {
          if (err) {
            console.error(err);
            res.sendStatus(500);
          } else {
            res.sendStatus(200);
          }
        }
      );
    }
  });
});

//admin login page connection
app.get("/admin", (req, res) => {
  res.render("admin");
});

// Login admin
app.post("/login/admins", (req, res) => {
  const { name, password } = req.body;
  pool.query("SELECT * FROM admins WHERE name = ?", name, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Internal Server Error");
    }
    if (results.length === 0) {
      return res.status(401).send("Unauthorized");
    }
    const admin = results[0];
    bcrypt.compare(password, admin.password, (err, match) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Internal Server Error");
      }
      if (!match) {
        return res.status(401).send("Unauthorized");
      }
      const token = jwt.sign({ adminId: admin.admin_id }, jwtSecret, {
        expiresIn: "1h",
      });
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 3600000,
      }); // set the token in the cookie
      res.redirect("/adminui"); // redirect to the user page
    });
  });
});

// Route for the Admin page
app.get("/adminui", authenticateAdmin, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const adminId = decodedToken.adminId;
    // Render the user.hbs template with the user data
    pool.query("SELECT * FROM numbers", (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        res.render("adminui", { adminId, numbers: results });
      }
    });
  } else {
    res.redirect("/login/admins");
  }
});

// Create user
app.post("/updateuser/:id", (req, res) => {
  const { name, state, city, mobile_number } = req.body;
  const id = req.params.id;

  // Add user to database
  pool.query(
    "UPDATE users SET name = ?, state = ?, city = ?, mobile_number = ? WHERE id = ?",
    [name, state, city, mobile_number, id],
    (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    }
  );
});

// Route for /manageusers
app.get("/manageusers", authenticateAdmin, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const adminId = decodedToken.adminId;
    // Fetch data from the "users" table
    pool.query("SELECT * FROM users", (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        // Render the manageusers.hbs template with the user data
        res.render("manageusers", { adminId, users: results });
      }
    });
  } else {
    res.redirect("/adminui/");
  }
});

// Route for /manageusers
app.get("/managenumbers", authenticateAdmin, (req, res) => {
  const token = req.cookies.token;
  if (token) {
    const decodedToken = jwt.verify(token, jwtSecret);
    const adminId = decodedToken.adminId;
    // Fetch data from the "users" table
    pool.query("SELECT * FROM numbers", (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        // Render the manageusers.hbs template with the user data
        res.render("managenumbers", { adminId, numbers: results });
      }
    });
  } else {
    res.redirect("/adminui");
  }
});

// render for edit user
app.get("/edituser", (req, res) => {
  res.render("edituser");
});

// render for create user
app.get("/createuser", (req, res) => {
  res.render("createuser");
});

app.get("/edituser/:id", (req, res) => {
  const userid = req.params.id;
  pool.query(`SELECT * FROM users WHERE id = ${userid}`, (err, results) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      // Render the editusers.hbs template with the user data
      const user = results[0];
      res.render("edituser", { user });
      console.log(results);
    }
  });
});

app.get("/deleteuser/:id", (req, res) => {
  const userid = req.params.id;
  pool.query(`DELETE FROM users WHERE id = ${userid}`, (err, results) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      // user delete pop up
      res.redirect("/manageusers");
    }
  });
});

app.get("/userhistory/:id", (req, res) => {
  const userid = req.params.id;
  pool.query(
    `SELECT transactions.* FROM users LEFT JOIN transactions ON transactions.user_id = users.user_id WHERE users.id = ${userid}`,
    (err, results) => {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      } else {
        // Render the editusers.hbs template with the user data
        // const user = results[0];
        res.render("userhistory", { transactions: results });
        // res.json(results);
        // console.log(results);
      }
    }
  );
});

// ("SELECT bets.*, users.name, users.mobile_number FROM bets LEFT JOIN users ON bets.user_id = users.user_id");

// app.get("/userhistory/:id", (req, res) => {
//   const userid = req.params.id;
//   pool.query(`SELECT * FROM user WHERE id = ${userid}`, (err, results) => {
//     if (err) {
//       console.error(err);
//       res.sendStatus(500);
//     } else {
//       // Render the editusers.hbs template with the user data
//       const user = results[0];
//       pool.query();
//       res.render("edituser", { user });
//       console.log(results);
//     }
//   });
// });
// Logout admin
app.get("/logoutadmin", (req, res) => {
  res.clearCookie("token");
  res.redirect("/admin");
});
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
