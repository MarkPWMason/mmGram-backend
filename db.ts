const mysql = require('mysql');
require('dotenv').config();
const moment = require('moment');

let db: any;

try {
  db = mysql.createConnection({
    host: process.env.MY_SQL_HOST,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE,
  });

  db.connect();
} catch (error) {
  console.error('error ', error);
}

const returnPosts = (callback: any, errorCallback: any) => {
  console.log('RETURN POST');
  db.query(
    'SELECT post.id, post.title, post.content, post.image, post.user_id FROM post ORDER BY post.created_at DESC',
    function (error: any, results: any) {
      if (error) {
        errorCallback(error);
      }
      console.log('results 23', results);
      const mappedResults = results.map((r: any) => {
        return {
          id: r.id,
          title: r.title,
          content: r.content,
          imageName: r.image,
          user_id: r.user_id,
        };
      });
      callback(mappedResults);
    }
  );
};

const createPost = (
  title: string,
  content: string,
  imageName: string,
  user_id: string,
  callback: any,
  errorCallback: any
) => {
  console.log('user id', user_id);
  db.query(
    'INSERT INTO post (title, content, image, user_id) VALUES (?, ?, ?, ?)',
    [title, content, imageName, user_id],
    function (error: any, result: any) {
      if (error) {
        errorCallback(error);
      } else {
        callback(result.insertId);
      }
    }
  );
};

const deletePost = (id: number, callback: any, errorCallback: any) => {
  let imageName: string;
  db.query(
    'SELECT image FROM post WHERE post.id = ?',
    id,
    function (error: any, result: any) {
      if (error) {
        errorCallback(error);
      } else {
        //callback doesn't return needs to be in an else
        imageName = result[0].image;
        console.log('result', result[0]);
        db.query(
          'DELETE FROM post WHERE post.id = ?',
          id,
          function (error: any, result: any) {
            if (error) {
              errorCallback(error);
            }
            if (result.affectedRows != 1) {
              errorCallback();
            } else {
              callback(imageName);
            }
          }
        );
      }
    }
  );
};

const updatePost = (
  id: number,
  title: string,
  content: string,
  imageName: string,
  callback: any,
  errorCallback: any
) => {
  const query = `UPDATE post SET title = ?, content = ?${ imageName !== '' ? ', image = ?' : ''} WHERE post.id = ?`;
  console.log(query)
  db.query(
    query,
    imageName != '' ? [title, content, imageName, id] : [title, content, id],
    function (error: any, result: any) {
      if (error) {
        errorCallback(error);
      }
      console.log('re', result);
      if (result.affectedRows != 1) {
        errorCallback('Incorrect row updated');
      } else {
        callback();
      }
    }
  );
};

const selectImageNameById = (id: number, callback: any, errorCallback: any) => {
  console.log('id val', id);
  db.query(
    'SELECT post.image FROM post WHERE post.id = ?',
    id,
    function (error: any, result: any) {
      console.log('error selke', error);
      if (error) {
        errorCallback(error);
      } else {
        callback(result[0].image);
      }
    }
  );
};

const createUser = (
  username: string,
  password: string,
  callback: any,
  errorCallback: any
) => {
  db.query(
    'SELECT username FROM user WHERE username = ?',
    username,
    function (error: any, result: any) {
      if (error) {
        errorCallback(error);
      } else {
        if (result.length > 0) {
          //username returned so username exists
          errorCallback('Username Exists');
        } else {
          db.query(
            'INSERT INTO user (username, password) VALUES (?, ?)',
            [username, password],
            function (error: any, result: any) {
              if (error) {
                errorCallback(error);
              } else {
                callback(result.insertId);
              }
            }
          );
        }
      }
    }
  );
};

const login = (
  username: string,
  password: string,
  callback: any,
  errorCallback: any
) => {
  db.query(
    'SELECT id FROM user WHERE username = ? AND password = ?',
    [username, password],
    function (error: any, result: any) {
      console.log(error);
      if (error) {
        errorCallback(error);
      } else if (result.length > 0) {
        console.log(result);
        callback(result[0].id);
      } else {
        errorCallback('User not found');
      }
    }
  );
};

const storeAuthToken = (
  id: number,
  authToken: string,
  callback: any,
  errorCallback: any
) => {
  db.query(
    'INSERT INTO auth_tokens (user_id, auth_token) VALUES (?, ?)',
    [id, authToken],
    function (error: any, result: any) {
      console.log('Auth Token Error: ', error);
      if (error) {
        errorCallback(error);
      } else {
        callback();
      }
    }
  );
};

const selectUserIdFromAuthToken = (
  authToken: string,
  callback: any,
  errorCallback: any
) => {
  console.log('auth token', authToken);
  db.query(
    'SELECT user_id, created_at FROM auth_tokens WHERE auth_token = ?',
    authToken,
    function (error: any, result: any) {
      console.log('printingresult', result, error, result.length);
      if (error) {
        errorCallback(error);
      } else if (result.length != 1) {
        console.log('test');
        //no auth token
        //in case there is more than 1 delete all auth tokens in here
        errorCallback('User not found');
      } else {
        //check if the token is within the time
        //get the created_at time + 8hrs if its after now then token has expired
        if (moment(result[0].created_at).add(8, 'hours').isBefore(moment())) {
          console.log('twas before');
          db.query(
            'DELETE auth_token FROM auth_tokens WHERE auth_token = ?',
            authToken,
            function (error: any, result: any) {
              if (error) {
                errorCallback(error);
              } else {
                errorCallback('Token Expired');
              }
            }
          );
        } else {
          console.log('sending back id');
          //its valid return just the id
          callback(result[0].user_id);
        }
      }
    }
  );
};

module.exports = {
  returnPosts: returnPosts,
  createPost: createPost,
  deletePost: deletePost,
  updatePost: updatePost,
  selectImageNameById: selectImageNameById,
  createUser: createUser,
  storeAuthToken: storeAuthToken,
  login: login,
  selectUserIdFromAuthToken: selectUserIdFromAuthToken,
};
