module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'ea1650efe80d6adad8677cdd2a618db1'),
  },
});
