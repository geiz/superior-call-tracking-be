import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import redisClient from '../config/redis';


const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  duration: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60
});

export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await rateLimiter.consume(req.ip ?? '0.0.0.0');
    next();
  } catch (rejRes) {
    const retry = (rejRes as RateLimiterRes).msBeforeNext;
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.round(retry / 1000) || 60
    });
  }
};



export { rateLimiterMiddleware as rateLimiter };