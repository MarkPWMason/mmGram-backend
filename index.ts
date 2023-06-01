const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const dbObj = require('./db');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const randomImageName = (bytes = 32) =>
  crypto.randomBytes(bytes).toString('hex');

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

let s3: any;
if (
  typeof accessKey !== 'undefined' &&
  typeof secretAccessKey !== 'undefined'
) {
  s3 = new S3Client({
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretAccessKey,
    },
    region: bucketRegion,
  });
}

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

const corsOptions = {
  origin: '*',
};

app.use(cors(corsOptions));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get('/', bodyParser.json(), async (req: any, res: any) => {
  const user_id = req.query.user_id;

  dbObj.returnPosts(
    user_id,
    async (results: any) => {
      for (const post of results) {
        const getObjectParams = {
          Bucket: bucketName,
          Key: post.imageName,
        };

        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        post.imageUrl = url;
      }

      res.set('Content-Type', 'application/json');
      res.status(200);
      res.write(JSON.stringify(results));
      res.send();
    },
    (error: any) => {
      console.error(error);
      res.status(500);
    }
  );
});

app.post('/createpost', upload.single('image'), async (req: any, res: any) => {
  const title = req.body.title;
  const content = req.body.content;
  const user_id = req.body.user_id;
  const auth_token = req.body.auth_token;
  let post_format: any;
  if (req.file) {
    post_format = req.file.mimetype;
  } else {
    res.status(400);
  }
  if (
    req.body.title !== '' &&
    req.body.content !== '' &&
    typeof post_format !== 'undefined'
  ) {
    dbObj.selectUserIdFromAuthToken(
      auth_token,
      async () => {
        if (
          typeof req.file !== 'undefined' &&
          typeof req.file.buffer !== 'undefined'
        ) {
          // const buffer = await sharp(req.file.buffer)
          //   .resize({ height: 500, width: 500, fit: 'cover' })
          //   .toBuffer();

          const imageName = randomImageName();
          const params = {
            Bucket: bucketName,
            Key: imageName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          };
          const command = new PutObjectCommand(params);
          await s3.send(command);
          dbObj.createPost(
            title,
            content,
            imageName,
            user_id,
            post_format,
            async (id: any) => {
              const getObjectParams = {
                Bucket: bucketName,
                Key: imageName,
              };

              const command = new GetObjectCommand(getObjectParams);
              const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
              res.status(200);
              res.write(
                JSON.stringify({
                  id: id,
                  imageUrl: url,
                  filetype: post_format,
                })
              );
              res.send();
            },
            (error: any) => {
              console.error(error);
              res.status(500);
            }
          );
        }
      },
      (error: any) => {
        if (error === 'Token Expired') {
          res.status(403);
        } else if (error === 'User not found') {
          res.status(404);
        } else {
          res.status(500);
        }
        res.send();
      }
    );
  }
});

app.delete('/deletepost', bodyParser.json(), async (req: any, res: any) => {
  const id = req.body.id;
  const user_id = req.body.user_id;
  const auth_token = req.body.auth_token;

  dbObj.validateAuthToken(
    auth_token,
    user_id,
    id,
    async () => {
      dbObj.deletePost(
        id,
        async (imageName: string) => {
          const params = {
            Bucket: bucketName,
            Key: imageName,
          };
          const command = new DeleteObjectCommand(params);
          await s3.send(command);

          res.set('Content-Type', 'application/json');
          res.status(200);
          res.send();
        },
        (error: any) => {
          console.error(error);
          res.status(500);
        }
      );
    },
    () => {
      res.status(403);
      res.send();
    }
  );
});

app.post(
  '/updatepost',
  upload.single('image'),
  bodyParser.json(),
  async (req: any, res: any) => {
    console.log('body', req.body);
    console.log('file', req.file);
    const user_id = req.body.user_id;
    const title = req.body.title;
    const content = req.body.content;
    const id = req.body.id;
    const auth_token = req.body.auth_token;

    let url: any;
    let post_format: any;
    if (req.file) {
      post_format = req.file.mimetype;
    } else {
      res.status(400);
    }

    if (req.body.title !== '' && req.body.content !== '') {
      dbObj.validateAuthToken(
        auth_token,
        user_id,
        id,
        async () => {
          dbObj.selectImageNameById(
            id,
            async (currentImageName: string) => {
              const params = {
                Bucket: bucketName,
                Key: currentImageName,
              };
              if (typeof req.file !== 'undefined') {
                const command = new DeleteObjectCommand(params);
                await s3.send(command);
              }
              let imageName: string = '';
              if (typeof req.file !== 'undefined') {
                imageName = randomImageName();
              }

              dbObj.updatePost(
                id,
                title,
                content,
                imageName,
                post_format,
                async () => {
                  if (
                    typeof req.file !== 'undefined' &&
                    typeof req.file.buffer !== 'undefined'
                  ) {
                    // const buffer = await sharp(req.file.buffer)
                    //   .resize({ height: 500, width: 500, fit: 'cover' })
                    //   .toBuffer();

                    const paramsUpdate = {
                      Bucket: bucketName,
                      Key: imageName,
                      Body: req.file.buffer,
                      ContentType: req.file.mimetype,
                    };

                    const commandUpdate = new PutObjectCommand(paramsUpdate);

                    const getObjectParams = {
                      Bucket: bucketName,
                      Key: imageName,
                    };

                    const command = new GetObjectCommand(getObjectParams);
                    url = await getSignedUrl(s3, command, {
                      expiresIn: 3600,
                    });
                    await s3.send(commandUpdate);
                  }
                  res.set('Content-Type', 'application/json');
                  res.status(200);
                  res.write(
                    JSON.stringify({
                      title: title,
                      content: content,
                      imageUrl: url,
                      filetype: post_format,
                    })
                  );
                  res.send();
                },
                (error: any) => {
                  console.error(error);
                  res.status(500);
                }
              );
            },
            (error: any) => {
              console.error(error);
              res.status(500);
            }
          );
        },
        () => {
          res.status(403);
          res.send();
        }
      );
    }
  }
);

app.post('/register', bodyParser.json(), async (req: any, res: any) => {
  const username = req.body.username;
  const password = req.body.password;
  const inviteCode = req.body.inviteCode;

  if (inviteCode === process.env.INVITE_CODE) {
    const saltRounds = 10;
    bcrypt
      .genSalt(saltRounds)
      .then((salt: any) => {
        return bcrypt.hash(password, salt);
      })
      .then((hash: any) => {
        dbObj.createUser(
          username,
          hash,
          (id: number) => {
            //now we can create the auth token
            const authToken = uuidv4();
            dbObj.storeAuthToken(
              id,
              authToken,
              () => {
                res.set('Content-Type', 'application/json');
                res.status(200);
                res.write(
                  JSON.stringify({
                    username: username,
                    authToken: authToken,
                    user_id: id,
                    isLoggedIn: true,
                  })
                );
                res.send();
              },
              () => {
                res.set('Content-Type', 'application/json');
                res.status(200);
                res.write(
                  JSON.stringify({
                    isLoggedIn: false,
                  })
                );
                res.send();
              }
            );
            //if this fails then return back saying they aren't logged in and then redirect to login
          },
          (error: any) => {
            if (error === 'Username Exists') {
              res.status(409);
            } else {
              res.status(500);
            }
            res.send();
          }
        );
      })
      .catch((err: any) => console.error(err.message));
  } else{
    res.status(403);
    res.send();
  }
});

app.post('/login', bodyParser.json(), async (req: any, res: any) => {
  const username = req.body.username;
  const password = req.body.password;

  dbObj.getPassword(
    username,
    (data: any) => {
      bcrypt
        .compare(password, data[0].password)
        .then(() => {
          const authToken = uuidv4();
          dbObj.storeAuthToken(
            data[0].id,
            authToken,
            () => {
              res.set('Content-Type', 'application/json');
              res.status(200);
              res.write(
                JSON.stringify({
                  username: username,
                  authToken: authToken,
                  user_id: data[0].id,
                })
              );
              res.send();
            },
            () => {
              res.set('Content-Type', 'application/json');
              res.status(500);
              res.send();
            }
          );
        })
        .catch((err: any) => console.error(err.message));
    },
    (error: any) => {
      if (error === 'User not found') {
        res.status(404);
      } else {
        res.status(500);
      }
      res.send();
    }
  );
});

app.post('/likepost', bodyParser.json(), async (req: any, res: any) => {
  const post_id = req.body.id;
  const user_id = req.body.user_id;
  dbObj.likePost(
    post_id,
    user_id,
    (likes: number) => {
      res.set('Content-Type', 'application/json');
      res.status(200);
      res.write(
        JSON.stringify({
          user_id: user_id,
          post_id: post_id,
          likes: likes,
        })
      );
      res.send();
    },
    (error: any) => {
      if (error === 'User not found') {
        res.status(404);
      } else {
        res.status(500);
      }
      res.send();
    }
  );
});

app.post('/addcomment', bodyParser.json(), async (req: any, res: any) => {
  const post_id = req.body.post_id;
  const user_id = req.body.user_id;
  const comment = req.body.comment;
  const username = req.body.username;
  const reply_id = req.body.reply_id;

  dbObj.addComment(
    post_id,
    user_id,
    comment,
    username,
    reply_id,
    (id: number) => {
      res.set('Content-Type', 'application/json');
      res.status(200);
      res.write(
        JSON.stringify({
          post_id: post_id,
          comment: comment,
          id: id,
          username: username,
        })
      );
      res.send();
    },
    (error: any) => {
      if (error === 'User not found') {
        res.status(404);
      } else {
        res.status(500);
      }
      res.send();
    }
  );
});

app.get('/comments', bodyParser.json(), async (req: any, res: any) => {
  const post_id = req.query.post_id;

  dbObj.selectComments(
    post_id,
    async (results: any) => {
      res.set('Content-Type', 'application/json');
      res.status(200);
      res.write(JSON.stringify(results));
      res.send();
    },
    (error: any) => {
      console.error(error);
      res.status(500);
    }
  );
});

app.get('/userposts', bodyParser.json(), async (req: any, res: any) => {
  const user_id = req.query.user_id;

  dbObj.returnUserPosts(
    user_id,
    async (results: any) => {
      for (const post of results) {
        const getObjectParams = {
          Bucket: bucketName,
          Key: post.imageName,
        };

        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        post.imageUrl = url;
      }

      res.set('Content-Type', 'application/json');
      res.status(200);
      res.write(JSON.stringify(results));
      res.send();
    },
    (error: any) => {
      console.error(error);
      res.status(500);
    }
  );
});

app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
