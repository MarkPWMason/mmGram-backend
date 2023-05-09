const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const dbObj = require('./db');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

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
  origin: 'http://localhost:3000',
};

app.use(cors(corsOptions));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get('/', bodyParser.json(), async (req: any, res: any) => {
  dbObj.returnPosts(
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
  console.log('create post body', auth_token)

  dbObj.selectUserIdFromAuthToken(
    auth_token,
    async () => {
      const buffer = await sharp(req.file.buffer)
        .resize({ height: 1920, width: 1080, fit: 'contain' })
        .toBuffer();

      const imageName = randomImageName();
      const params = {
        Bucket: bucketName,
        Key: imageName,
        Body: buffer,
        ContentType: req.file.mimetype,
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      dbObj.createPost(
        title,
        content,
        imageName,
        user_id,
        async (id: any) => {
          const getObjectParams = {
            Bucket: bucketName,
            Key: imageName,
          };

          const command = new GetObjectCommand(getObjectParams);
          const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
          res.status(200);
          res.write(JSON.stringify({ id: id, imageUrl: url }));
          res.send();
        },
        (error: any) => {
          console.error(error);
          res.status(500);
        }
      );
    },
    (error: any) => {
      console.log('error recieved', error)
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
});

app.delete('/deletepost', bodyParser.json(), async (req: any, res: any) => {
  const id = req.body.id;
  const user_id = req.body.user_id;
  const auth_token = req.body.auth_token;

  dbObj.selectUserIdFromAuthToken(auth_token, async (user_idFromDB: number) => {
    if (user_idFromDB !== user_id) {
      res.status(403);
      res.send();
    } else {
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
    }
  });
});

app.post('/updatepost', upload.single('image'), async (req: any, res: any) => {
  const user_id = req.body.user_id;
  const title = req.body.title;
  const content = req.body.content;
  const id = req.body.id;
  const auth_token = req.body.auth_token;

  console.log("body", req.body);

  dbObj.selectUserIdFromAuthToken(
    auth_token,
    async (user_idFromDB: number) => {
      console.log(user_idFromDB, user_id)
      if (user_idFromDB.toString() !== user_id.toString()) {
        res.status(403);
        res.send();
      } else {
        dbObj.selectImageNameById(
          id,
          async (currentImageName: string) => {
            console.log('slect image by name')
            const params = {
              Bucket: bucketName,
              Key: currentImageName,
            };
            const command = new DeleteObjectCommand(params);
            await s3.send(command);

            const imageName = randomImageName();
            dbObj.updatePost(
              id,
              title,
              content,
              imageName,
              async () => {
                console.log('update post')
                const buffer = await sharp(req.file.buffer)
                  .resize({ height: 1920, width: 1080, fit: 'contain' })
                  .toBuffer();

                const paramsUpdate = {
                  Bucket: bucketName,
                  Key: imageName,
                  Body: buffer,
                  ContentType: req.file.mimetype,
                };

                const commandUpdate = new PutObjectCommand(paramsUpdate);

                const getObjectParams = {
                  Bucket: bucketName,
                  Key: imageName,
                };

                const command = new GetObjectCommand(getObjectParams);
                const url = await getSignedUrl(s3, command, {
                  expiresIn: 3600,
                });
                await s3.send(commandUpdate);
                
                res.set('Content-Type', 'application/json');
                res.status(200);
                res.write(
                  JSON.stringify({
                    title: title,
                    content: content,
                    imageUrl: url,
                  })
                );
                res.send();
              },
              (error: any) => {
                console.log('update error')
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
});

app.post('/register', bodyParser.json(), async (req: any, res: any) => {
  const username = req.body.username;
  const password = req.body.password;

  dbObj.createUser(
    username,
    password,
    (id: number) => {
      //now we can create the auth token
      const authToken = uuidv4();
      dbObj.storeAuthToken(
        id,
        authToken,
        () => {
          res.set('Content-Type', 'application/json');
          res.status(200);
          console.log('send res');
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
});

app.post('/login', bodyParser.json(), async (req: any, res: any) => {
  const username = req.body.username;
  const password = req.body.password;
  dbObj.login(
    username,
    password,

    (id: number) => {
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
    },
    (error: any) => {
      if (error === 'User not found') {
        console.log('error 404');
        res.status(404);
      } else {
        console.log('error 500');
        res.status(500);
      }
      res.send();
    }
  );
});

app.listen(5000, () => {
  console.log('Server is running on port 5000');
});
