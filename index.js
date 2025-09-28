
// --- 1. Import and configure dotenv ---
require('dotenv').config();

// --- 2. Import our other building blocks ---
const express = require('express');
const cors = require('cors');
const redis = require('redis');

// --- 3. Configuration ---
const PORT = 3001;
const RATE_LIMIT = 10;
const TIME_WINDOW = 60; // Time window in seconds

// --- 4. Redis Connection ---
const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error("FATAL ERROR: REDIS_URL is not defined in the environment.");
  process.exit(1);
}

// --- 5. Express App Setup ---
const app = express();
app.use(cors());

// --- 6. The Rate Limiter Middleware ---
// We will pass the redisClient to the middleware
const rateLimiter = (redisClient) => async (req, res, next) => {
  // Safeguard: If redis is not ready, skip the limiter
  if (!redisClient || !redisClient.isReady) {
    console.warn('Redis client not ready, skipping rate limiter.');
    return next();
  }

  const ip = req.ip || req.connection.remoteAddress;

  try {
    const [requestCount] = await redisClient
      .multi()
      .incr(ip)
      .expire(ip, TIME_WINDOW, 'NX')
      .exec();

    console.log(`Request #${requestCount} from IP: ${ip}`);

    if (requestCount > RATE_LIMIT) {
      console.log(`🔴 RATE LIMIT EXCEEDED for IP: ${ip}`);
      return res.status(429).json({
        message: 'Too Many Requests',
        limit: RATE_LIMIT,
        window: `${TIME_WINDOW}s`,
      });
    }

    next();
  } catch (err) {
    console.error('Error in rate limiter middleware:', err);
    next();
  }
};

// --- 7. Main Application Logic ---
const startServer = async () => {
  const redisClient = redis.createClient({ url: REDIS_URL });

  redisClient.on('error', (err) =>
    console.error('❌ Redis Client Error:', err)
  );

  try {
    await redisClient.connect();
    console.log('✅ Successfully connected to Cloud Redis.');

    // --- 7a. API Routes ---
    // Pass the connected client to our middleware
    app.get('/api/resource', rateLimiter(redisClient), (req, res) => {
      res.status(200).json({
        message: 'Success! You have accessed the protected resource.',
      });
    });

    // --- 7b. Start the Server ---
    // Only start the server AFTER the Redis connection is successful
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ Failed to connect to Redis. Server will not start.', err);
    process.exit(1); // Exit if we can't connect to the database
  }
};

// --- 8. Run the application ---
startServer();

