/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Conditionally allow framing for Theia/iframe routes if needed
  // For standard API routes, deny it
  const path = req.path;
  if (!path.startsWith('/api/workspaces/') || !path.includes('/theia')) {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // For API responses, avoid caching
  if (path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
};

module.exports = securityHeaders;
