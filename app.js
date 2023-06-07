"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const dbObj = require('./db');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const crypto_1 = __importDefault(require("crypto"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const randomImageName = (bytes = 32) => crypto_1.default.randomBytes(bytes).toString('hex');
const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
let s3;
if (typeof accessKey !== 'undefined' &&
    typeof secretAccessKey !== 'undefined') {
    s3 = new client_s3_1.S3Client({
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
app.get('/', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user_id = req.query.user_id;
    dbObj.returnPosts(user_id, (results) => __awaiter(void 0, void 0, void 0, function* () {
        for (const post of results) {
            const getObjectParams = {
                Bucket: bucketName,
                Key: post.imageName,
            };
            const command = new client_s3_1.GetObjectCommand(getObjectParams);
            const url = yield (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
            post.imageUrl = url;
        }
        res.set('Content-Type', 'application/json');
        res.status(200);
        res.write(JSON.stringify(results));
        res.send();
    }), (error) => {
        console.error(error);
        res.status(500);
    });
}));
app.post('/createpost', upload.single('image'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const title = req.body.title;
    const content = req.body.content;
    const user_id = req.body.user_id;
    const auth_token = req.body.auth_token;
    let post_format;
    if (req.file) {
        post_format = req.file.mimetype;
    }
    else {
        res.status(400);
    }
    if (req.body.title !== '' &&
        req.body.content !== '' &&
        typeof post_format !== 'undefined') {
        dbObj.selectUserIdFromAuthToken(auth_token, () => __awaiter(void 0, void 0, void 0, function* () {
            if (typeof req.file !== 'undefined' &&
                typeof req.file.buffer !== 'undefined') {
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
                const command = new client_s3_1.PutObjectCommand(params);
                yield s3.send(command);
                dbObj.createPost(title, content, imageName, user_id, post_format, (id) => __awaiter(void 0, void 0, void 0, function* () {
                    const getObjectParams = {
                        Bucket: bucketName,
                        Key: imageName,
                    };
                    const command = new client_s3_1.GetObjectCommand(getObjectParams);
                    const url = yield (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
                    res.status(200);
                    res.write(JSON.stringify({
                        id: id,
                        imageUrl: url,
                        filetype: post_format,
                    }));
                    res.send();
                }), (error) => {
                    console.error(error);
                    res.status(500);
                });
            }
        }), (error) => {
            if (error === 'Token Expired') {
                res.status(403);
            }
            else if (error === 'User not found') {
                res.status(404);
            }
            else {
                res.status(500);
            }
            res.send();
        });
    }
}));
app.delete('/deletepost', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = req.body.id;
    const user_id = req.body.user_id;
    const auth_token = req.body.auth_token;
    dbObj.validateAuthToken(auth_token, user_id, id, () => __awaiter(void 0, void 0, void 0, function* () {
        dbObj.deletePost(id, (imageName) => __awaiter(void 0, void 0, void 0, function* () {
            const params = {
                Bucket: bucketName,
                Key: imageName,
            };
            const command = new client_s3_1.DeleteObjectCommand(params);
            yield s3.send(command);
            res.set('Content-Type', 'application/json');
            res.status(200);
            res.send();
        }), (error) => {
            console.error(error);
            res.status(500);
        });
    }), () => {
        res.status(403);
        res.send();
    });
}));
app.post('/updatepost', upload.single('image'), bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('body', req.body);
    console.log('file', req.file);
    const user_id = req.body.user_id;
    const title = req.body.title;
    const content = req.body.content;
    const id = req.body.id;
    const auth_token = req.body.auth_token;
    let url;
    let post_format;
    if (req.file) {
        post_format = req.file.mimetype;
    }
    else {
        res.status(400);
    }
    if (req.body.title !== '' && req.body.content !== '') {
        dbObj.validateAuthToken(auth_token, user_id, id, () => __awaiter(void 0, void 0, void 0, function* () {
            dbObj.selectImageNameById(id, (currentImageName) => __awaiter(void 0, void 0, void 0, function* () {
                const params = {
                    Bucket: bucketName,
                    Key: currentImageName,
                };
                if (typeof req.file !== 'undefined') {
                    const command = new client_s3_1.DeleteObjectCommand(params);
                    yield s3.send(command);
                }
                let imageName = '';
                if (typeof req.file !== 'undefined') {
                    imageName = randomImageName();
                }
                dbObj.updatePost(id, title, content, imageName, post_format, () => __awaiter(void 0, void 0, void 0, function* () {
                    if (typeof req.file !== 'undefined' &&
                        typeof req.file.buffer !== 'undefined') {
                        // const buffer = await sharp(req.file.buffer)
                        //   .resize({ height: 500, width: 500, fit: 'cover' })
                        //   .toBuffer();
                        const paramsUpdate = {
                            Bucket: bucketName,
                            Key: imageName,
                            Body: req.file.buffer,
                            ContentType: req.file.mimetype,
                        };
                        const commandUpdate = new client_s3_1.PutObjectCommand(paramsUpdate);
                        const getObjectParams = {
                            Bucket: bucketName,
                            Key: imageName,
                        };
                        const command = new client_s3_1.GetObjectCommand(getObjectParams);
                        url = yield (0, s3_request_presigner_1.getSignedUrl)(s3, command, {
                            expiresIn: 3600,
                        });
                        yield s3.send(commandUpdate);
                    }
                    res.set('Content-Type', 'application/json');
                    res.status(200);
                    res.write(JSON.stringify({
                        title: title,
                        content: content,
                        imageUrl: url,
                        filetype: post_format,
                    }));
                    res.send();
                }), (error) => {
                    console.error(error);
                    res.status(500);
                });
            }), (error) => {
                console.error(error);
                res.status(500);
            });
        }), () => {
            res.status(403);
            res.send();
        });
    }
}));
app.post('/register', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const username = req.body.username;
    const password = req.body.password;
    const inviteCode = req.body.inviteCode;
    if (inviteCode === process.env.INVITE_CODE) {
        const saltRounds = 10;
        bcrypt
            .genSalt(saltRounds)
            .then((salt) => {
            return bcrypt.hash(password, salt);
        })
            .then((hash) => {
            dbObj.createUser(username, hash, (id) => {
                //now we can create the auth token
                const authToken = uuidv4();
                dbObj.storeAuthToken(id, authToken, () => {
                    res.set('Content-Type', 'application/json');
                    res.status(200);
                    res.write(JSON.stringify({
                        username: username,
                        authToken: authToken,
                        user_id: id,
                        isLoggedIn: true,
                    }));
                    res.send();
                }, () => {
                    res.set('Content-Type', 'application/json');
                    res.status(200);
                    res.write(JSON.stringify({
                        isLoggedIn: false,
                    }));
                    res.send();
                });
                //if this fails then return back saying they aren't logged in and then redirect to login
            }, (error) => {
                if (error === 'Username Exists') {
                    res.status(409);
                }
                else {
                    res.status(500);
                }
                res.send();
            });
        })
            .catch((err) => console.error(err.message));
    }
    else {
        res.status(403);
        res.send();
    }
}));
app.post('/login', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const username = req.body.username;
    const password = req.body.password;
    dbObj.getPassword(username, (data) => {
        bcrypt
            .compare(password, data[0].password)
            .then(() => {
            const authToken = uuidv4();
            dbObj.storeAuthToken(data[0].id, authToken, () => {
                res.set('Content-Type', 'application/json');
                res.status(200);
                res.write(JSON.stringify({
                    username: username,
                    authToken: authToken,
                    user_id: data[0].id,
                }));
                res.send();
            }, () => {
                res.set('Content-Type', 'application/json');
                res.status(500);
                res.send();
            });
        })
            .catch((err) => console.error(err.message));
    }, (error) => {
        if (error === 'User not found') {
            res.status(404);
        }
        else {
            res.status(500);
        }
        res.send();
    });
}));
app.post('/likepost', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post_id = req.body.id;
    const user_id = req.body.user_id;
    dbObj.likePost(post_id, user_id, (likes) => {
        res.set('Content-Type', 'application/json');
        res.status(200);
        res.write(JSON.stringify({
            user_id: user_id,
            post_id: post_id,
            likes: likes,
        }));
        res.send();
    }, (error) => {
        if (error === 'User not found') {
            res.status(404);
        }
        else {
            res.status(500);
        }
        res.send();
    });
}));
app.post('/addcomment', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post_id = req.body.post_id;
    const user_id = req.body.user_id;
    const comment = req.body.comment;
    const username = req.body.username;
    const reply_id = req.body.reply_id;
    dbObj.addComment(post_id, user_id, comment, username, reply_id, (id) => {
        res.set('Content-Type', 'application/json');
        res.status(200);
        res.write(JSON.stringify({
            post_id: post_id,
            comment: comment,
            id: id,
            username: username,
        }));
        res.send();
    }, (error) => {
        if (error === 'User not found') {
            res.status(404);
        }
        else {
            res.status(500);
        }
        res.send();
    });
}));
app.get('/comments', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const post_id = req.query.post_id;
    dbObj.selectComments(post_id, (results) => __awaiter(void 0, void 0, void 0, function* () {
        res.set('Content-Type', 'application/json');
        res.status(200);
        res.write(JSON.stringify(results));
        res.send();
    }), (error) => {
        console.error(error);
        res.status(500);
    });
}));
app.get('/userposts', bodyParser.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user_id = req.query.user_id;
    dbObj.returnUserPosts(user_id, (results) => __awaiter(void 0, void 0, void 0, function* () {
        for (const post of results) {
            const getObjectParams = {
                Bucket: bucketName,
                Key: post.imageName,
            };
            const command = new client_s3_1.GetObjectCommand(getObjectParams);
            const url = yield (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
            post.imageUrl = url;
        }
        res.set('Content-Type', 'application/json');
        res.status(200);
        res.write(JSON.stringify(results));
        res.send();
    }), (error) => {
        console.error(error);
        res.status(500);
    });
}));
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
