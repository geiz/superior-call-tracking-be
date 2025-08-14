import { Request as ExpressRequest, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// More aggressive rate limiting for tracking endpoints
const trackingRateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
  blockDuration: 60 * 5 // Block for 5 minutes if exceeded
});

export const trackingRateLimiterMiddleware = async (
  req: ExpressRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Use API key + IP for rate limiting key
    const key = `${req.body.api_key || 'unknown'}-${req.ip}`;
    await trackingRateLimiter.consume(key);
    next();
  } catch (rejRes: any) {
    res.status(429).json({
      error: 'Too many tracking requests',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 300
    });
  }
};