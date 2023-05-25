const mysql = require('sync-mysql');
require('dotenv').config();
const moment = require('moment');

let db: any;

try {
  db = new mysql({
    host: process.env.MY_SQL_HOST,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE,
  });
} catch (error) {
  console.error('error ', error);
}

const returnPosts = (user_id: number, callback: any, errorCallback: any) => {
  try {
    const result = db.query(
      'SELECT post.id, post.title, post.content, post.image, post.user_id, post.post_format FROM post ORDER BY post.created_at DESC'
    );
    const mappedResults = result.map((r: any) => {
      const selectAllResult = db.query(
        'SELECT COUNT(*) AS like_count FROM post_like WHERE post_id = ?',
        [r.id]
      );
      let selectHasLike = [];
      if (user_id !== null) {
        selectHasLike = db.query(
          'SELECT id FROM post_like WHERE user_id = ? AND post_id = ?',
          [user_id, r.id]
        );
      }

      let isVideo = false;
      if (r.post_format.includes('mp4')) {
        isVideo = true;
      } else {
        isVideo = false;
      }

      console.log("test",selectHasLike)

      return {
        id: r.id,
        title: r.title,
        content: r.content,
        imageName: r.image,
        user_id: r.user_id,
        likes: selectAllResult[0].like_count,
        hasLiked: selectHasLike.length > 0,
        isVideo: isVideo,
      };
    });
    callback(mappedResults);
  } catch (error) {
    errorCallback(error);
  }
};

const returnUserPosts = (
  user_id: number,
  callback: any,
  errorCallback: any
) => {
  try {
    const result = db.query('SELECT * FROM post WHERE user_id = ?', [user_id]);
    const mappedResults = result.map((r: any) => {
      const selectAllResult = db.query(
        'SELECT COUNT(*) AS like_count FROM post_like WHERE post_id = ?',
        [r.id]
      );
      let selectHasLike = [];
      if (user_id !== null) {
        selectHasLike = db.query(
          'SELECT id FROM post_like WHERE user_id = ? AND post_id = ?',
          [user_id, r.id]
        );
      }

      let isVideo = false;
      if (r.post_format.includes('mp4')) {
        isVideo = true;
      } else {
        isVideo = false;
      }
      return {
        id: r.id,
        title: r.title,
        content: r.content,
        imageName: r.image,
        user_id: r.user_id,
        likes: selectAllResult[0].like_count,
        hasLiked: selectHasLike.length > 0,
        isVideo: isVideo,
      };
    });
    callback(mappedResults);
  } catch (error) {
    errorCallback(error);
  }
};

const createPost = (
  title: string,
  content: string,
  imageName: string,
  user_id: string,
  post_format: string,
  callback: any,
  errorCallback: any
) => {
  try {
    const result = db.query(
      'INSERT INTO post (title, content, image, user_id, post_format) VALUES (?, ?, ?, ?, ?)',
      [title, content, imageName, user_id, post_format]
    );
    callback(result.insertId);
  } catch (error) {
    errorCallback(error);
  }
};

const deletePost = (id: number, callback: any, errorCallback: any) => {
  let imageName: string;
  try {
    const selectResult = db.query('SELECT image FROM post WHERE post.id = ?', [
      id,
    ]);
    imageName = selectResult[0].image;
    const deleteResult = db.query('DELETE FROM post WHERE post.id = ?', [id]);
    if (deleteResult.affectedRows != 1) {
      errorCallback();
    } else {
      callback(imageName);
    }
  } catch (error) {
    errorCallback(error);
  }
};

const updatePost = (
  id: number,
  title: string,
  content: string,
  imageName: string,
  post_format: string,
  callback: any,
  errorCallback: any
) => {
  const query = `UPDATE post SET title = ?, content = ?${
    imageName !== '' ? ', image = ?' : ''
  }, post_format = ? WHERE post.id = ?`;
  try {
    const updateResult = db.query(
      query,
      imageName != '' ? [title, content, imageName, post_format ,id] : [title, content, id]
    );
    callback();
  } catch (error) {
    errorCallback(error);
  }
};

const selectImageNameById = (id: number, callback: any, errorCallback: any) => {
  try {
    const result = db.query('SELECT post.image FROM post WHERE post.id = ?', [
      id,
    ]);
    callback(result[0].image);
  } catch (error) {
    errorCallback(error);
  }
};

const createUser = (
  username: string,
  password: string,
  callback: any,
  errorCallback: any
) => {
  try {
    const selectResult = db.query(
      'SELECT username FROM user WHERE username = ?',
      [username]
    );
    if (selectResult.length > 0) {
      errorCallback('Username Exists');
    } else {
      const insertResult = db.query(
        'INSERT INTO user (username, password) VALUES (?, ?)',
        [username, password]
      );
      callback(insertResult.insertId);
    }
  } catch (error) {
    errorCallback(error);
  }
};

const login = (
  username: string,
  password: string,
  callback: any,
  errorCallback: any
) => {
  try {
    const result = db.query(
      'SELECT id FROM user WHERE username = ? AND password = ?',
      [username, password]
    );
    if (result.length > 0) {
      callback(result[0].id);
    }
  } catch (error) {
    errorCallback(error);
  }
};

const storeAuthToken = (
  id: number,
  authToken: string,
  callback: any,
  errorCallback: any
) => {
  try {
    const result = db.query(
      'INSERT INTO auth_tokens (user_id, auth_token) VALUES (?, ?)',
      [id, authToken]
    );
    callback();
  } catch (error) {
    errorCallback(error);
  }
};

const selectUserIdFromAuthToken = (
  authToken: string,
  callback: any,
  errorCallback: any
) => {
  try {
    const selectResult = db.query(
      'SELECT user_id, created_at FROM auth_tokens WHERE auth_token = ?',
      [authToken]
    );
    if (moment(selectResult[0].created_at).add(8, 'hours').isBefore(moment())) {
      const deleteResult = db.query(
        'DELETE FROM auth_tokens WHERE auth_token = ?',
        [authToken]
      );
    } else {
      callback(selectResult[0].user_id);
    }
  } catch (error) {
    errorCallback(error);
  }
};

const likePost = (
  post_id: number,
  user_id: number,
  callback: any,
  errorCallback: any
) => {
  try {
    const selectResult = db.query(
      'SELECT id FROM post_like WHERE post_id = ? AND user_id = ?',
      [post_id, user_id]
    );
    if (selectResult.length > 0) {
      db.query('DELETE FROM post_like WHERE post_id = ? AND user_id = ?', [
        post_id,
        user_id,
      ]);
    } else {
      db.query('INSERT INTO post_like (post_id, user_id) VALUES (?, ?)', [
        post_id,
        user_id,
      ]);
    }
    const selectAllResult = db.query(
      'SELECT COUNT(*) AS like_count FROM post_like WHERE post_id = ?',
      [post_id]
    );
    callback(selectAllResult[0].like_count);
  } catch (error) {
    errorCallback(error);
  }
};

const addComment = (
  post_id: number,
  user_id: number,
  comment: string,
  username: string,
  reply_id: number,
  callback: any,
  errorCallback: any
) => {
  try {
    const insertResult = db.query(
      'INSERT INTO comment (post_id, user_id, comment, username, reply_id) VALUES (?, ?, ?, ?, ?)',
      [post_id, user_id, comment, username, reply_id]
    );
    callback(insertResult.insertId);
  } catch (error) {
    errorCallback(error);
  }
};

const sortComments = (comments: any) => {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].reply_id !== null) {
      for (let j = 0; j < comments.length; j++) {
        if (
          comments[j].id === comments[i].reply_id &&
          typeof comments[i].parent_id === 'undefined'
        ) {
          if (typeof comments[j].children === 'undefined') {
            comments[j].children = [];
          }
          comments[i].parent_id = comments[j].id;
          comments[j].children.push(comments[i]);
        }
      }
    }
  }

  const commentsWithChildren = comments.filter((c: any) => {
    //filter all comments so only comments with no reply are left
    return c.reply_id === null;
  });

  return commentsWithChildren;
};

const selectComments = (post_id: number, callback: any, errorCallback: any) => {
  try {
    const selectResult = db.query('SELECT * FROM comment WHERE post_id = ?', [
      post_id,
    ]);
    const commentWithChildren = sortComments(selectResult);

    callback(commentWithChildren);
  } catch (error) {
    errorCallback(error);
  }
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
  likePost: likePost,
  addComment: addComment,
  selectComments: selectComments,
  returnUserPosts: returnUserPosts,
};
