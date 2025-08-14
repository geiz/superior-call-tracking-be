import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';

export const validatePagination = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { page, limit } = req.query;

  if (page && (isNaN(Number(page)) || Number(page) < 1)) {
    res.status(400).json({ error: 'Invalid page number' });
    return;
  }

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    res.status(400).json({ error: 'Invalid limit (1-100)' });
    return;
  }

  next();
};

export const validateDateRange = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { date_from, date_to } = req.query;

  if (date_from && isNaN(Date.parse(date_from as string))) {
    res.status(400).json({ error: 'Invalid date_from' });
    return;
  }

  if (date_to && isNaN(Date.parse(date_to as string))) {
    res.status(400).json({ error: 'Invalid date_to' });
    return;
  }

  if (date_from && date_to && new Date(date_from as string) > new Date(date_to as string)) {
    res.status(400).json({ error: 'date_from must be before date_to' });
    return;
  }

  next();
};

export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { email, password } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  next();
};

export const validateRegister = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { email, password, first_name, last_name, company_name } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  if (!first_name || !last_name) {
    res.status(400).json({ error: 'First and last name are required' });
    return;
  }

  if (!company_name) {
    res.status(400).json({ error: 'Company name is required' });
    return;
  }

  next();
};

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extractedErrors: Record<string, string[]> = {};
    
    errors.array().forEach((err: ValidationError) => {
      if ('param' in err) {
        if (!extractedErrors[err.param as string]) {
          extractedErrors[err.param as string] = [];
        }
        extractedErrors[err.param as string].push(err.msg);
      }
    });

    res.status(400).json({
      error: 'Validation failed',
      details: extractedErrors,
      message: 'Please check your input and try again'
    });
    return;
  }

  next();
};