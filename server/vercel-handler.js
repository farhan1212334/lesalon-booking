const { handleServerlessRequest } = require('./index');

module.exports = (req, res) => {
  if (req.url && !req.url.startsWith('/api/')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  return handleServerlessRequest(req, res);
};
