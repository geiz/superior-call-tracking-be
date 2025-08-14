import jwt, { SignOptions, Secret, Algorithm, VerifyOptions } from 'jsonwebtoken';

// Define a proper type for the JWT configuration
interface JwtConfig {
  secret: string;
  expiresIn: string | number | undefined;
  algorithm?: Algorithm;
  issuer?: string;
  audience?: string;
}

const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
console.log('JWT Config - Secret configured:', process.env.JWT_SECRET ? 'Yes (from env)' : 'No (using default)');
console.log('JWT Config - Secret length:', jwtSecret.length);

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set in environment variables, using default (INSECURE)');
}


// Store the raw configuration
const config: JwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRE || '30d',
  algorithm: 'HS256' as Algorithm,
  issuer: 'CRC-Backend',
  audience: 'CRC-Frontend'
};


// Export the config for use in other files if needed
export const jwtConfig = config;


console.log('JWT Config - Settings:', {
  expiresIn: config.expiresIn,
  algorithm: config.algorithm,
  issuer: config.issuer,
  audience: config.audience
});

// Sign token with proper typing
export const signToken = (payload: object): string => {
  // Create options object with proper typing
  const signOptions: SignOptions = {
      expiresIn: config.expiresIn as SignOptions['expiresIn'],
      algorithm: config.algorithm,
      issuer: config.issuer,
      audience: config.audience
    };
    
     console.log('JWT Sign - Creating token for:', { 
      ...payload,
      options: signOptions 
    });

    // Sign the token
    const token = jwt.sign(
      payload,
      config.secret,
      signOptions
    );
    
    console.log('JWT Sign - Token created, length:', token.length);
    
    // Immediately verify the token we just created to ensure it's valid
    try {
      const verified = verifyToken(token);
      console.log('JWT Sign - Self-verification successful (verified): ', verified);
    } catch (selfVerifyError: any) {
      console.error('JWT Sign - Self-verification failed!', selfVerifyError.message);
    }
  
  // Sign the token
  return token;
};

// Verify token with options
export const verifyToken = (token: string): any => {
  const verifyOptions: VerifyOptions = {
    algorithms: [config.algorithm!],
    issuer: config.issuer,
    audience: config.audience
  };
  
  return jwt.verify(token, config.secret, verifyOptions);
};

// Decode token without verification
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};

// Create refresh token with longer expiry
export const signRefreshToken = (payload: object): string => {
  const refreshOptions: SignOptions = {
    expiresIn: '90d', // Longer expiry for refresh tokens
    algorithm: config.algorithm,
    issuer: config.issuer,
    audience: config.audience
  };
  
  return jwt.sign(
    payload,
    config.secret,
    refreshOptions
  );
};

// Verify if token is expired
export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = decodeToken(token) as any;
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch {
    return true;
  }
};

// Get token expiry time
export const getTokenExpiry = (token: string): Date | null => {
  try {
    const decoded = decodeToken(token) as any;
    if (!decoded || !decoded.exp) return null;
    
    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
};