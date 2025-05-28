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
    origin: [process.env.URL, 'http://localhost:5174'],
    credentials: true,
    optionsSuccessStatus: 200, // fix spelling: "optionSuccessStatus" ➝ "optionsSuccessStatus"
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

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

        // JWT creation endpoint
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log('Creating JWT for user:', user);
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

        // Health check
        app.get('/', (req, res) => {
            res.send('safePing server is running');
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB.");
    } catch (err) {
        console.error("MongoDB connection failed:", err);
    } finally {
        // await client.close(); // ❗ Consider removing this in dev, see note below
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
