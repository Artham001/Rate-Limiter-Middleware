// --- 1. Import our building blocks ---
const express = require('express');
const cors = require('cors');
const redis = require('redis');


const PORT = 3001;
const RATE_LIMIT = 10; 
const TIME_WINDOW = 60; 


const REDIS_URL = process.env.REDIS_URL; 

if (!REDIS_URL) {
  console.error("FATAL ERROR: REDIS_URL is not defined in the environment.");
  process.exit(1); // Exit the application if the secret is missing.
}


const app = express();
let redisClient;

(async () => {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    await redisClient.connect();
    console.log('✅ Successfully connected to Cloud Redis.');
  } catch (err) {
    console.error('Could not connect to Cloud Redis:', err);
  }
})();


const rateLimiter = async (req, res, next) => {
  
  console.log('Detected IP:', req.ip); 

  
  const ip = req.ip;

  if (!redisClient || !redisClient.isReady) {
    console.log('Redis client not ready, skipping rate limiter.');
    return next();
  }

  try {
    const [requestCount] = await redisClient
      .multi()
      .incr(ip)
      .expire(ip, TIME_WINDOW, 'NX') 
      .exec();

 
    if (requestCount > RATE_LIMIT) {
      console.log(`🔴 RATE LIMIT EXCEEDED for IP: ${ip}`);
      // Send a "Too Many Requests" response
      return res.status(429).json({ 
        message: 'Too Many Requests. Please try again in a minute.' 
      });
    }

    console.log(`Request #${requestCount} from IP: ${ip}`);
    next(); 
  } catch (err) {
    console.error('Error in rate limiter middleware:', err);
    
    next(); 
  }
};

app.use(cors());

app.use('/api', rateLimiter); 


app.get('/api/resource', (req, res) => {
  res.status(200).json({ message: 'Success! You have accessed the resource.' });
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});



