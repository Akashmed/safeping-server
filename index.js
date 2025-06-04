const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

// Middleware
const corsOptions = {
    origin: [process.env.URL, 'http://localhost:5173'],
    credentials: true,
    optionsSuccessStatus: 200, // fix spelling: "optionSuccessStatus" ➝ "optionsSuccessStatus"
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = process.env.URL
    ? process.env.URL.split(',')
    : ['http://localhost:5173'];

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
    },
});


// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wwbu2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});



async function run() {
    try {
        await client.connect();
        const usersCollection = client.db('safePingDB').collection('users');


        // Socket.io connection
        const userSocketMap = new Map();

        io.on('connection', (socket) => {
            console.log('A user connected:', socket.id);

            //Handle institution connection
            socket.on("institutionConnected", async ({ institutionId }) => {
                userSocketMap.set(institutionId, {
                    socketId: socket.id,
                    activeChatRecipientId: null // Institution is not actively chatting with anyone yet
                });
                console.log(`Institution ${institutionId} connected with socket ID: ${socket.id}`);
            });

            socket.on("userConnected", async ({ userId, institutionId }) => {
                userSocketMap.set(userId, {
                    socketId: socket.id,
                    activeChatRecipientId: institutionId // The user is chatting with this institution
                });
                const senderOnline = userSocketMap.get(userId);
                const helperOnline = userSocketMap.get(institutionId);

                if (helperOnline) {
                    io.to(helperOnline.socketId).emit('helpRequest', { userId, time: new Date() });
                }

                // if (helperOnline && senderOnline) {
                //     io.to(senderOnline.socketId).emit('userOnline', { userId });
                // };

                // if (helperOnline && senderOnline) {
                //     io.to(helperOnline.socketId).emit('userOnline', { userId });
                // };

                try {
                    //mongodb integration
                } catch (error) {
                    console.error("Error handling undelivered messages:", error);
                }
            });

            socket.on('helpAccepted', async ({ userId, institutionId }) => {
                const userData = userSocketMap.get(userId);
                if (userData) {
                    io.to(userData.socketId).emit('helpAccepted', { institutionId, time: new Date() });
                }
            });



            socket.on("clientDisconnected", ({ clientId }) => {
                userSocketMap.delete(clientId);
                io.emit("userOffline", { clientId });
            });

        });

        // JWT verification middleware
        const verifyToken = (req, res, next) => {
            const token = req.cookies?.token;
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.user = decoded;
                next();
            });
        };


        // JWT creation endpoint
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            });

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            }).send({ success: true });
        });

        // Logout endpoint
        app.get('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            }).send({ success: true });
        });

        // Save user to DB
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email };
            const options = { upsert: true };
            const updateDoc = { $set: user };

            const isExist = await usersCollection.findOne(query);
            if (isExist) {
                return res.send(isExist);
            }

            const result = await usersCollection.updateOne(query, updateDoc, options);
            res.send(result);
        });

        // Get all users
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        })

        // Get user by email
        app.get('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user) {
                return res.status(404).send({ message: 'User not found' });
            }
            res.send(user);
        });

        // update user
        app.patch('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email };
            const updateDoc = { $set: user };

            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        });

        // await client.db("admin").command({ ping: 1 });
        // console.log("Successfully connected to MongoDB.");
    } catch (err) {
        console.error("MongoDB connection failed:", err);
    } finally {
        // await client.close(); // ❗ Consider removing this in dev, see note below
    }
}
run().catch(console.dir);

// Health check
app.get('/', (req, res) => {
    res.send('safePing server is running');
});

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
